import SwiftUI

/// Home, laid out like the web's: the page header with the capture field, New videos, then the
/// feeds list and Up next side by side. While The Edition is out and unopened, a strip at the
/// top points to it. Items open in a floating preview (a sheet on iPhone).
struct HomeView: View {
  /// Switches to another part of the app, e.g. Feeds or The Edition.
  let go: (AppSection) -> Void

  @Environment(EditionModel.self) private var edition
  @State private var feeds = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var tab: Tab = .read
  @State private var otherCount: Int?
  @State private var videos: [LibraryItem] = []
  @State private var videosTotal: Int?
  @State private var upNext: [LibraryItem] = []
  @State private var unreadTotal: Int?
  @State private var loadingUpNext = true
  @State private var leadTitle: String?
  /// The item open in the preview, and which list it came from, for moving up and down.
  @State private var peek: LibraryItem?
  @State private var peekSource: PeekSource = .feeds
  /// Items and searches opened full size from Home.
  @State private var path = NavigationPath()
  @State private var capture = ""
  @FocusState private var captureFocused: Bool
  #if os(macOS)
  @State private var selectedID: String?
  @FocusState private var listFocused: Bool
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  #else
  @State private var capturing = false
  #endif
  @State private var toaster = Toaster()

  private enum Tab: String { case read, watch }
  private enum PeekSource { case feeds, videos, upNext }

  private static let feedLimit = 12
  /// The widest the page's content gets, as on the web.
  private static let maxWidth: CGFloat = 1180

  private var feedsQuery: String {
    "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen sort:published-desc"
  }

  private static let videosQuery = "in:following use:folders type:video -is:seen sort:published-desc"

  var body: some View {
    NavigationStack(path: $path) {
      content
        .background(Color.stPage)
        .navigationTitle("Home")
        #if os(macOS)
        .toolbar(removing: .title)
        #else
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .task(id: feedsQuery) {
          await feeds.load(feedsQuery)
          otherCount = await count(tab == .read ? "type:video" : "-type:video")
        }
        .task {
          if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
          await loadVideos()
          await loadUpNext()
          await loadLead()
        }
        .navigationDestination(for: LibraryItem.self) { item in
          ItemDestination(item: item, queue: videoQueue, perform: perform)
        }
        .navigationDestination(for: HomeSearch.self) { search in
          HomeSearchResults(search: search)
        }
        .toasts(toaster)
    }
    #if os(iOS)
    .sheet(item: $peek) { item in
      peekCard(item, inSheet: true)
        .presentationDetents([.large])
        .presentationCornerRadius(22)
        .presentationBackground(Color.stPage)
    }
    .sheet(isPresented: $capturing) {
      VStack(alignment: .leading, spacing: 14) {
        Text("Save a link or search")
          .font(.stSection)
          .foregroundStyle(Color.stInk)
        CaptureField(text: $capture, focus: $captureFocused) {
          capturing = false
          submitCapture()
        }
      }
      .padding(20)
      .presentationDetents([.height(150)])
      .presentationBackground(Color.stPage)
      .onAppear { captureFocused = true }
    }
    #endif
  }

  // MARK: The preview

  private var feedItems: [LibraryItem] { Array(feeds.visibleItems.prefix(Self.feedLimit)) }

  private var peekList: [LibraryItem] {
    switch peekSource {
    case .feeds: return feedItems
    case .videos: return videos
    case .upNext: return upNext
    }
  }

  private var videoQueue: [LibraryItem] {
    peekSource == .videos ? videos : feeds.visibleItems.filter(Watch.isVideo)
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
    withAnimation(.snappy(duration: 0.2)) { peek = item }
    #if os(macOS)
    if peekSource == .feeds { selectedID = item.id }
    #endif
  }

  /// Opens the item full size, with the reader's own toolbar.
  private func expand(_ item: LibraryItem) {
    close()
    path.append(item)
  }

  // MARK: Mac layout

