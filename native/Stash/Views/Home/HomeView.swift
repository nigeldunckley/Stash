import SwiftUI

/// Continue an article or video, browse new arrivals, and open saved articles.
struct HomeView: View {
  /// Switches to another part of the app, e.g. Feeds or The Edition.
  let go: (AppSection) -> Void

  @Environment(EditionModel.self) private var edition
  @Environment(PlayerController.self) private var player
  @State private var feeds = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var searching = false
  @State private var videos: [LibraryItem] = []
  @State private var upNext: [LibraryItem] = []
  @State private var continuingVideos: [LibraryItem] = []
  @State private var upNextError: String?
  @State private var contentWidth: CGFloat = 1100
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isActivePage) private var isActivePage
  @Environment(\.scenePhase) private var scenePhase
  @State private var leadTitle: String?
  /// The item open in the preview, and which list it came from, for moving up and down.
  @State private var peek: LibraryItem?
  @State private var peekSource: PeekSource = .feeds
  /// Items and searches opened full size from Home.
  @State private var path = NavigationPath()
  @State private var capturing = false
  @State private var capture = ""
  @FocusState private var captureFocused: Bool
  #if os(macOS)
  @State private var selectedID: String?
  @FocusState private var listFocused: Bool
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @Environment(\.autoHiddenSidebar) private var autoHiddenSidebar
  #endif
  @State private var toaster = Toaster()

  private enum PeekSource { case feeds, videos, upNext, continuing }

  private static let feedLimit = 6
  /// The widest the page's content gets, as on the web.
  private static let maxWidth: CGFloat = 1180

  private var feedsQuery: String {
    "in:following use:folders -type:video -is:seen sort:published-desc"
  }

  /// "MONDAY 19 OCTOBER · 64 FEEDS · CHECKED 2 MIN AGO", and the day of Stash on the right.
  private static var folio: FolioContent {
    FolioContent(
      items: [FolioContent.today, "\(FolioData.shared.feeds) \(FolioData.shared.feeds == 1 ? "FEED" : "FEEDS")"],
      checked: true,
      right: FolioContent.volumeAndDay
    )
  }

  private static let videosQuery = "in:following use:folders type:video -is:seen sort:published-desc"

  var body: some View {
    NavigationStack(path: $path) {
      content
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { contentWidth = $0 }
        .background(Color.stPage)
        .navigationTitle("Home")
        #if os(macOS)
        .toolbar(removing: .title)
        #else
        .toolbar(.hidden, for: .navigationBar)
        #endif
        // New feed posts every couple of minutes while Home is showing, offered as "N new".
        .task(id: "\(feedsQuery)|\(isActivePage)") {
          guard isActivePage else { return }
          while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(120))
            guard !Task.isCancelled else { return }
            await feeds.checkNew(feedsQuery)
          }
        }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active, isActivePage { Task { await feeds.checkNew(feedsQuery) } }
        }
        .onChange(of: isActivePage) { _, active in
          if active { Task { await feeds.checkNew(feedsQuery) } }
        }
        .task(id: feedsQuery) {
          await feeds.load(feedsQuery)
        }
        .task {
          if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
          await loadVideos()
          await loadUpNext()
          await loadLead()
        }
        .navigationDestination(for: LibraryItem.self) { item in
          ItemDestination(item: item, queue: videoQueue, perform: perform, resumePlayback: false)
            #if os(macOS)
            .modifier(UnfoldIn())
            #endif
            .pageBack(["Home"])
        }
        .onChange(of: LibraryChanges.shared.revision) { _, _ in
          Task { await loadVideos(); await loadUpNext() }
        }
        .pageTop { path = NavigationPath() }
        .navigationDestination(for: HomeSearch.self) { search in
          HomeSearchResults(search: search).pageBack(["Home"])
        }
        .toasts(toaster)
    }
    #if os(iOS)
    .sheet(isPresented: $searching) {
      VStack(alignment: .leading, spacing: 18) {
        Text("Search Stash").font(.stSection)
        CaptureField(text: $capture, prompt: "Search Stash", focus: $captureFocused) {
          searching = false
          submitCapture()
        }
        Button("Cancel") { searching = false }.buttonStyle(.text)
      }
      .padding(20).presentationDetents([.medium])
      .onAppear { captureFocused = true }
    }
    .sheet(item: $peek) { item in
      peekCard(item, inSheet: true)
        .presentationDetents([.large])
        .presentationCornerRadius(22)
        .presentationBackground(Color.stPage)
    }
    #endif
    .linkCapture(isPresented: $capturing)
  }

  // MARK: The preview

  private var feedItems: [LibraryItem] { Array(feeds.visibleItems.prefix(Self.feedLimit)) }

  private var peekList: [LibraryItem] {
    switch peekSource {
    case .feeds: return feedItems
    case .videos: return videos
    case .upNext: return upNext
    case .continuing: return continuingVideos
    }
  }

  private var videoQueue: [LibraryItem] {
    if peekSource == .continuing { return continuingVideos }
    return peekSource == .videos ? videos : feeds.visibleItems.filter(Watch.isVideo)
  }

  private func peekCard(_ item: LibraryItem, inSheet: Bool) -> some View {
    let list = peekList
    let index = list.firstIndex(of: item)
    return PeekCard(
      item: item,
      sourceName: channelName(item) ?? item.source,
      position: index.map { "\($0 + 1) of \(list.count)" },
      canGoBack: (index ?? 0) > 0,
      canGoForward: index.map { $0 + 1 < list.count } ?? false,
      queue: videoQueue,
      inSheet: inSheet,
      onClose: close,
      onMove: move,
      onExpand: { expand(item) },
      perform: perform
    )
  }

  private func move(_ step: Int) {
    let list = peekList
    guard let peek, let index = list.firstIndex(of: peek), list.indices.contains(index + step) else { return }
    show(list[index + step])
  }

  private func show(_ item: LibraryItem) {
    markSeen(item)
    withAnimation(reduceMotion ? StashMotion.fade : StashMotion.change) { peek = item }
    #if os(macOS)
    if peekSource == .feeds { selectedID = item.id }
    #endif
  }

  /// Opens the item full size, with the reader's own toolbar.
  private func expand(_ item: LibraryItem) {
    close()
    path.append(Watch.isVideo(item) ? (player.item ?? item) : item)
  }

  // MARK: Mac layout

  #if os(macOS)
  /// The header pinned at the top, the page scrolling under it, and the preview floating over both.
  private var content: some View {
    ZStack {
      VStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 18) {
          FolioView(content: Self.folio)
          HomeHeader(capture: $capture, focus: $captureFocused, onSubmit: submitCapture, onAdd: { capturing = true })
        }
          .padding(.horizontal, 40)
          // With the sidebar hidden, keep clear of the window buttons and sidebar button.
          .padding(.leading, (sidebarHidden || autoHiddenSidebar) ? 84 : 0)
          .padding(.top, 2)
          .padding(.bottom, 20)
          .frame(maxWidth: Self.maxWidth + 80 + ((sidebarHidden || autoHiddenSidebar) ? 84 : 0))
          .frame(maxWidth: .infinity)
        page
      }
      if let peek {
        Color.black.opacity(0.18)
          .ignoresSafeArea()
          .onTapGesture { close() }
          .transition(.opacity)
        GeometryReader { geometry in
          peekCard(peek, inSheet: false)
            .frame(width: min(860, geometry.size.width - 64), height: max(320, geometry.size.height - 48))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .transition(.asymmetric(
          insertion: reduceMotion ? .opacity : .scale(scale: 0.98).combined(with: .opacity),
          removal: .opacity
        ))
      }
    }
    .animation(reduceMotion ? StashMotion.fade : StashMotion.change, value: peek == nil)
  }

  /// Content 40pt from the edges, at most 1,180pt wide and centred. Rows are selected with a
  /// click or the arrow keys; Delete archives and S saves the selected row.
  private var page: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          continuationSection
          freshPanels
          savedSuggestions
          if showsEditionStrip { editionStrip }
        }
        .padding(.horizontal, 40)
        .padding(.leading, (sidebarHidden || autoHiddenSidebar) ? 84 : 0)
        .padding(.bottom, 40)
        .frame(maxWidth: Self.maxWidth + 80 + ((sidebarHidden || autoHiddenSidebar) ? 84 : 0))
        .frame(maxWidth: .infinity)
      }
      .scrollContentBackground(.hidden)
      .focusable()
      .focused($listFocused)
      .focusEffectDisabled()
      .onKeyPress(.downArrow) { step(1) }
      .onKeyPress(.upArrow) { step(-1) }
      .onKeyPress(.delete) { performOnSelection(.archive) }
      .onKeyPress(.deleteForward) { performOnSelection(.archive) }
      .onKeyPress("s") { performOnSelection(.save) }
      .onKeyPress("/") {
        captureFocused = true
        return .handled
      }
      .onChange(of: selectedID) { _, id in
        guard let id else { return }
        withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(id) }
        // Arrow keys move the preview through the feed list, but not one opened elsewhere.
        guard id != peek?.id, !(peek != nil && peekSource != .feeds),
              let item = feedItems.first(where: { $0.id == id }) else { return }
        open(item, from: .feeds)
      }
    }
  }

  /// The feed list as one bordered box: day bands, rows, then a "more" row.
  private var feedBox: some View {
    let items = feedItems
    let hasMore = (feeds.total ?? 0) > items.count
    return Group {
      if items.isEmpty {
        feedsEmpty
      } else {
        VStack(spacing: 0) {
          ForEach(groups(items), id: \.label) { group in
            DayBand(label: group.label)
              .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
            ForEach(group.items) { item in
              feedRow(item, divider: hasMore || item.id != items.last?.id)
            }
          }
          if hasMore { moreRow(items.count) }
        }
        .background(Color.stSurface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
      }
    }
  }

  private func feedRow(_ item: LibraryItem, divider: Bool) -> some View {
    let selected = selectedID == item.id
    return Group {
      if Watch.isVideo(item) {
        VideoRow(item: item, selected: selected, divider: divider)
      } else {
        ItemRow(item: item, subscriptionName: channelName(item), unseen: feeds.isUnseen(item), selected: selected, divider: divider)
      }
    }
    .id(item.id)
    .onTapGesture {
      listFocused = true
      selectedID = item.id
    }
    .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
  }
  #endif

  // MARK: iPhone layout

  #if os(iOS)
  /// A List, so rows swipe: right to save, left to archive.
  private var content: some View {
    List {
      FolioView(content: Self.folio).plainListRow(top: 8)
      iPhoneHeader.plainListRow(top: 12)
      continuationSection.plainListRow(top: 18)
      if showsEditionStrip { editionStrip.plainListRow(top: 18) }
      if !videos.isEmpty { latestVideos.plainListRow(top: 20) }
      if !upNext.isEmpty { savedSuggestions.plainListRow(top: 20) }
      feedsHeading.plainListRow(top: 22, bottom: 10)

      let items = feedItems
      if items.isEmpty {
        feedsEmpty.plainListRow()
      } else {
        ForEach(groups(items), id: \.label) { group in
          DayBand(label: group.label).stashListRow()
          ForEach(group.items) { item in
            Button { open(item, from: .feeds) } label: {
              if Watch.isVideo(item) {
                VideoRow(item: item)
              } else {
                ItemRow(item: item, subscriptionName: channelName(item), unseen: feeds.isUnseen(item))
              }
            }
            .buttonStyle(.plain)
            .stashListRow()
            .itemSwipes(item, unseen: feeds.isUnseen(item), perform: perform)
            .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
          }
        }
        if (feeds.total ?? 0) > items.count {
          moreRow(items.count).stashListRow()
        }
      }
    }
    .stashList()
    .refreshable { await reload() }
  }

  /// "Home" with a + for saving a link, and the date under it.
  private var iPhoneHeader: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 10) {
        Text("Home")
          .font(.ui(30, .semibold, relativeTo: .largeTitle))
          .tracking(-0.84)
          .foregroundStyle(Color.stInk)
        Spacer(minLength: 0)
        Button { searching = true } label: {
          Image(systemName: "magnifyingglass").frame(width: 44, height: 44)
        }
        .buttonStyle(.plain).accessibilityLabel("Search Stash")
        Button { capturing = true } label: {
          Image(systemName: "plus")
            .font(.ui(15, .medium))
            .foregroundStyle(Color.stInk)
            .frame(width: 44, height: 44)
            .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Save a link")
      }
      Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased())
        .font(.mono(11))
        .tracking(0.66)
        .foregroundStyle(Color.stMuted)
    }
  }

  #endif

  // MARK: Shared pieces

  @ViewBuilder
  private var continuationSection: some View {
    let article = upNext.first { $0.progress >= 0.02 }
    let video = continuingVideos.first
    if article != nil || video != nil {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeading(title: "Pick up where you left off")
        let layout = contentWidth >= 900
          ? AnyLayout(HStackLayout(alignment: .top, spacing: 20))
          : AnyLayout(VStackLayout(alignment: .leading, spacing: 14))
        layout {
          if let article {
            ContinuationCard(item: article, watching: false) { open(article, from: .upNext) }
          }
          if let video {
            ContinuationCard(item: video, watching: true) { open(video, from: .continuing) }
          }
        }
      }
    }
  }

  #if os(macOS)
  private var freshPanels: some View {
    let layout = contentWidth >= 900
      ? AnyLayout(HStackLayout(alignment: .top, spacing: 28))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: 28))
    return layout {
      VStack(alignment: .leading, spacing: 12) { feedsHeading; feedBox }.frame(maxWidth: .infinity)
      if !videos.isEmpty { latestVideos.frame(maxWidth: .infinity) }
    }
  }

  #endif

  private var latestVideos: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeading(title: "New videos") { Button("See all") { go(.channels) }.buttonStyle(.text) }
      ListBox {
        ForEach(videos.prefix(3)) { item in
          Button { open(item, from: .videos) } label: {
            VideoRow(item: item, divider: item.id != videos.prefix(3).last?.id)
          }
          .buttonStyle(.plain)
          .itemMenu(item, unseen: true, perform: perform)
        }
      }
    }
  }

  @ViewBuilder
  private var savedSuggestions: some View {
    let items = Array(upNext.filter { $0.progress < 0.02 }.prefix(3))
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeading(title: "In Saved") { Button("Open Saved") { go(.saved) }.buttonStyle(.text) }
        ListBox {
          ForEach(items) { item in
            Button { open(item, from: .upNext) } label: { ItemRow(item: item, divider: item.id != items.last?.id) }
              .buttonStyle(.plain).itemMenu(item, perform: perform)
          }
        }
      }
    } else if let upNextError {
      HStack {
        Text(upNextError).font(.stSmall).foregroundStyle(Color.stMuted)
        Button("Try again") { Task { await loadUpNext() } }.buttonStyle(.text)
      }
    }
  }

  private var showsEditionStrip: Bool {
    edition.isOut && edition.state?.showOnHome != false
  }

  private var editionStrip: some View {
    Button { go(.edition) } label: {
      HStack(spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          (Text("The Edition") + Text(".").foregroundStyle(Color.stAccent))
            .font(.ui(20, .bold, relativeTo: .title3))
            .tracking(-0.8)
          if let current = edition.current {
            Kicker("No. \(current.number) · \(EditionSchedule.at(current.date, hour: 12).formatted(.dateTime.weekday(.wide).day().month(.wide)))")
          } else {
            Kicker("This week's issue is out")
          }
        }
        .fixedSize()
        if let leadTitle {
          Rectangle().fill(Color.stLine).frame(width: 1, height: 34)
          VStack(alignment: .leading, spacing: 2) {
            Kicker("In this week's issue", accent: true)
            Text(leadTitle)
              .font(.reading(20, .medium, relativeTo: .title3))
              .foregroundStyle(Color.stInk)
              #if os(macOS)
              .lineLimit(1)
              #else
              .lineLimit(2)
              #endif
              .multilineTextAlignment(.leading)
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "arrow.right")
          .font(.ui(13, .semibold))
          .foregroundStyle(Color.stMuted)
      }
      .padding(.vertical, 12)
      .overlay(alignment: .top) { Rectangle().fill(Color.stInk).frame(height: 2) }
      .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private var feedsHeading: some View {
    SectionHeading(title: "From your feeds") {
      if !feeds.waiting.isEmpty {
        Button { withAnimation(reduceMotion ? nil : StashMotion.change) { feeds.showWaiting() } } label: {
          Label("\(feeds.waiting.count) new", systemImage: "arrow.up")
        }
        .buttonStyle(.textProminent)
        .help("Show the new posts")
      }
      Button("See all") { go(.feeds) }.buttonStyle(.text)
    }
  }

  @ViewBuilder
  private var feedsEmpty: some View {
    if feeds.isLoading {
      ProgressView().frame(maxWidth: .infinity).padding(.vertical, 32)
    } else if let error = feeds.error {
      EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark") {
        Button("Try again") { Task { await feeds.reload(feedsQuery) } }
      }
    } else {
      EmptyBox(message: "You're all caught up.") {
        Button("Open Feeds") { go(.feeds) }
      }
    }
  }

  private func moreRow(_ shown: Int) -> some View {
    Button {
      go(.feeds)
    } label: {
      HStack {
        Text("\((feeds.total ?? 0) - shown) more")
          .foregroundStyle(Color.stMuted)
        Spacer()
        HStack(spacing: 6) {
          Text("Open Feeds")
          Image(systemName: "chevron.right").imageScale(.small)
        }
        .font(.ui(13, .medium))
        .foregroundStyle(Color.stInk)
      }
      .font(.ui(13))
      .padding(.leading, 42)
      .padding(.trailing, 14)
      .padding(.vertical, 12)
      .background(Color.stGroup)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func groups(_ items: [LibraryItem]) -> [(label: String, items: [LibraryItem])] {
    var result: [(label: String, items: [LibraryItem])] = []
    // Grouped by label, not just by neighbours, so a label never appears twice.
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

  // MARK: Loading

  private func reload() async {
    await feeds.reload(feedsQuery)
    await loadVideos()
    await loadUpNext()
    await edition.refresh()
    await loadLead()
  }

  /// A short preview of new videos from your channels.
  private func loadVideos() async {
    guard let page = try? await Library.search(Self.videosQuery, first: 12) else { return }
    videos = page.items
  }

  /// Anything you've started, then your newest unread saves.
  private func loadUpNext() async {
    do {
      async let reading = Library.search("in:inbox use:folders is:reading -type:video sort:read-desc", first: 5)
      async let unread = Library.search("in:inbox use:folders is:unread -type:video sort:saved-desc", first: 8)
      let (started, fresh) = try await (reading, unread)
      var seen = Set<String>()
      upNext = (started.items + fresh.items)
        .filter { seen.insert($0.id).inserted && $0.progress < 0.9 && !$0.isArchived }
        .prefix(edition.state?.upNext ?? 5).map { $0 }
      upNextError = nil
    } catch { upNextError = "Couldn't update your saved articles. Try again." }
    if let page = try? await Library.search("use:folders type:video is:reading sort:updated-desc", first: 6) {
      continuingVideos = page.items.filter { !$0.isArchived && $0.progress < 0.9 }
    }
  }

  /// Makes this week's issue if it's out and not made yet, so it's ready to open.
  private func loadLead() async {
    guard edition.isFresh else { return }
    if edition.current == nil { await edition.make(subscriptions: subscriptions) }
    guard let lead = edition.current?.entries.first(where: { $0.slot == "lead" }) else { return }
    leadTitle = try? await Library.search("includes:\(lead.id)", first: 1).items.first?.title
  }

  // MARK: Doing things

  /// Search is separate from saving, so Return always does what the field says.
  private func submitCapture() {
    let text = capture.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    captureFocused = false
    path.append(HomeSearch(text: text))
  }

  private func channelName(_ item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func markSeen(_ item: LibraryItem) {
    guard item.isFeedItem else { return }
    if feeds.isUnseen(item) { feeds.markSeen(item) }
    Task { try? await Library.markSeen([item.id]) }
  }

  private func open(_ item: LibraryItem, from source: PeekSource) {
    peekSource = source
    show(item)
  }

  private func close() {
    peek = nil
    #if os(macOS)
    selectedID = nil
    #endif
  }

  #if os(macOS)
  /// Up and down arrows move through the feed list, opening each item in the preview.
  private func step(_ offset: Int) -> KeyPress.Result {
    guard !(peek != nil && peekSource != .feeds) else { return .ignored }
    let items = feedItems
    guard !items.isEmpty else { return .ignored }
    guard let id = selectedID, let index = items.firstIndex(where: { $0.id == id }) else {
      selectedID = (offset > 0 ? items.first : items.last)?.id
      return .handled
    }
    selectedID = items[min(max(index + offset, 0), items.count - 1)].id
    return .handled
  }

  private func performOnSelection(_ action: ItemAction) -> KeyPress.Result {
    // While the preview is open its own buttons take the keys.
    guard peek == nil else { return .ignored }
    guard let id = selectedID, let item = feeds.visibleItems.first(where: { $0.id == id }) else { return .ignored }
    perform(action, item)
    return .handled
  }
  #endif

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    if action.removesItem && peek?.id == item.id {
      // Move on to the next item, or the one before at the end of the list.
      let list = peekList
      if let index = list.firstIndex(of: item), list.indices.contains(index + 1) {
        show(list[index + 1])
      } else if let index = list.firstIndex(of: item), index > 0 {
        show(list[index - 1])
      } else {
        close()
      }
    }
    #if os(macOS)
    if action.removesItem && selectedID == item.id && peek == nil {
      let items = feedItems
      if let index = items.firstIndex(of: item) {
        selectedID = (items.dropFirst(index + 1).first ?? items.prefix(index).last)?.id
      }
    }
    #endif
    let wasUpNext = upNext.contains { $0.id == item.id }
    let wasVideo = videos.contains { $0.id == item.id }
    runItemAction(
      action, item, toaster: toaster,
      remove: {
        feeds.remove(item)
        upNext.removeAll { $0.id == item.id }
        videos.removeAll { $0.id == item.id }
      },
      restore: {
        feeds.restore(item)
        if wasUpNext { Task { await loadUpNext() } }
        if wasVideo { Task { await loadVideos() } }
      },
      refresh: {
        if action == .markSeen || action == .openOriginal {
          feeds.markSeen(item)
        } else if wasUpNext || !item.isFeedItem || action == .save {
          await loadUpNext()
        }
      }
    )
  }
}

/// A search typed into Home's capture field.
struct HomeSearch: Hashable {
  let text: String
}

/// Everything in your library matching a search from Home, with the reader beside it on Mac.
private struct HomeSearchResults: View {
  let search: HomeSearch
  @State private var list = ItemList()

  var body: some View {
    ItemListView(
      title: "“\(search.text)”",
      list: list,
      query: "use:folders \(search.text)",
      leading: nil,
      trailing: [.archive, .delete],
      emptyTitle: "No results",
      emptyMessage: "Nothing in Stash matches “\(search.text)”.",
      embedded: true
    ) {
      EmptyView()
    }
  }
}

#if os(iOS)
private extension View {
  /// A List row that draws on the page with Stash's 16pt side margins and no separator.
  func plainListRow(top: CGFloat = 0, bottom: CGFloat = 0) -> some View {
    listRowInsets(EdgeInsets(top: top, leading: 16, bottom: bottom, trailing: 16))
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
  }
}
#endif
