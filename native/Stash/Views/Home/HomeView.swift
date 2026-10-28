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
  /// Home is scrolled to (near) the top, where new posts can drop in without moving what you're
  /// reading. On iPhone, the feed's heading is in view, which it reports once it's laid out.
  #if os(macOS)
  @State private var atTop = true
  #else
  @State private var atTop = false
  #endif
  /// Mid-scroll, or (on Mac) the pointer resting on the lead or the grid: new posts wait until you stop.
  @State private var scrolling = false
  @State private var hoveringLead = false
  @State private var hoveringGrid = false
  /// "N new" was tapped while scrolled down: they drop in once Home reaches the top.
  @State private var revealOnTop = false
  @State private var scrollTopTick = 0
  /// Lets a story that loses the lead slide into its new place rather than jump.
  @Namespace private var frontSpace
  @State private var peekSource: PeekSource = .feeds
  /// Items and searches opened full size from Home.
  @State private var path = NavigationPath()
  @State private var capturing = false
  @State private var capture = ""
  @FocusState private var captureFocused: Bool
  #if os(macOS)
  @State private var selectedID: String?
  @FocusState private var listFocused: Bool
  @FocusState private var sourceFocused: Bool
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @Environment(\.autoHiddenSidebar) private var autoHiddenSidebar
  #endif
  @State private var toaster = Toaster()

  private enum PeekSource { case feeds, videos, upNext, continuing }

  /// Home's feed list is the main column on Mac, so it shows more there.
  #if os(macOS)
  private static let feedLimit = 30
  #else
  private static let feedLimit = 6
  #endif
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
        // New feed posts every minute while Home is showing. At the top of Home they drop
        // straight in; scrolled down, they wait behind "N new".
        .task(id: "\(feedsQuery)|\(isActivePage)") {
          guard isActivePage else { return }
          while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            guard !Task.isCancelled else { return }
            await checkAndArrive()
          }
        }
        .onChange(of: scenePhase) { _, phase in
          if phase == .active, isActivePage { Task { await checkAndArrive() } }
        }
        .onChange(of: isActivePage) { _, active in
          if active { Task { await checkAndArrive() } }
        }
        .onChange(of: atTop) { _, _ in settle() }
        .onChange(of: busy) { _, _ in settle() }
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
        .pageTop { path = NavigationPath(); close() }
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
  /// Wide enough for the feed list with a column beside it; narrower, Home is one column as on iPhone.
  private var wide: Bool { contentWidth >= 1000 }
  /// With the sidebar hidden, keep clear of the window buttons and sidebar button.
  private var sidebarInset: CGFloat { (sidebarHidden || autoHiddenSidebar) ? 84 : 0 }

  /// Home, or an item opened from it beside the list it came from. Home stays alive underneath,
  /// so going back (Esc, ⌘[, "‹ Home") finds it scrolled where you left it.
  private var content: some View {
    ZStack {
      home
        .opacity(peek == nil ? 1 : 0)
        .allowsHitTesting(peek == nil)
        // Hidden while a story is open, so a save flies from the open list, not from here.
        .environment(\.isActivePage, isActivePage && peek == nil)
        .accessibilityHidden(peek != nil)
      if let peek {
        openItem(peek)
          .transition(.opacity)
      }
    }
    .animation(reduceMotion ? StashMotion.fade : StashMotion.change, value: peek == nil)
    .background {
      Color.clear.pageBack(["Home"], enabled: peek != nil, action: close)
    }
  }

  /// The folio over the front page, which scrolls as one.
  private var home: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          FolioView(content: Self.folio)
            .padding(.top, 2)
            .padding(.bottom, 10)
            .id(Self.topID)
          FrontMasthead(
            summary: mastheadSummary,
            capture: $capture, focus: $captureFocused,
            onSubmit: submitCapture, onAdd: { capturing = true }
          )
          frontPage
        }
        .padding(.horizontal, 48)
        .padding(.leading, sidebarInset)
        .padding(.bottom, 56)
        .frame(maxWidth: Self.maxWidth + 96 + sidebarInset)
        .frame(maxWidth: .infinity)
      }
      .scrollContentBackground(.hidden)
      .onScrollGeometryChange(for: Bool.self) { Self.isAtTop($0) } action: { _, top in atTop = top }
      .onScrollPhaseChange { _, phase in scrolling = phase != .idle }
      .onChange(of: scrollTopTick) {
        withAnimation(reduceMotion ? nil : StashMotion.change) { proxy.scrollTo(Self.topID, anchor: .top) }
      }
      .focusable()
      .focused($listFocused)
      .focusEffectDisabled()
      .onKeyPress(.downArrow) { step(1) }
      .onKeyPress(.upArrow) { step(-1) }
      .onKeyPress(.delete) { performOnSelection(.archive) }
      .onKeyPress(.deleteForward) { performOnSelection(.archive) }
      .onKeyPress("s") { performOnSelection(.save) }
      .onKeyPress("/") {
        guard peek == nil else { return .ignored }
        captureFocused = true
        return .handled
      }
      .onChange(of: selectedID) { _, id in
        // Moving through an open item's list leaves Home where it was.
        guard let id, peek == nil else { return }
        withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(id) }
        // Arrow keys open each feed item in turn, but only while Home itself is showing.
        guard let item = feedItems.first(where: { $0.id == id }) else { return }
        open(item, from: .feeds)
      }
    }
  }

  /// "23 stories waiting · 3 new videos", in italic beside "Home."
  private var mastheadSummary: String? {
    var parts: [String] = []
    if let total = feeds.total, total > 0 { parts.append("\(total) \(total == 1 ? "story" : "stories") waiting") }
    if !videos.isEmpty { parts.append("\(videos.count) new \(videos.count == 1 ? "video" : "videos")") }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  /// Home's feed posts laid out as a front page: the lead with secondary stories beside it, the
  /// rest of that day as a grid, and everything older as a river of headlines.
  private var frontStories: (lead: LibraryItem?, secondary: [LibraryItem], grid: [LibraryItem], river: [(label: String, items: [LibraryItem])]) {
    let items = feedItems
    let newestDay = dayGroup(items.first?.date)
    // The lead is the newest story with a picture, if one is near the top.
    guard let lead = items.prefix(6).first(where: {
      $0.imageURL != nil && !Watch.isVideo($0) && dayGroup($0.date) == newestDay
    }) ?? items.first else {
      return (nil, [], [], [])
    }
    var rest = items.filter { $0.id != lead.id }
    let secondary = Array(rest.prefix(wide ? 4 : 0))
    rest.removeFirst(secondary.count)
    let day = dayGroup(lead.date)
    let grid = Array(rest.filter { dayGroup($0.date) == day }.prefix(6))
    let gridIDs = Set(grid.map(\.id))
    let river = groups(rest.filter { !gridIDs.contains($0.id) })
      .map { group in
        let name = day == "Today" || day == "Yesterday" ? day.lowercased() : day
        return (label: group.label == day ? "More from \(name)" : group.label, items: group.items)
      }
    return (lead, secondary, grid, river)
  }

  /// Where a new post comes in its batch, so they fall one after another, newest first.
  private func arrivalOrder(_ item: LibraryItem) -> Int {
    guard feeds.arrivals[item.id] != nil else { return 0 }
    return feedItems.prefix(30).firstIndex(of: item) ?? 0
  }

  /// The front page's stories in the order they appear, for the arrow keys.
  private var frontOrder: [LibraryItem] {
    let front = frontStories
    return (front.lead.map { [$0] } ?? []) + front.secondary + front.grid + front.river.flatMap(\.items)
  }

  /// The front page: the lead and its secondary stories, a band of what you've started and
  /// saved, then Read and Watch as equal sections, then the river.
  @ViewBuilder
  private var frontPage: some View {
    let front = frontStories
    leadRow(front.lead, secondary: front.secondary)
      .onHover { hoveringLead = $0 }
      .padding(.vertical, 28)
    shelfBand
    if !front.grid.isEmpty || !feeds.waiting.isEmpty {
      sectionHeading("Read", detail: front.lead.map { dayGroup($0.date) }, link: "All feeds", target: .feeds) {
        if !feeds.waiting.isEmpty {
          Button(action: showNew) {
            Label("\(feeds.waiting.count) new", systemImage: "arrow.up")
          }
          .buttonStyle(.textProminent)
          .help("Show the new posts")
        }
      }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 32, alignment: .top)], alignment: .leading, spacing: 32) {
        ForEach(front.grid) { item in
          StoryCard(
            item: item, source: channelName(item) ?? item.source, unseen: feeds.isUnseen(item),
            open: { openFromHome(item) }, perform: perform
          )
          .arriving(item, feeds: feeds, order: arrivalOrder(item), in: frontSpace)
          .id(item.id)
        }
      }
      .onHover { hoveringGrid = $0 }
      .padding(.bottom, 36)
    }
    if !videos.isEmpty {
      sectionHeading("Watch", detail: "New from your channels", link: "All channels", target: .channels) { EmptyView() }
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 32, alignment: .top)], alignment: .leading, spacing: 32) {
        ForEach(videos.prefix(8)) { item in
          VideoTile(item: item) { open(item, from: .videos) }
            .itemMenu(item, unseen: true, perform: perform)
        }
      }
      .padding(.bottom, 36)
    }
    if !front.river.isEmpty {
      river(front.river)
        .padding(.top, 8)
    }
  }

  /// The lead story, and on a wide window the next few stories beside it, both columns the
  /// same height so neither leaves a gap.
  @ViewBuilder
  private func leadRow(_ lead: LibraryItem?, secondary: [LibraryItem]) -> some View {
    if let lead {
      let story = LeadStory(
        item: lead, source: channelName(lead) ?? lead.source, unseen: feeds.isUnseen(lead),
        open: { openFromHome(lead) }, perform: perform
      )
      .arriving(lead, feeds: feeds, order: arrivalOrder(lead), in: frontSpace)
      .id(lead.id)
      if secondary.isEmpty {
        story
      } else {
        HStack(alignment: .top, spacing: 44) {
          story.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(secondary.enumerated()), id: \.element.id) { index, item in
              if index > 0 {
                Spacer(minLength: 14)
                Rectangle().fill(Color.stLine).frame(height: 1)
                Spacer(minLength: 14)
              }
              SecondaryStory(item: item, source: channelName(item) ?? item.source, unseen: feeds.isUnseen(item)) {
                openFromHome(item)
              }
              .arriving(item, feeds: feeds, order: arrivalOrder(item), in: frontSpace)
              .id(item.id)
              .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
            }
          }
          .frame(width: 340)
          .frame(maxHeight: .infinity, alignment: .topLeading)
        }
        .fixedSize(horizontal: false, vertical: true)
      }
    } else {
      feedsEmpty
    }
  }

  /// "Read  Today  ↑ 4 new … All feeds" over a heavy rule.
  private func sectionHeading<Extra: View>(
    _ title: String, detail: String?, link: String, target: AppSection,
    @ViewBuilder extra: () -> Extra
  ) -> some View {
    VStack(spacing: 0) {
      Rectangle().fill(Color.stInk).frame(height: 2)
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text(title)
          .font(.ui(26, .semibold, relativeTo: .title2))
          .tracking(-0.6)
          .foregroundStyle(Color.stInk)
        if let detail {
          Text(detail)
            .font(.reading(19, .regular, italic: true))
            .foregroundStyle(Color.stMuted)
        }
        extra()
        Spacer(minLength: 8)
        Button(link) { go(target) }.buttonStyle(.text)
      }
      .padding(.top, 14)
      .padding(.bottom, 20)
    }
  }

  /// Pick up where you left off, The Edition and In Saved side by side, the same height.
  @ViewBuilder
  private var shelfBand: some View {
    let article = upNext.first { $0.progress >= 0.02 }
    let video = continuingVideos.first
    let saved = Array(upNext.filter { $0.progress < 0.02 }.prefix(3))
    let hasPickUp = article != nil || video != nil
    if hasPickUp || showsEditionStrip || !saved.isEmpty || upNextError != nil {
      let layout = wide
        ? AnyLayout(HStackLayout(alignment: .top, spacing: 36))
        : AnyLayout(VStackLayout(alignment: .leading, spacing: 28))
      layout {
        if hasPickUp {
          VStack(alignment: .leading, spacing: 14) {
            ColumnHeading(title: "Pick up where you left off")
            if let article { PickUpRow(item: article, watching: false) { open(article, from: .upNext) } }
            if let video { PickUpRow(item: video, watching: true) { open(video, from: .continuing) } }
          }
          .frame(maxWidth: .infinity, maxHeight: wide ? .infinity : nil, alignment: .topLeading)
        }
        if !saved.isEmpty {
          VStack(alignment: .leading, spacing: 0) {
            ColumnHeading(title: "In Saved", link: "Open Saved") { go(.saved) }
            ForEach(Array(saved.enumerated()), id: \.element.id) { index, item in
              NumberedRow(number: index + 1, item: item, divider: index < saved.count - 1) { open(item, from: .upNext) }
                .itemMenu(item, perform: perform)
            }
          }
          .frame(maxWidth: .infinity, maxHeight: wide ? .infinity : nil, alignment: .topLeading)
        } else if let upNextError {
          HStack {
            Text(upNextError).font(.stSmall).foregroundStyle(Color.stMuted)
            Button("Try again") { Task { await loadUpNext() } }.buttonStyle(.text)
          }
          .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        if showsEditionStrip {
          editionStrip
            .frame(maxWidth: wide ? 300 : .infinity, maxHeight: wide ? .infinity : nil, alignment: .topLeading)
            .editionDelivery(date: edition.status?.date, fresh: edition.isFresh)
        }
      }
      // Equal heights only side by side; stacked, each section takes what it needs.
      .fixedSize(horizontal: false, vertical: wide)
      .padding(.top, 4)
      .padding(.bottom, 40)
    }
  }

  /// Older posts as headlines, three columns across on a wide window, under each day's name.
  private func river(_ days: [(label: String, items: [LibraryItem])]) -> some View {
    VStack(alignment: .leading, spacing: 28) {
      ForEach(days, id: \.label) { day in
        VStack(alignment: .leading, spacing: 0) {
          RiverHeading(title: day.label) { EmptyView() }
          LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 32, alignment: .top)], alignment: .leading, spacing: 0) {
            ForEach(day.items) { item in
              HeadlineRow(item: item, source: channelName(item) ?? item.source, unseen: feeds.isUnseen(item)) {
                openFromHome(item)
              }
              .arrival(feeds.arrivals[item.id], order: arrivalOrder(item))
              .id(item.id)
              .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
            }
          }
        }
      }
      Button {
        go(.feeds)
      } label: {
        HStack(spacing: 6) {
          if let total = feeds.total, total > feedItems.count {
            Text("\(total - feedItems.count) more in Feeds")
          } else {
            Text("Open Feeds")
          }
          Image(systemName: "arrow.right").imageScale(.small)
        }
        .font(.ui(13, .medium))
        .foregroundStyle(Color.stInk)
      }
      .buttonStyle(.plain)
    }
  }

  /// Opens a feed post from the front page, with the feed list beside it.
  private func openFromHome(_ item: LibraryItem) {
    listFocused = true
    open(item, from: .feeds)
  }

  // MARK: An item opened from Home

  /// Wide enough to keep the list beside the item.
  private var showsSourceColumn: Bool { contentWidth >= 760 }

  /// The list the item came from on the left as a column of headlines, the item in the reader
  /// or player across the rest.
  private func openItem(_ item: LibraryItem) -> some View {
    HStack(spacing: 0) {
      if showsSourceColumn {
        sourceColumn
          .frame(width: 340 + sidebarInset)
          .background(Color.stGroup)
        Rectangle().fill(Color.stLine).frame(width: 1)
      }
      peekCard(item, inSheet: true)
        .padding(.leading, showsSourceColumn ? 0 : sidebarInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color.stPage)
  }

  private var sourceTitle: String {
    switch peekSource {
    case .feeds: return "From your feeds"
    case .videos: return "New videos"
    case .upNext: return "In Saved"
    case .continuing: return "Continue watching"
    }
  }

  /// "‹ HOME / FROM YOUR FEEDS", then the section's stories as headlines under each day's name,
  /// with the open one marked.
  private var sourceColumn: some View {
    VStack(alignment: .leading, spacing: 12) {
      BackBar(back: PageBack(crumbs: ["Home", sourceTitle], action: close))
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 18) {
            let days = sourceDays
            ForEach(days, id: \.label) { day in
              VStack(alignment: .leading, spacing: 0) {
                RiverHeading(title: day.label) {
                  if day.label == days.first?.label, let position = peekPosition {
                    Text(position)
                      .font(.mono(11))
                      .foregroundStyle(Color.stMuted)
                      .monospacedDigit()
                  }
                }
                ForEach(day.items) { item in
                  sourceRow(item)
                }
              }
            }
          }
          // Room for the open story's box, which reaches 10pt either side of the rows.
          .padding(.horizontal, 10)
          .padding(.bottom, 16)
        }
        .scrollContentBackground(.hidden)
        .focusable()
        .focused($sourceFocused)
        .focusEffectDisabled()
        .onKeyPress(.downArrow) { move(1); return .handled }
        .onKeyPress(.upArrow) { move(-1); return .handled }
        .onAppear { if let id = peek?.id { proxy.scrollTo(id, anchor: .center) } }
        .onChange(of: peek?.id) { _, id in
          guard let id else { return }
          withAnimation(reduceMotion ? nil : StashMotion.feedback) { proxy.scrollTo(id) }
        }
      }
      Text("↑ ↓ next story · Esc back to Home")
        .font(.mono(11))
        .foregroundStyle(Color.stMuted)
        .padding(.bottom, 12)
    }
    .padding(.leading, 10 + sidebarInset)
    .padding(.trailing, 10)
    .padding(.top, 14)
  }

  /// The open item's list, by day for feed posts, under the section's name otherwise.
  private var sourceDays: [(label: String, items: [LibraryItem])] {
    peekSource == .feeds ? groups(peekList) : [(label: sourceTitle, items: peekList)]
  }

  /// "2 of 23"
  private var peekPosition: String? {
    let list = peekList
    guard let peek, let index = list.firstIndex(of: peek) else { return nil }
    return "\(index + 1) of \(list.count)"
  }

  private func sourceRow(_ item: LibraryItem) -> some View {
    let fromFeeds = peekSource == .feeds
    let unseen = feeds.isUnseen(item)
    return HeadlineRow(
      item: item, source: channelName(item) ?? item.source,
      unseen: fromFeeds && unseen, selected: peek?.id == item.id, read: fromFeeds && !unseen
    ) {
      sourceFocused = true
      show(item)
    }
    .id(item.id)
    .itemMenu(item, unseen: unseen, perform: perform)
  }
  #endif

  // MARK: iOS layouts

  #if os(iOS)
  @ViewBuilder
  private var content: some View {
    if UIDevice.current.userInterfaceIdiom == .pad && contentWidth >= 640 {
      padHome
    } else {
      phoneHome
    }
  }

  /// A List, so rows swipe: right to save, left to archive.
  private var phoneHome: some View {
    ScrollViewReader { proxy in
      List {
        FolioView(content: Self.folio).plainListRow(top: 8)
        iPhoneHeader.plainListRow(top: 12)
        continuationSection.plainListRow(top: 18)
        if let lead = feedItems.first {
          featuredStory(lead, large: false).plainListRow(top: 22)
        }
        if showsEditionStrip {
          editionStrip
            .editionDelivery(date: edition.status?.date, fresh: edition.isFresh)
            .plainListRow(top: 18)
        }
        if !videos.isEmpty { latestVideos.plainListRow(top: 20) }
        if !upNext.isEmpty { savedSuggestions.plainListRow(top: 20) }
        feedsHeading
          .id(Self.topID)
          // The feed starts here, so "at the top" means this heading is in view.
          .onScrollVisibilityChange(threshold: 0.5) { atTop = $0 }
          .plainListRow(top: 22, bottom: 10)

        let items = feedItems
        if items.isEmpty {
          feedsEmpty.plainListRow()
        } else {
          ForEach(groups(Array(items.dropFirst())), id: \.label) { group in
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
              .arrival(feeds.arrivals[item.id], order: items.prefix(30).firstIndex(of: item) ?? 0)
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
      .onScrollPhaseChange { _, phase in scrolling = phase != .idle }
      .onChange(of: scrollTopTick) {
        withAnimation(reduceMotion ? nil : StashMotion.change) { proxy.scrollTo(Self.topID, anchor: .top) }
      }
    }
  }

  private var padHome: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          FolioView(content: Self.folio)
            .id(Self.topID)
          iPhoneHeader
          continuationSection
          if showsEditionStrip {
            editionStrip.editionDelivery(date: edition.status?.date, fresh: edition.isFresh)
          }
          let items = feedItems
          if let lead = items.first {
            SectionHeading(title: dayGroup(lead.date) == "Today" ? "Today's stories" : "From your feeds") {
              Button("All feeds") { go(.feeds) }.buttonStyle(.text)
            }
            let editorial: AnyLayout = contentWidth >= 1000
              ? AnyLayout(HStackLayout(alignment: .top, spacing: 24))
              : AnyLayout(VStackLayout(alignment: .leading, spacing: 20))
            editorial {
              featuredStory(lead, large: true)
              VStack(alignment: .leading, spacing: 18) {
                if let second = items.dropFirst().first { featuredStory(second, large: false) }
                if let video = videos.first {
                  SectionHeading(title: "Watch") { Button("See all") { go(.channels) }.buttonStyle(.text) }
                  Button { open(video, from: .videos) } label: { VideoRow(item: video) }
                    .buttonStyle(.plain)
                    .itemMenu(video, unseen: true, perform: perform)
                }
              }
              .frame(maxWidth: contentWidth >= 1000 ? 350 : .infinity, alignment: .leading)
            }
          }
          if !upNext.isEmpty { savedSuggestions }
          feedsHeading
          if items.isEmpty {
            feedsEmpty
          } else {
            ForEach(groups(Array(items.dropFirst(2))), id: \.label) { group in
              DayBand(label: group.label)
              ListBox {
                ForEach(group.items) { item in
                  Button { open(item, from: .feeds) } label: {
                    ItemRow(item: item, subscriptionName: channelName(item), unseen: feeds.isUnseen(item))
                  }
                  .buttonStyle(.plain)
                  .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
                }
              }
            }
            if (feeds.total ?? 0) > items.count { moreRow(items.count) }
          }
        }
        .padding(.horizontal, contentWidth >= 1000 ? 36 : 24)
        .padding(.top, 12)
        .padding(.bottom, 56)
        .frame(maxWidth: Self.maxWidth)
        .frame(maxWidth: .infinity)
      }
      .scrollContentBackground(.hidden)
      .refreshable { await reload() }
      .onScrollGeometryChange(for: Bool.self) { Self.isAtTop($0) } action: { _, top in atTop = top }
      .onScrollPhaseChange { _, phase in scrolling = phase != .idle }
      .onChange(of: scrollTopTick) {
        withAnimation(reduceMotion ? nil : StashMotion.change) { proxy.scrollTo(Self.topID, anchor: .top) }
      }
    }
  }

  private func featuredStory(_ item: LibraryItem, large: Bool) -> some View {
    Button { open(item, from: .feeds) } label: {
      VStack(alignment: .leading, spacing: 11) {
        ItemCover(item: item)
          .frame(maxWidth: .infinity)
          .frame(height: large ? 300 : 200)
          .clipped()
          .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
          .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(Color.stLine, lineWidth: 1))
        Kicker(channelName(item) ?? item.source, accent: true)
        Text(item.title)
          .font(.reading(large ? 32 : 27, .medium, relativeTo: .title))
          .foregroundStyle(Color.stInk)
          .multilineTextAlignment(.leading)
          .lineLimit(3)
        HStack(spacing: 8) {
          Text(item.author ?? item.source)
          Text("·")
          Text(shortAge(item.publishedAt ?? item.savedAt))
          if let minutes = item.readingMinutes { Text("· \(minutes) min read") }
        }
        .font(.stDetail)
        .foregroundStyle(Color.stMuted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .itemMenu(item, unseen: feeds.isUnseen(item), perform: perform)
    .accessibilityLabel("Read (item.title)")
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
        #if os(iOS)
        if UIDevice.current.userInterfaceIdiom == .phone && article != nil && video != nil {
          ScrollView(.horizontal) {
            HStack(spacing: 12) {
              if let article {
                ContinuationCard(item: article, watching: false) { open(article, from: .upNext) }
                  .frame(width: min(contentWidth - 50, 340))
              }
              if let video {
                ContinuationCard(item: video, watching: true) { open(video, from: .continuing) }
                  .frame(width: min(contentWidth - 50, 340))
              }
            }
          }
          .scrollIndicators(.hidden)
          .accessibilityLabel("Continue reading and watching")
        } else {
          continuationCards(article: article, video: video)
        }
        #else
        continuationCards(article: article, video: video)
        #endif
      }
    }
  }

  private func continuationCards(article: LibraryItem?, video: LibraryItem?) -> some View {
    let layout = continuationSideBySide
      ? AnyLayout(HStackLayout(alignment: .top, spacing: 20))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: 14))
    return layout {
      if let article {
        ContinuationCard(item: article, watching: false) { open(article, from: .upNext) }
      }
      if let video {
        ContinuationCard(item: video, watching: true) { open(video, from: .continuing) }
      }
    }
  }

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

  /// The two "pick up" cards side by side, when there's room and they aren't in Mac's side column.
  private var continuationSideBySide: Bool {
    #if os(macOS)
    !wide && contentWidth >= 700
    #else
    contentWidth >= 900
    #endif
  }

  /// The Edition's strip stacks its two halves in Mac's shelf band.
  private var editionStacked: Bool {
    #if os(macOS)
    true
    #else
    false
    #endif
  }

  private var showsEditionStrip: Bool {
    edition.isOut && edition.state?.showOnHome != false
  }

  private var editionStrip: some View {
    Button { go(.edition) } label: {
      HStack(alignment: editionStacked ? .top : .center, spacing: 18) {
        let layout = editionStacked
          ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
          : AnyLayout(HStackLayout(spacing: 18))
        layout {
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
            if !editionStacked {
              Rectangle().fill(Color.stLine).frame(width: 1, height: 34)
            }
            VStack(alignment: .leading, spacing: 2) {
              Kicker("In this week's issue", accent: true)
              Text(leadTitle)
                .font(.reading(20, .medium, relativeTo: .title3))
                .foregroundStyle(Color.stInk)
                #if os(macOS)
                .lineLimit(editionStacked ? 3 : 1)
                #else
                .lineLimit(2)
                #endif
                .multilineTextAlignment(.leading)
            }
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "arrow.right")
          .font(.ui(13, .semibold))
          .foregroundStyle(Color.stMuted)
          .padding(.top, editionStacked ? 6 : 0)
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
        Button(action: showNew) {
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

  // MARK: New posts arriving

  /// Where "N new" scrolls to: the top of the front page on Mac, the feed's heading on iPhone.
  private static let topID = "home-top"

  /// On Mac, within about 120pt of the top counts as the top, as on the web.
  private static func isAtTop(_ geometry: ScrollGeometry) -> Bool {
    geometry.contentOffset.y + geometry.contentInsets.top <= 120
  }

  /// Something's in progress that new posts shouldn't move under: a scroll, the pointer
  /// resting on the stories, or a story open over Home.
  private var busy: Bool {
    #if os(macOS)
    let hovering = hoveringLead || hoveringGrid
    #else
    let hovering = false
    #endif
    return scrolling || hovering || peek != nil || !path.isEmpty || searching || capturing
  }

  /// Something changed that might let waiting posts in: reaching the top, or finishing a scroll.
  private func settle() {
    if revealOnTop, atTop, !scrolling {
      revealNew()
    } else {
      arriveIfIdle()
    }
  }

  private func checkAndArrive() async {
    await feeds.checkNew(feedsQuery)
    arriveIfIdle()
  }

  /// New posts drop in on their own when you're at the top of Home and not in the middle of
  /// something; otherwise they wait behind "N new".
  private func arriveIfIdle() {
    guard !feeds.waiting.isEmpty, atTop, !busy, scenePhase == .active, isActivePage else { return }
    revealNew()
  }

  /// The gap opens, then the new posts fall into it one after another.
  private func revealNew() {
    revealOnTop = false
    guard !feeds.waiting.isEmpty else { return }
    let count = withAnimation(reduceMotion ? StashMotion.fade : .smooth(duration: 0.38)) { feeds.showWaiting() }
    #if os(iOS)
    guard count > 0, !reduceMotion else { return }
    Task {
      try? await Task.sleep(for: .seconds(ArrivalDrop.gapTime + 0.3))
      Feedback.arrived()
    }
    #endif
  }

  /// "N new": drops them in now at the top, or scrolls up and drops them in on arrival.
  private func showNew() {
    if atTop {
      revealNew()
    } else {
      revealOnTop = true
      scrollTopTick += 1
    }
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
    #if os(macOS)
    // Home's key handling moves through the open item's list, wherever it was opened from.
    listFocused = true
    #endif
  }

  private func close() {
    peek = nil
    #if os(macOS)
    selectedID = nil
    listFocused = true
    #endif
  }

  #if os(macOS)
  /// Up and down arrows move through the feed list, opening each item; with an item open they
  /// move through the list it came from.
  private func step(_ offset: Int) -> KeyPress.Result {
    if peek != nil {
      move(offset)
      return .handled
    }
    let items = frontOrder
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
