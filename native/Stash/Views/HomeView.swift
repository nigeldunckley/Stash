import SwiftUI

/// Home: what's new in your feeds, and the few saves you're most likely to read next.
/// While The Edition is out and unopened, a strip at the top points to it.
struct HomeView: View {
  /// Switches to another part of the app, e.g. Feeds or The Edition.
  let go: (AppSection) -> Void

  @Environment(EditionModel.self) private var edition
  @State private var feeds = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var tab: Tab = .read
  @State private var otherCount: Int?
  @State private var upNext: [LibraryItem] = []
  @State private var unreadTotal: Int?
  @State private var loadingUpNext = true
  @State private var leadTitle: String?
  /// The item open in the preview: beside the list on Mac, in a sheet over Home on iPhone.
  @State private var peek: LibraryItem?
  /// Whether the preview came from the feed list or Up next, for moving up and down.
  @State private var peekFromUpNext = false
  /// Items opened full size from the preview.
  @State private var path = NavigationPath()
  #if os(macOS)
  @State private var selectedID: String?
  #endif
  @State private var toaster = Toaster()

  private enum Tab: String { case read, watch }

  private static let feedLimit = 12

  private var feedsQuery: String {
    "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen sort:published-desc"
  }

  #if os(macOS)
  private let isWide = true
  #else
  private let isWide = false
  #endif

  var body: some View {
    NavigationStack(path: $path) {
      content
        .background(Color.stPage)
        .navigationTitle("Home")
        .toolbar {
          ToolbarItem(placement: .primaryAction) {
            Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased())
              .font(.stDetail)
              .foregroundStyle(Color.stMuted)
              .fixedSize()
          }
        }
        .task(id: feedsQuery) {
          await feeds.load(feedsQuery)
          otherCount = await count(tab == .read ? "type:video" : "-type:video")
        }
        .task {
          if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
          await loadUpNext()
          await loadLead()
        }
        .navigationDestination(for: LibraryItem.self) { item in
          ItemDestination(item: item, queue: videoQueue, perform: perform)
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
    #endif
  }

  // MARK: The preview

  private var peekList: [LibraryItem] {
    peekFromUpNext ? upNext : Array(feeds.visibleItems.prefix(Self.feedLimit))
  }

  private var videoQueue: [LibraryItem] { feeds.visibleItems.filter(Watch.isVideo) }

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
    if !peekFromUpNext { selectedID = item.id }
    #endif
  }

  /// Opens the item full size, with the reader's own toolbar.
  private func expand(_ item: LibraryItem) {
    close()
    path.append(item)
  }