  #if os(macOS)
  /// The header pinned at the top, the page scrolling under it, and the preview floating over both.
  private var content: some View {
    ZStack {
      VStack(spacing: 0) {
        HomeHeader(capture: $capture, focus: $captureFocused, onSubmit: submitCapture)
          .padding(.horizontal, 40)
          // With the sidebar hidden, keep clear of the window buttons and sidebar button.
          .padding(.leading, sidebarHidden ? 84 : 0)
          .padding(.top, 2)
          .padding(.bottom, 20)
          .frame(maxWidth: Self.maxWidth + 80 + (sidebarHidden ? 84 : 0))
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
          insertion: .scale(scale: 0.96).combined(with: .opacity),
          removal: .scale(scale: 0.98).combined(with: .opacity)
        ))
      }
    }
    .animation(.spring(duration: 0.32, bounce: 0.12), value: peek == nil)
  }

  /// Content 40pt from the edges, at most 1,180pt wide and centred. Rows are selected with a
  /// click or the arrow keys; Delete archives and S saves the selected row.
  private var page: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          if showsEditionStrip {
            editionStrip.padding(.bottom, 28)
          }
          if !videos.isEmpty {
            videoStrip.padding(.bottom, 30)
          }
          HStack(alignment: .top, spacing: 44) {
            VStack(alignment: .leading, spacing: 12) {
              feedsHeading
              feedBox
            }
            .frame(maxWidth: .infinity)
            UpNextColumn(
              items: upNext,
              loading: loadingUpNext,
              unreadTotal: unreadTotal,
              open: { open($0, from: .upNext) },
              openSaved: { go(.saved) },
              perform: perform
            )
            .frame(width: 330)
          }
        }
        .padding(.horizontal, 40)
        .padding(.leading, sidebarHidden ? 84 : 0)
        .padding(.bottom, 40)
        .frame(maxWidth: Self.maxWidth + 80 + (sidebarHidden ? 84 : 0))
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
        withAnimation(.snappy(duration: 0.15)) { proxy.scrollTo(id) }
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
      iPhoneHeader.plainListRow(top: 8)
      if showsEditionStrip {
        editionStrip.plainListRow()
      }
      if !videos.isEmpty {
        videoStrip.plainListRow(top: 14)
      }
      upNextStrip.plainListRow(top: 18)
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
        Button { capturing = true } label: {
          Image(systemName: "plus")
            .font(.ui(15, .medium))
            .foregroundStyle(Color.stInk)
            .frame(width: 36, height: 36)
            .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Save a link or search")
      }
      Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased())
        .font(.mono(11))
        .tracking(0.66)
        .foregroundStyle(Color.stMuted)
    }
  }

  /// Up next on iPhone: a row of cards to swipe through.
  private var upNextStrip: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionHeading(title: "Up next", detail: upNext.isEmpty ? nil : "\(upNext.count) to read")
      if upNext.isEmpty {
        if loadingUpNext {
          ProgressView().frame(maxWidth: .infinity).padding(.vertical, 12)
        } else {
          EmptyBox(message: "Nothing waiting. Save an article and it shows up here.")
        }
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: 12) {
            ForEach(upNext) { item in
              Button { open(item, from: .upNext) } label: {
                VStack(alignment: .leading, spacing: 8) {
                  CoverImage(url: item.imageURL)
                    .frame(width: 240, height: 130)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
                    .overlay(alignment: .bottom) {
                      if item.progress > 0.02 {
                        ProgressView(value: item.progress).tint(Color.stAccent).padding(8)
                      }
                    }
                  Text(item.title)
                    .font(.reading(16, .medium, relativeTo: .subheadline))
                    .foregroundStyle(Color.stInk)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                  Text([item.source, readingLabel(item)].compactMap { $0 }.joined(separator: " · ").uppercased())
                    .font(.mono(10.5))
                    .foregroundStyle(item.progress >= 0.02 ? Color.stAccentText : Color.stMuted)
                    .lineLimit(1)
                }
                .frame(width: 240, alignment: .leading)
                .contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .itemMenu(item, perform: perform)
            }
          }
        }
        .scrollClipDisabled()
      }
    }
  }
  #endif

  // MARK: Shared pieces

  private var showsEditionStrip: Bool {
    edition.isFresh && edition.state?.showOnHome != false
  }

  private var videoStrip: some View {
    NewVideosStrip(
      videos: videos,
      total: videosTotal,
      channelName: channelName,
      open: { open($0, from: .videos) },
      openWatch: { go(.channels) },
      perform: perform
    )
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
            Kicker("The week's best you missed", accent: true)
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
    SectionHeading(title: "New from your feeds", detail: feeds.total.map { "\($0) unseen" }) {
      StashSegmented(selection: $tab, [
        .init("Read", Tab.read, count: tab == .read ? feeds.total : otherCount),
        .init("Watch", Tab.watch, count: tab == .watch ? feeds.total : otherCount),
      ])
      Button { markAllSeen() } label: {
        #if os(macOS)
        Label("Mark all seen", systemImage: "checkmark")
        #else
        Label("Mark all seen", systemImage: "checkmark").labelStyle(.iconOnly)
        #endif
      }
      .buttonStyle(.text)
      .disabled(feeds.visibleItems.isEmpty)
      .help("Mark everything here as seen")
    }
  }

  @ViewBuilder
  private var feedsEmpty: some View {
    if feeds.isLoading {
      ProgressView().frame(maxWidth: .infinity).padding(.vertical, 32)
    } else if let error = feeds.error {
      EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark")
    } else {
      EmptyBox(message: tab == .watch ? "You're all caught up on your channels." : "You're all caught up.") {
        Button(tab == .watch ? "Open Latest" : "Open Feeds") { go(tab == .watch ? .channels : .feeds) }
      }
    }
  }

  private func moreRow(_ shown: Int) -> some View {
    Button {
      go(tab == .watch ? .channels : .feeds)
    } label: {
      HStack {
        Text("\((feeds.total ?? 0) - shown) more")
          .foregroundStyle(Color.stMuted)
        Spacer()
        HStack(spacing: 6) {
          Text(tab == .watch ? "Open Latest" : "Open Feeds")
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
    otherCount = await count(tab == .read ? "type:video" : "-type:video")
    await loadVideos()
    await loadUpNext()
    await edition.refresh()
    await loadLead()
  }

  private func count(_ type: String) async -> Int? {
    try? await Library.search("in:following use:folders \(type) -is:seen", first: 1).pageInfo.totalCount
  }

  /// The newest unseen videos from your channels, for the strip at the top.
  private func loadVideos() async {
    guard let page = try? await Library.search(Self.videosQuery, first: 12) else { return }
    videos = page.items
    videosTotal = page.pageInfo.totalCount
  }

  /// Anything you've started, then your newest unread saves.
  private func loadUpNext() async {
    defer { loadingUpNext = false }
    async let reading = Library.search("in:inbox use:folders is:reading -type:video sort:read-desc", first: 5)
    async let unread = Library.search("in:inbox use:folders is:unread -type:video sort:saved-desc", first: 8)
    let started = (try? await reading)?.items ?? []
    let fresh = try? await unread
    var seen = Set<String>()
    upNext = (started + (fresh?.items ?? []))
      .filter { seen.insert($0.id).inserted && $0.progress < 0.9 && !$0.isArchived }
      .prefix(edition.state?.upNext ?? 5)
      .map { $0 }
    unreadTotal = fresh?.pageInfo.totalCount
  }

  /// Makes this week's issue if it's out and not made yet, so it's ready to open.
  private func loadLead() async {
    guard edition.isFresh else { return }
    if edition.current == nil { await edition.make(subscriptions: subscriptions) }
    guard let lead = edition.current?.entries.first(where: { $0.slot == "lead" }) else { return }
    leadTitle = try? await Library.search("includes:\(lead.id)", first: 1).items.first?.title
  }

  // MARK: Doing things

  /// A link is saved; anything else searches your library.
  private func submitCapture() {
    let text = capture.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    capture = ""
    captureFocused = false
    let looksLikeLink = text.lowercased().hasPrefix("http") || (!text.contains(" ") && text.contains("."))
    if looksLikeLink {
      let url = text.lowercased().hasPrefix("http") ? text : "https://" + text
      Task {
        do {
          try await Library.save(url: url)
          toaster.show("Saved")
          try? await Task.sleep(for: .seconds(2))
          await loadUpNext()
        } catch {
          toaster.show(error.localizedDescription)
        }
      }
    } else {
      path.append(HomeSearch(text: text))
    }
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

  private func markAllSeen() {
    let query = "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen"
    Task {
      do {
        try await Library.markSeen(query: query)
        toaster.show(tab == .watch ? "Marked all videos as seen" : "Marked all feeds as seen")
        await feeds.reload(feedsQuery)
        if tab == .watch { await loadVideos() }
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
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
