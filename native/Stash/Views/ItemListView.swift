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
  /// Called when a search is submitted.
  var onSearch: () -> Void = {}
  /// The mono line above the title.
  var folio: FolioContent?
  /// Controls for this list's header (or toolbar on iPhone).
  @ViewBuilder var tools: () -> Tools

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var selection: LibraryItem?
  @Namespace private var unfold
  @State private var toaster = Toaster()
  #if os(macOS)
  @FocusState private var listFocused: Bool
  #endif

  private var detail: String? {
    guard let countLabel, let total = list.total else { return nil }
    return "\(total) \(countLabel)"
  }

  var body: some View {
    #if os(macOS)
    HSplitView {
      macList
        .frame(minWidth: 400, maxWidth: .infinity)
      readerPane
        .frame(minWidth: 420, idealWidth: 520, maxWidth: 860, maxHeight: .infinity)
    }
    .background(Color.stPage)
    .navigationTitle(title)
    .toolbar(removing: .title)
    .toasts(toaster)
    .task(id: query) { await list.load(query) }
    .task(id: wire ? query : nil) { await watchWire() }
    #else
    if embedded {
      pushingList
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
        tools()
        if let search {
          PageSearchField(text: search, onSubmit: onSearch)
        }
      }
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
        .onChange(of: selection) { _, item in
          guard let item else { return }
          open(item)
          withAnimation(.snappy(duration: 0.15)) { proxy.scrollTo(item.id) }
        }
      }
    }
  }

  /// The reader beside the list, with the item's actions and its place in the list on top.
  @ViewBuilder
  private var readerPane: some View {
    if let selection {
      VStack(spacing: 0) {
        HStack(spacing: 8) {
          let actions = readerActions(for: selection)
          ForEach(Array(actions.enumerated()), id: \.offset) { index, action in
            Button { perform(action, selection) } label: {
              Label(action.title(for: selection), systemImage: action.systemImage)
            }
            .buttonStyle(TextButtonStyle(prominent: index == 0))
          }
          if let url = selection.originalURL {
            Button { NSWorkspace.shared.open(url) } label: {
              Label("Open original", systemImage: "arrow.up.right.square")
            }
            .buttonStyle(.text)
          }
          Spacer(minLength: 0)
          if let index = list.visibleItems.firstIndex(of: selection) {
            Text("\(index + 1) of \(list.total ?? list.visibleItems.count)")
              .font(.mono(11))
              .monospacedDigit()
              .foregroundStyle(Color.stMuted)
          }
        }
        .padding(.horizontal, 20)
        .frame(height: 52)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }

        ReaderScreen(item: selection, actions: readerActions(for: selection), perform: perform, embedded: true)
          .modifier(UnfoldIn())
          .id(selection.id)
      }
      .background(Color.stSurface)
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
    List { rows }
      .stashList()
      .overlay { if list.visibleItems.isEmpty { emptyState } }
      .toasts(toaster)
      .stashPage(title, detail: detail, accentDetail: showsUnseen, folio: folio) { tools() }
      .modifier(Searchable(text: search, onSearch: onSearch))
      .refreshable { await list.reload(query) }
      .task(id: query) { await list.load(query) }
      .task(id: wire ? query : nil) { await watchWire() }
      .navigationDestination(item: $selection) { item in
        ReaderScreen(item: item, actions: readerActions(for: item), perform: perform)
          .unfoldDestination(item, in: unfold)
      }
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
    if list.isLoading && !list.items.isEmpty {
      HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
        .padding(.vertical, 10)
        .stashListRow()
    }
  }

  private func row(_ item: LibraryItem) -> some View {
    rowBase(item)
      .id(item.id)
      #if os(macOS)
      .transition(.fold(reduceMotion: reduceMotion))
      #endif
      .stashListRow()
      .itemSwipes(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .itemMenu(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .task { await list.loadMore(after: item) }
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
          arrived: list.arrivals[item.id]
        )
      }
      .buttonStyle(.plain)
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
    .onTapGesture {
      listFocused = true
      selection = item
    }
    #else
    Button { selection = item; open(item) } label: {
      ItemRow(item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item))
    }
    .buttonStyle(.plain)
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
      EmptyBox(title: emptyTitle, message: emptyMessage)
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
  private func watchWire() async {
    guard wire else { return }
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(60))
      guard !Task.isCancelled else { return }
      await list.pullNew(query)
    }
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
      if let index = items.firstIndex(of: item) {
        let rest = items.dropFirst(index + 1)
        selection = rest.first ?? items.prefix(index).last
      }
      #else
      selection = nil
      #endif
    }
    runItemAction(
      action, item, toaster: toaster,
      remove: { list.remove(item) },
      restore: { list.restore(item) },
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
