import SwiftUI

/// A list of articles. On Mac: the page header, the list as one bordered box, and the reader in a
/// pane on the right with the item's actions along its top. On iPhone the reader is pushed.
struct ItemListView<Tools: View>: View {
  let title: String
  let list: ItemList
  let query: String
  /// Swipe actions: the first goes on the leading edge, the rest on the trailing edge.
  let leading: ItemAction?
  let trailing: [ItemAction]
  var showsUnseen = false
  var subscriptionName: (LibraryItem) -> String? = { _ in nil }
  var onOpen: (LibraryItem) -> Void = { _ in }
  var emptyTitle = "Nothing here"
  var emptyMessage = ""
  /// Search box text, for lists that can be searched.
  var search: Binding<String>?
  /// Already pushed inside another NavigationStack (e.g. Home's), so it doesn't make its own.
  var embedded = false
  /// What the count in the header counts, e.g. "unseen" for "8 unseen".
  var countLabel: String?
  /// Bands for Today, Yesterday and so on, for lists in date order.
  var groupsByDay = false
  /// The Wire: dense rows by the hour, and new posts typed in as they arrive.
  var wire = false
  /// Keeps checking for new items while you look, offering them as "N new" (Feeds).
  var live = false
  /// Called when a search is submitted.
  var onSearch: () -> Void = {}
  /// The mono line above the title.
  var folio: FolioContent?
  /// Controls for this list's header (or toolbar on iPhone).
  @ViewBuilder var tools: () -> Tools

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isActivePage) private var isActivePage
  @Environment(\.scenePhase) private var scenePhase
  @State private var selection: LibraryItem?
  @Namespace private var unfold
  @State private var toaster = Toaster()
  @State private var capturing = false
  #if os(macOS)
  @FocusState private var listFocused: Bool
  @SceneStorage("readerFocus") private var readerFocus = false
  @AppStorage("readerListWidth") private var listWidth = 340.0
  #else
  @Environment(\.horizontalSizeClass) private var sizeClass
  /// A full-width iPad gets the iPad layout: the article beside the list when there's room.
  private var padLayout: Bool { sizeClass == .regular && !embedded }
  /// The iPad page's width; below 700 points (Slide Over, a narrow split) articles are pushed.
  @State private var padWidth: CGFloat = .infinity
  /// Where the open article sat in the list, to step on from once a reload has dropped it.
  @State private var selectedIndex = 0
  /// The article opens beside the list, as on the Mac, rather than being pushed.
  private var splits: Bool { padLayout && padWidth >= 700 }
  #endif

  private var detail: String? {
    guard let countLabel, let total = list.total else { return nil }
    return "\(total) \(countLabel)"
  }

  var body: some View {
    #if os(macOS)
    GeometryReader { geometry in
      let split = !readerFocus && geometry.size.width >= 800 && !list.visibleItems.isEmpty
      let showList = split || selection == nil
      let showReader = split || selection != nil
      let width = split || readerFocus ? min(max(listWidth, 300), min(420, geometry.size.width - 420)) : geometry.size.width
      HStack(spacing: 0) {
        macList
          .frame(width: width)
          .transaction { $0.animation = nil }
          .frame(width: showList ? width : 0, alignment: .leading)
          .clipped()
          .opacity(showList ? 1 : 0)
          .allowsHitTesting(showList)
          .disabled(!showList)
          .accessibilityElement(children: showList ? .contain : .ignore)
          .accessibilityHidden(!showList)
        Group {
          if split {
            Rectangle().fill(Color.stLine)
              .frame(width: 5)
              .contentShape(Rectangle())
              .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("readerLayout"))
                .onChanged { value in listWidth = min(max(value.location.x, 300), min(420, geometry.size.width - 420)) })
              .accessibilityLabel("Article list width")
              .accessibilityAdjustableAction { direction in
                listWidth = min(max(listWidth + (direction == .increment ? 20 : -20), 300), 420)
              }
              .help("Drag to resize the article list")
          }
        }
        readerPane
          .frame(width: showReader ? max(0, geometry.size.width - (showList ? width : 0) - (split ? 5 : 0)) : 0)
          .clipped()
          .opacity(showReader ? 1 : 0)
          .allowsHitTesting(showReader)
          .accessibilityElement(children: showReader ? .contain : .ignore)
          .accessibilityHidden(!showReader)
      }
      .coordinateSpace(name: "readerLayout")
    }
    .animation(StashMotion.layout(reduceMotion: reduceMotion), value: readerFocus)
    .background(Color.stPage)
    .navigationTitle(title)
    .toolbar(removing: .title)
    .toasts(toaster)
    .task(id: query) { await list.load(query) }
    .task(id: watchKey) { await watchForNew() }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await checkNow() } } }
    .onChange(of: isActivePage) { _, active in if active { Task { await checkNow() } } }
    // ⌘R checks for new posts now (the header's Refresh button does the same).
    .background {
      if live {
        Button("Refresh") { Task { await refresh() } }
          .keyboardShortcut("r", modifiers: .command)
          .opacity(0)
          .frame(width: 0, height: 0)
          .accessibilityHidden(true)
      }
    }
    .onChange(of: list.items) { _, items in
      if let selected = selection, let updated = items.first(where: { $0.id == selected.id }) { selection = updated }
    }
    .onReceive(NotificationCenter.default.publisher(for: .stashToggleFocus)) { _ in
      if isActivePage && selection != nil { readerFocus.toggle() }
    }
    .linkCapture(isPresented: $capturing)
    #else
    if embedded {
      pushingList
    } else if padLayout {
      padSplit
    } else {
      NavigationStack { pushingList }
    }
    #endif
  }

  // MARK: Mac

  #if os(macOS)
  private var macList: some View {
    VStack(spacing: 0) {
      PageHeader(title: title, detail: detail, accentDetail: showsUnseen, folio: folio) {
        if live {
          Button { Task { await refresh() } } label: {
            Label("Refresh", systemImage: "arrow.clockwise")
          }
          .buttonStyle(.text)
          .disabled(list.isLoading)
          .help("Check for new posts (⌘R). Stash also checks every couple of minutes.")
        }
      }
      VStack(alignment: .leading, spacing: 12) {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 8) { tools(); Spacer(minLength: 0) }
          VStack(alignment: .leading, spacing: 8) { tools() }
        }
        if let search {
          PageSearchField(text: search, onSubmit: onSearch, expands: true)
            .frame(maxWidth: .infinity)
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 16)
      ScrollViewReader { proxy in
        ScrollView {
          Group {
            if list.visibleItems.isEmpty {
              emptyState
            } else {
              ListBox { rows }
            }
          }
          .pageWidth()
          .padding(.bottom, 40)
        }
        .scrollContentBackground(.hidden)
        .overlay(alignment: .top) {
          NewItemsPill(count: list.waiting.count) {
            list.showWaiting()
            if let first = list.visibleItems.first {
              withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(first.id, anchor: .top) }
            }
          }
        }
        .focusable()
        .focused($listFocused)
        .focusEffectDisabled()
        .onKeyPress(.downArrow) { step(1) }
        .onKeyPress(.upArrow) { step(-1) }
        .onKeyPress(.delete) { performOnSelection(trailing.first) }
        .onKeyPress(.deleteForward) { performOnSelection(trailing.first) }
        .onKeyPress("s") { performOnSelection(leading == .save ? .save : nil) }
        .onKeyPress(.return) {
          guard let url = selection?.originalURL else { return .ignored }
          NSWorkspace.shared.open(url)
          return .handled
        }
        .onChange(of: selection?.id) { _, _ in
          guard let item = selection else { return }
          open(item)
          withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(item.id) }
        }
      }
    }
  }

  /// The reader beside the list, with the item's actions and its place in the list on top.
  @ViewBuilder
  private var readerPane: some View {
    if let selection {
      ReaderScreen(
        item: selection, actions: readerActions(for: selection), perform: perform,
        embedded: true, paneControls: true,
        onBack: { self.selection = nil; readerFocus = false },
        onFocus: { readerFocus.toggle() }
      )
      .modifier(UnfoldIn())
      .id(selection.id)
    } else {
      EmptyBox(message: "Pick something to read", systemImage: "text.alignleft", boxed: false)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.stSurface)
    }
  }
  #endif

  // MARK: iPhone

  #if os(iOS)
  private var pushingList: some View {
    listColumn
      .navigationDestination(item: $selection) { item in
        ReaderScreen(item: item, actions: readerActions(for: item), perform: perform)
          .unfoldDestination(item, in: unfold)
      }
  }

  /// iPad: the list on the left and the article on the right, each with its own toolbar. Built
  /// from two stacks side by side rather than a NavigationSplitView, which inside the app's own
  /// sidebar can collapse to the list alone and never show the article.
  private var padSplit: some View {
    Group {
      if splits {
        HStack(spacing: 0) {
          NavigationStack {
            ScrollViewReader { proxy in
              listColumn
                .onChange(of: selection?.id) { _, id in
                  guard let id else { return }
                  withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(id) }
                }
            }
          }
          .frame(width: min(max(padWidth * 0.4, 320), 440))
          Rectangle().fill(Color.stLine).frame(width: 1).ignoresSafeArea()
          NavigationStack { padReader }
            .frame(maxWidth: .infinity)
        }
      } else {
        NavigationStack { pushingList }
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { padWidth = $0 }
    .background { splitShortcuts }
    // The list may reload under the open article: keep it in step. An article that drops out
    // of the list (seen, in Unseen) stays open; a different list or filter closes it.
    .onChange(of: list.items) { _, items in
      if let selected = selection, let updated = items.first(where: { $0.id == selected.id }) { selection = updated }
    }
    .onChange(of: query) { _, _ in if splits { selection = nil } }
    .onChange(of: selection?.id) { _, id in
      if let id, let index = list.visibleItems.firstIndex(where: { $0.id == id }) { selectedIndex = index }
    }
    .modifier(ListToasts(toaster: toaster, shown: splits))
  }

  /// The open article beside the list, or a prompt to pick one.
  @ViewBuilder
  private var padReader: some View {
    if let selection {
      ReaderScreen(
        item: selection, actions: readerActions(for: selection), perform: perform,
        onBack: { self.selection = nil }
      )
      .id(selection.id)
    } else if !list.visibleItems.isEmpty {
      EmptyBox(message: "Pick an article. It opens here, beside the list.", systemImage: "doc.text", boxed: false)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.stPage)
    } else {
      Color.stPage
    }
  }

  /// ⌥↓ and ⌥↑ move through the list with the article open beside it. With ⌥, so the arrow keys
  /// still scroll the article and typing a note never triggers them.
  private var splitShortcuts: some View {
    Group {
      Button("Next Article") { move(1) }.keyboardShortcut(.downArrow, modifiers: .option)
      Button("Previous Article") { move(-1) }.keyboardShortcut(.upArrow, modifiers: .option)
    }
    .opacity(0)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .disabled(!isActivePage || !splits)
  }

  private func move(_ offset: Int) {
    let items = list.visibleItems
    guard !items.isEmpty else { return }
    let index: Int
    if let selected = selection, let current = items.firstIndex(where: { $0.id == selected.id }) {
      index = current + offset
    } else if selection != nil {
      // The open article has left the list, so the one after it now sits in its place.
      index = min(offset > 0 ? selectedIndex : selectedIndex - 1, items.count - 1)
    } else {
      index = 0
    }
    guard items.indices.contains(index) else { return }
    selection = items[index]
    open(items[index])
  }

  private var listColumn: some View {
    List { rows }
      .stashList()
      .overlay { if list.visibleItems.isEmpty { emptyState } }
      .overlay(alignment: .top) {
        NewItemsPill(count: list.waiting.count) { withAnimation { list.showWaiting() } }
      }
      .modifier(ListToasts(toaster: toaster, shown: !splits))
      .linkCapture(isPresented: $capturing)
      .stashPage(title, detail: detail, accentDetail: showsUnseen, folio: folio) { tools() }
      .modifier(Searchable(text: search, onSearch: onSearch))
      .refreshable { await refresh() }
      .task(id: query) { await list.load(query) }
      .task(id: watchKey) { await watchForNew() }
      .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await checkNow() } } }
  }
  #endif

  // MARK: Rows

  @ViewBuilder
  private var rows: some View {
    if wire {
      ForEach(hourGroups(list.visibleItems), id: \.label) { group in
        HourMark(label: group.label).stashListRow()
        ForEach(group.items) { item in row(item) }
      }
    } else if groupsByDay {
      ForEach(groups(list.visibleItems), id: \.label) { group in
        DayBand(label: group.label)
          .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
          .stashListRow()
        ForEach(group.items) { item in row(item) }
      }
    } else {
      ForEach(list.visibleItems) { item in row(item) }
    }
    if let error = list.error, !list.items.isEmpty {
      HStack {
        Text(error).font(.stSmall).foregroundStyle(Color.stMuted)
        Spacer()
        Button("Try again") { Task { await list.reload(query, preservingItems: true) } }.buttonStyle(.text)
      }
      .padding(12).stashListRow()
    }
    if list.isLoading && !list.items.isEmpty {
      HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
        .padding(.vertical, 10)
        .stashListRow()
    }
  }

  private func row(_ item: LibraryItem) -> some View {
    rowBase(item)
      // The Wire types its new rows in; other lists drop them in one after another.
      .arrival(wire ? nil : list.arrivals[item.id], order: arrivalOrder(item))
      .id(item.id)
      #if os(macOS)
      .transition(.fold(reduceMotion: reduceMotion))
      #endif
      .stashListRow()
      .itemSwipes(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .itemMenu(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .task { await list.loadMore(after: item) }
  }

  /// Where a just-arrived item sits among the new ones at the top.
  private func arrivalOrder(_ item: LibraryItem) -> Int {
    guard list.arrivals[item.id] != nil else { return 0 }
    return list.visibleItems.prefix(30).firstIndex(of: item) ?? 0
  }

  @ViewBuilder
  private func rowBase(_ item: LibraryItem) -> some View {
    if wire {
      #if os(macOS)
      WireRow(
        item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item),
        arrived: list.arrivals[item.id], selected: selection?.id == item.id
      )
      .contentShape(Rectangle())
      .onTapGesture {
        listFocused = true
        selection = item
      }
      #else
      Button { selection = item; open(item) } label: {
        WireRow(
          item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item),
          arrived: list.arrivals[item.id], selected: splits && selection?.id == item.id
        )
      }
      .buttonStyle(.plain)
      .hoverEffect(.highlight)
      .unfoldSource(item, in: unfold)
      #endif
    } else {
      cardRow(item)
    }
  }

  @ViewBuilder
  private func cardRow(_ item: LibraryItem) -> some View {
    #if os(macOS)
    ItemRow(
      item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item),
      selected: selection?.id == item.id, divider: item.id != list.visibleItems.last?.id
    )
    .onTapGesture { listFocused = true; selection = item }
    .accessibilityElement(children: .combine)
    .accessibilityRepresentation {
      Button { listFocused = true; selection = item } label: {
        Text("\(item.title), \(subscriptionName(item) ?? item.source)")
      }
      .accessibilityValue(item.progress > 0.02 ? "\(Int(item.progress * 100)) percent read" : "Unread")
      .accessibilityAddTraits(selection?.id == item.id ? .isSelected : [])
    }
    .accessibilityAddTraits(.isButton)
    .accessibilityAddTraits(selection?.id == item.id ? .isSelected : [])
    .accessibilityAction { selection = item }
    #else
    Button { selection = item; open(item) } label: {
      ItemRow(
        item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item),
        selected: splits && selection?.id == item.id
      )
    }
    .buttonStyle(.plain)
    .hoverEffect(.highlight)
    .unfoldSource(item, in: unfold)
    #endif
  }

  @ViewBuilder
  private var emptyState: some View {
    if let error = list.error {
      EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark") {
        Button("Try again") { Task { await list.reload(query) } }
      }
    } else if list.isLoading {
      ListBox { SkeletonRows() }
    } else {
      if let search, !search.wrappedValue.isEmpty {
        EmptyBox(title: "No results", message: "Try another search or clear it to see your articles.") {
          Button("Clear search") { search.wrappedValue = ""; onSearch() }
        }
      } else if emptyTitle == "Nothing saved" {
        EmptyBox(title: "Nothing saved", message: "Save an article from your feeds or add a link.", boxed: false) {
          Button("Add link") { capturing = true }
          Button("Browse feeds") { NotificationCenter.default.post(name: .stashBrowseFeeds, object: nil) }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
      } else {
        EmptyBox(title: emptyTitle, message: emptyMessage)
      }
    }
  }

  /// "15:00" for each hour today; earlier days say which day too.
  private func hourGroups(_ items: [LibraryItem]) -> [(label: String, items: [LibraryItem])] {
    var result: [(label: String, items: [LibraryItem])] = []
    for item in items {
      let label = hourMark(item.date)
      if let index = result.firstIndex(where: { $0.label == label }) {
        result[index].items.append(item)
      } else {
        result.append((label, [item]))
      }
    }
    return result
  }

  private func groups(_ items: [LibraryItem]) -> [(label: String, items: [LibraryItem])] {
    var result: [(label: String, items: [LibraryItem])] = []
    for item in items {
      let label = dayGroup(item.date)
      if let index = result.firstIndex(where: { $0.label == label }) {
        result[index].items.append(item)
      } else {
        result.append((label, [item]))
      }
    }
    return result
  }

  // MARK: Doing things

  private func readerActions(for item: LibraryItem) -> [ItemAction] {
    [leading].compactMap { $0 } + trailing
  }

  /// On the Wire, checks for new posts every minute while the list is open.
  /// What the new-item check depends on: nothing for lists that don't check.
  private var watchKey: String? {
    guard live || wire else { return nil }
    return "\(query)|\(wire)|\(isActivePage)"
  }

  /// Checks for new items every minute on the Wire (typing them straight in) and every two
  /// minutes otherwise (held back as "N new"), while the page is the one showing. The
  /// server itself checks every feed every five minutes.
  private func watchForNew() async {
    guard isActivePage else { return }
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(wire ? 60 : 120))
      guard !Task.isCancelled else { return }
      await checkNow()
    }
  }

  private func checkNow() async {
    guard (live || wire), isActivePage else { return }
    if wire { await list.pullNew(query) } else { await list.checkNew(query) }
  }

  /// Refresh: shows anything waiting and reloads the list, keeping your place.
  private func refresh() async {
    list.showWaiting()
    await list.reload(query, preservingItems: true)
  }

  private func open(_ item: LibraryItem) {
    list.markSeen(item)
    onOpen(item)
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    // Move on to the next item, as the web app does.
    let items = list.visibleItems
    if action.removesItem && selection?.id == item.id {
      #if os(macOS)
      let next = true
      #else
      let next = splits
      #endif
      if next, let index = items.firstIndex(of: item) {
        let rest = items.dropFirst(index + 1)
        selection = rest.first ?? items.prefix(index).last
      } else {
        selection = nil
      }
    }
    runItemAction(
      action, item, toaster: toaster,
      remove: { list.remove(item) },
      restore: { list.restore(item); selection = item },
      refresh: {
        if action == .markSeen || action == .openOriginal { list.markSeen(item) } else { await list.reload(query) }
      }
    )
  }

  #if os(macOS)
  /// Up and down arrows move the selection through the list.
  private func step(_ offset: Int) -> KeyPress.Result {
    let items = list.visibleItems
    guard !items.isEmpty else { return .ignored }
    guard let current = selection, let index = items.firstIndex(of: current) else {
      selection = offset > 0 ? items.first : items.last
      return .handled
    }
    let next = min(max(index + offset, 0), items.count - 1)
    selection = items[next]
    return .handled
  }

  private func performOnSelection(_ action: ItemAction?) -> KeyPress.Result {
    guard let action, let item = selection else { return .ignored }
    perform(action, item)
    return .handled
  }
  #endif
}

#if os(iOS)
/// The list's toasts, unless the iPad split shows them across both columns instead.
private struct ListToasts: ViewModifier {
  let toaster: Toaster
  let shown: Bool

  func body(content: Content) -> some View {
    if shown { content.toasts(toaster) } else { content }
  }
}

private struct Searchable: ViewModifier {
  let text: Binding<String>?
  let onSearch: () -> Void

  func body(content: Content) -> some View {
    if let text {
      content
        .searchable(text: text, prompt: "Search")
        .onSubmit(of: .search, onSearch)
    } else {
      content
    }
  }
}
#endif