  #if os(macOS)
  /// The list with Up next beside it, and the preview floating over both.
  private var content: some View {
    ZStack {
      HStack(spacing: 0) {
        homeList.frame(maxWidth: .infinity)
        Rectangle().fill(Color.stLine).frame(width: 1)
        ScrollView { upNextRail.padding(20) }
          .frame(width: 340)
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
  #else
  private var content: some View { homeList }
  #endif

  /// The Edition strip, Up next on iPhone, then new feed items grouped by day. A List, so rows
  /// swipe: right to save, left to archive.
  private var homeList: some View {
    listContainer
      .stashList()
      .refreshable { await reload() }
      #if os(macOS)
      .onChange(of: selectedID) { _, id in
        // Arrow keys in the list move the preview through Feeds, but not one opened from Up next.
        guard let id, id != peek?.id, !(peek != nil && peekFromUpNext), let item = feeds.visibleItems.first(where: { $0.id == id }) else { return }
        open(item)
      }
      .focusable()
      .focusEffectDisabled()
      .onKeyPress(.downArrow) { step(1) }
      .onKeyPress(.upArrow) { step(-1) }
      .onKeyPress(.delete) { performOnSelection(.archive) }
      .onKeyPress(.deleteForward) { performOnSelection(.archive) }
      .onKeyPress("s") { performOnSelection(.save) }
      #endif
  }

  @ViewBuilder
  private var listContainer: some View {
    #if os(macOS)
    // Selection is drawn by the rows (Stash grey with an orange bar), not the system.
    ScrollViewReader { proxy in
      List { listRows }
        .onChange(of: selectedID) { _, id in
          if let id { withAnimation(.snappy(duration: 0.15)) { proxy.scrollTo(id) } }
        }
    }
    #else
    List { listRows }
    #endif
  }

  @ViewBuilder
  private var listRows: some View {
    if edition.isFresh && edition.state?.showOnHome != false {
      editionStrip
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .selectionDisabled()
    }
    #if os(iOS)
    upNextStrip
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
      .padding(.bottom, 8)
    #endif
    feedsHeading
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
      .selectionDisabled()

    let items = Array(feeds.visibleItems.prefix(Self.feedLimit))
    if items.isEmpty {
      feedsEmpty.listRowSeparator(.hidden).listRowBackground(Color.clear).selectionDisabled()
    } else {
      ForEach(groups(items), id: \.label) { group in
        // A plain row rather than a Section header, so it scrolls with the list on Stash's
        // background instead of sticking with the system's grey bar.
        Kicker(group.label)
          .padding(.horizontal, 12)
          .padding(.top, 14)
          .padding(.bottom, 6)
          .frame(maxWidth: .infinity, alignment: .leading)
          .stashListRow()
          .selectionDisabled()
        ForEach(group.items) { item in feedRow(item) }
      }
      if (feeds.total ?? 0) > items.count {
        moreButton(items.count)
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .selectionDisabled()
      }
    }
  }

  // MARK: The Edition strip

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
          Divider().frame(height: 34)
          VStack(alignment: .leading, spacing: 2) {
            Kicker("The week's best you missed", accent: true)
            Text(leadTitle)
              .font(.reading(20, .medium, relativeTo: .title3))
              .foregroundStyle(Color.stInk)
              .lineLimit(isWide ? 1 : 2)
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

  // MARK: New from your feeds

  private var feedsHeading: some View {
    SectionHeading(title: "New from your feeds", detail: feeds.total.map { "\($0) unseen" }) {
      StashSegmented(selection: $tab, [
        .init("Read", Tab.read, count: tab == .read ? feeds.total : otherCount),
        .init("Watch", Tab.watch, count: tab == .watch ? feeds.total : otherCount),
      ])
      Button { markAllSeen() } label: {
        Label("Mark all seen", systemImage: "checkmark")
      }
      .buttonStyle(.text)
      .disabled(feeds.visibleItems.isEmpty)
      .help("Mark everything here as seen")
    }
    .padding(.top, 6)
  }

  @ViewBuilder
  private var feedsEmpty: some View {
    Group {
      if feeds.isLoading {
        ProgressView().frame(maxWidth: .infinity)
      } else if let error = feeds.error {
        EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark", boxed: true)
      } else {
        EmptyBox(title: "All caught up", message: tab == .watch ? "No new videos from your channels." : "Nothing new from your feeds.", systemImage: "checkmark.circle", boxed: true)
      }
    }
    .padding(.vertical, 24)
  }

  private func moreButton(_ shown: Int) -> some View {
    Button {
      go(tab == .watch ? .channels : .feeds)
    } label: {
      HStack {
        Text("\((feeds.total ?? 0) - shown) more")
          .foregroundStyle(Color.stMuted)
        Spacer()
        Text(tab == .watch ? "Open Channels" : "Open Feeds").font(.ui(13, .medium))
        Image(systemName: "chevron.right")
      }
      .font(.ui(13))
      .padding(.vertical, 6)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  private func groups(_ items: [LibraryItem]) -> [(label: String, items: [LibraryItem])] {
    var result: [(label: String, items: [LibraryItem])] = []
    for item in items {
      let label = dayGroup(item.date)
      if result.last?.label == label {
        result[result.count - 1].items.append(item)
      } else {
        result.append((label, [item]))
      }
    }
    return result
  }

  private func feedRow(_ item: LibraryItem) -> some View {
    rowBase(item)
      .stashListRow()
      .itemSwipes(item, unseen: feeds.isUnseen(item), perform: perform)
      .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
  }

  /// On Mac the list's selection opens the preview; on iPhone a tap does.
  @ViewBuilder
  private func rowBase(_ item: LibraryItem) -> some View {
    let selected = isSelected(item)
    let content = Group {
      if Watch.isVideo(item) {
        VideoRow(item: item, selected: selected)
      } else {
        ItemRow(item: item, subscriptionName: channelName(item), unseen: feeds.isUnseen(item), selected: selected)
      }
    }
    #if os(macOS)
    content.onTapGesture { selectedID = item.id }
    #else
    Button { open(item) } label: { content }
      .buttonStyle(.plain)
    #endif
  }

  /// Only the Mac draws a selected row; on iPhone a tap opens the item straight away.
  private func isSelected(_ item: LibraryItem) -> Bool {
    #if os(macOS)
    return selectedID == item.id
    #else
    return false
    #endif
  }

  // MARK: Up next

  /// On wide screens: the first save featured with its cover, then the rest as a list.
  private var upNextRail: some View {
    VStack(alignment: .leading, spacing: 12) {
      upNextHeading
      if let first = upNext.first {
        Button { open(first) } label: {
          VStack(alignment: .leading, spacing: 8) {
            CoverImage(url: first.imageURL)
              .aspectRatio(16 / 10, contentMode: .fit)
              .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
              .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.stLine, lineWidth: 0.5))
            upNextText(first, titleFont: .reading(20, .medium, relativeTo: .title3))
            if first.progress > 0.02 {
              ProgressView(value: first.progress).tint(Color.stAccent)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .itemMenu(first, perform: perform)

        ForEach(upNext.dropFirst()) { item in
          Rectangle().fill(Color.stLine).frame(height: 1)
          Button { open(item) } label: {
            upNextText(item, titleFont: .reading(16, .medium, relativeTo: .subheadline)).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .itemMenu(item, perform: perform)
        }
      } else {
        upNextEmpty
      }
      if let unreadTotal, unreadTotal > upNext.count {
        Button { go(.saved) } label: {
          HStack {
            Text("All \(unreadTotal) in Saved")
            Image(systemName: "chevron.right")
          }
          .font(.ui(13))
        }
        .buttonStyle(.borderless)
        .padding(.top, 4)
      }
    }
  }

  /// On iPhone: a row of cards to swipe through.
  @ViewBuilder
  private var upNextStrip: some View {
    VStack(alignment: .leading, spacing: 10) {
      upNextHeading
      if upNext.isEmpty {
        upNextEmpty
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: 12) {
            ForEach(upNext) { item in
              Button { open(item) } label: {
                VStack(alignment: .leading, spacing: 8) {
                  CoverImage(url: item.imageURL)
                    .frame(width: 240, height: 130)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(alignment: .bottom) {
                      if item.progress > 0.02 {
                        ProgressView(value: item.progress).tint(Color.stAccent).padding(8)
                      }
                    }
                  upNextText(item, titleFont: .reading(16, .medium, relativeTo: .subheadline))
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

  private var upNextHeading: some View {
    SectionHeading(title: "Up next", detail: upNext.isEmpty ? nil : "\(upNext.count) to read")
  }

  @ViewBuilder
  private var upNextEmpty: some View {
    if loadingUpNext {
      ProgressView().frame(maxWidth: .infinity).padding(.vertical, 12)
    } else {
      Text("Nothing waiting. Save something from your feeds and it will show here.")
        .font(.ui(13))
        .foregroundStyle(Color.stMuted)
    }
  }

  private func upNextText(_ item: LibraryItem, titleFont: Font) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        SiteIcon(url: item.iconURL)
        Text(item.source).lineLimit(1)
      }
      .font(.stDetail)
      .foregroundStyle(Color.stMuted)
      Text(item.title)
        .font(titleFont)
        .foregroundStyle(Color.stInk)
        .lineLimit(3)
        .multilineTextAlignment(.leading)
      if let label = readingLabel(item) {
        Text(label)
          .font(.stDetail)
          .foregroundStyle(item.progress >= 0.02 ? Color.stAccentText : Color.stMuted)
      }
    }
  }

  // MARK: Loading

  private func reload() async {
    await feeds.reload(feedsQuery)
    otherCount = await count(tab == .read ? "type:video" : "-type:video")
    await loadUpNext()
    await edition.refresh()
    await loadLead()
  }

  private func count(_ type: String) async -> Int? {
    try? await Library.search("in:following use:folders \(type) -is:seen", first: 1).pageInfo.totalCount
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

  private func channelName(_ item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func markSeen(_ item: LibraryItem) {
    guard item.isFeedItem, feeds.isUnseen(item) else { return }
    feeds.markSeen(item)
    Task { try? await Library.markSeen([item.id]) }
  }

  private func markAllSeen() {
    let query = "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen"
    Task {
      do {
        try await Library.markSeen(query: query)
        toaster.show(tab == .watch ? "Marked all videos as seen" : "Marked all feeds as seen")
        await feeds.reload(feedsQuery)
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }

  private func open(_ item: LibraryItem) {
    peekFromUpNext = upNext.contains(item) && !feeds.visibleItems.contains(item)
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
    guard !(peek != nil && peekFromUpNext) else { return .ignored }
    let items = Array(feeds.visibleItems.prefix(Self.feedLimit))
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
    let wasUpNext = upNext.contains { $0.id == item.id }
    runItemAction(
      action, item, toaster: toaster,
      remove: {
        feeds.remove(item)
        upNext.removeAll { $0.id == item.id }
      },
      restore: {
        feeds.restore(item)
        if wasUpNext { Task { await loadUpNext() } }
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
