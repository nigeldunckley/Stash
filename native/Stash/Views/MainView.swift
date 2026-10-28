import SwiftUI

enum AppSection: Hashable {
  case home, edition, feeds, saved, highlights, discover, archive, trash, channels, savedVideos, settings
  case collection(String)
  /// iPhone only: Read and Watch, each with a row of pages along the top.
  case read, watch

  /// Kept between launches as text.
  var key: String {
    switch self {
    case .home: return "home"
    case .edition: return "edition"
    case .feeds: return "feeds"
    case .saved: return "saved"
    case .highlights: return "highlights"
    case .discover: return "discover"
    case .archive: return "archive"
    case .trash: return "trash"
    case .channels: return "channels"
    case .savedVideos: return "savedVideos"
    case .settings: return "settings"
    case .read: return "read"
    case .watch: return "watch"
    case .collection(let id): return "collection:\(id)"
    }
  }

  init(key: String) {
    switch key {
    case "edition": self = .edition
    case "feeds": self = .feeds
    case "saved": self = .saved
    case "highlights": self = .highlights
    case "discover": self = .discover
    case "archive": self = .archive
    case "trash": self = .trash
    case "channels": self = .channels
    case "savedVideos": self = .savedVideos
    case "settings": self = .settings
    case "read": self = .read
    case "watch": self = .watch
    case let other where other.hasPrefix("collection:"): self = .collection(String(other.dropFirst(11)))
    default: self = .home
    }
  }
}

/// A sidebar on Mac and iPad, and four tabs on iPhone. The Edition opens from Home or Read’s More menu.
struct MainView: View {
  @Environment(EditionModel.self) private var edition
  @Environment(\.scenePhase) private var scenePhase
  @SceneStorage("section") private var storedSection = "home"
  @State private var section: AppSection = .home
  @State private var collections: [WatchCollection] = []
  /// Which page Read and Watch show on iPhone.
  @State private var readPage: AppSection = .feeds
  @State private var watchPage: AppSection = .channels
  @SceneStorage("readPage") private var readPageKey = "feeds"
  @SceneStorage("watchPage") private var watchPageKey = "channels"
  @State private var showingEdition = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  #if os(iOS)
  @Environment(PlayerController.self) private var player
  /// The full player, opened from the mini player.
  @State private var showingPlayer = false
  /// "Save a link", from ⌘N on an iPad keyboard.
  @State private var capturing = false
  #endif

  var body: some View {
    shell
      .toasts(Toaster.shared)
      .onAppear {
        let restored = AppSection(key: storedSection)
        // Restore a valid destination; The Edition no longer occupies a temporary tab.
        #if os(iOS)
        let savedRead = AppSection(key: readPageKey)
        readPage = [.feeds, .saved, .highlights, .discover, .archive, .trash].contains(savedRead) ? savedRead : .feeds
        let savedWatch = AppSection(key: watchPageKey)
        watchPage = savedWatch == .savedVideos ? .savedVideos : .channels
        if case .collection = savedWatch { watchPage = savedWatch }
        if restored == .edition { section = .home } else { go(restored) }
        if wide { fitSections() }
        #else
        section = restored == .edition && !edition.isOut ? .home : restored
        #endif
      }
      .onChange(of: section) { _, value in storedSection = value.key }
      .onChange(of: readPage) { _, value in readPageKey = value.key }
      .onChange(of: watchPage) { _, value in watchPageKey = value.key }
      .onChange(of: collections) { _, current in
        #if os(iOS)
        if case .collection(let id) = watchPage, !current.contains(where: { $0.id == id }) { watchPage = .channels }
        if case .collection(let id) = section, !current.contains(where: { $0.id == id }) { section = .channels }
        #endif
      }
      .onReceive(NotificationCenter.default.publisher(for: .stashBrowseFeeds)) { _ in go(.feeds) }
      .onChange(of: LibraryChanges.shared.revision) { _, _ in
        Task { collections = (try? await Watch.collections()) ?? collections }
      }
      .onChange(of: edition.isOut) { _, out in if !out && section == .edition { section = .home } }
      .onChange(of: scenePhase) { _, phase in
        if phase == .active { LibraryChanges.shared.publish(); Task { await edition.refresh() } }
        #if os(iOS)
        if phase == .active { fitSections() }
        #endif
      }
      .task {
        collections = (try? await Watch.collections()) ?? []
        #if os(iOS)
        // A collection restored from last time that's gone (or couldn't load) falls back to Latest.
        if case .collection(let id) = section, !collections.contains(where: { $0.id == id }) { section = .channels }
        #endif
      }
      .task {
        let launchedInto = storedSection
        await edition.refresh()
        #if os(macOS)
        if launchedInto == "edition" && edition.isOut { section = .edition }
        #else
        if wide && launchedInto == "edition" && edition.isOut { section = .edition }
        #endif
      }
  }

  #if os(macOS)
  /// Stash's own floating sidebar beside the page, rather than the system sidebar.
  private var shell: some View {
    MacShell(section: $section, collections: collections)
  }
  #else
  private var flightLayer: some View {
    GeometryReader { geometry in
      // Only iPhone's bottom tab bar is aimed at.
      let moment = !wide ? Moments.shared.current : nil
      MomentFlight(moment: moment, target: moment.map { tabTarget($0.kind, in: geometry.frame(in: .global)) })
    }
    .allowsHitTesting(false)
  }

  /// Where a tab's icon sits in the tab bar: Read for articles, Watch for videos.
  private func tabTarget(_ kind: MomentKind, in frame: CGRect) -> CGRect {
    let tabs = 4
    let read = 1
    let index = kind == .savedVideo || kind == .archivedVideo ? read + 1 : read
    let x = frame.minX + frame.width * (CGFloat(index) + 0.5) / CGFloat(tabs)
    return CGRect(x: x - 12, y: frame.maxY - 42, width: 24, height: 24)
  }

  /// Keep the iPad's destinations when its window narrows.
  private var wide: Bool { UIDevice.current.userInterfaceIdiom == .pad }

  private var shell: some View {
    Group {
      if wide { padTabs } else { phoneTabs }
    }
    // The video you left, just above the tab bar (on iPad, in the corner).
    .overlay(alignment: wide ? .bottomTrailing : .bottom) {
      if player.host == .mini {
        MiniPlayer(onExpand: { showingPlayer = true })
          .frame(maxWidth: wide ? 460 : nil)
          .padding(.horizontal, wide ? 20 : 10)
          .padding(.bottom, wide ? 20 : 58)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(reduceMotion ? StashMotion.fade : StashMotion.player, value: player.host == .mini)
    .sheet(isPresented: $showingEdition) {
      NavigationStack {
        EditionView(onPutAway: { showingEdition = false })
          .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { showingEdition = false } } }
      }
    }
    // A saved or archived item moving to its tab.
    .overlay { flightLayer }
    .sheet(isPresented: $showingPlayer) {
      if let item = player.item {
        NavigationStack {
          PlayerScreen(item: item, queue: player.queue, actions: [], perform: { _, _ in }, resumePlayback: false, onMini: { showingPlayer = false })
            .toolbar {
              ToolbarItem(placement: .cancellationAction) {
                Button("Done") { showingPlayer = false }
              }
            }
        }
      }
    }
  }

  /// A persistent editorial sidebar at full iPad widths, and a compact destination menu when
  /// the window is too narrow to keep a reader and the sidebar comfortably side by side.
  private var padTabs: some View {
    GeometryReader { geometry in
      let compact = geometry.size.width < 900
      HStack(spacing: 0) {
        padSidebar
          .frame(width: compact ? 0 : 194)
          .clipped()
          .allowsHitTesting(!compact)
          .accessibilityHidden(compact)
        Rectangle().fill(Color.stLine).frame(width: compact ? 0 : 1)
        VStack(spacing: 0) {
          padCompactBar
            .frame(height: compact ? 54 : 0)
            .clipped()
            .allowsHitTesting(compact)
            .accessibilityHidden(!compact)
          padPage
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .background(Color.stPage)
    .background { padShortcuts }
    .linkCapture(isPresented: $capturing)
    .safeAreaPadding(.bottom, player.host == .mini ? 104 : 0)
  }

  private var padSidebar: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 9) {
        Image("Mark").resizable().frame(width: 28, height: 28)
          .clipShape(RoundedRectangle(cornerRadius: 6))
        Text("Stash").font(.ui(19, .semibold)).foregroundStyle(Color.stInk)
      }
      .padding(.horizontal, 18)
      .frame(height: 68)
      VStack(alignment: .leading, spacing: 5) {
        padSidebarButton("Home", icon: "house", target: .home)
        padSidebarButton("Read", icon: "text.alignleft", target: .feeds)
        padSidebarButton("Saved", icon: "bookmark", target: .saved)
        padSidebarButton("Watch", icon: "play.rectangle", target: .channels)
        Menu {
          if edition.isOut { Button("The Edition", systemImage: "newspaper") { go(.edition) } }
          Button("Highlights", systemImage: "highlighter") { go(.highlights) }
          Button("Discover", systemImage: "safari") { go(.discover) }
          Button("Archive", systemImage: "archivebox") { go(.archive) }
          Button("Trash", systemImage: "trash") { go(.trash) }
          Button("Saved videos", systemImage: "bookmark") { go(.savedVideos) }
          ForEach(collections) { collection in
            Button(collection.name, systemImage: "folder") { go(.collection(collection.id)) }
          }
        } label: {
          Label("More", systemImage: "ellipsis")
            .font(.ui(14))
            .foregroundStyle(Color.stMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 15)
            .frame(height: 44)
        }
        .buttonStyle(.plain)
      }
      .padding(.horizontal, 10)
      Spacer()
      padSidebarButton("Settings", icon: "gearshape", target: .settings)
        .padding(.horizontal, 10)
        .padding(.bottom, 18)
    }
    .background(Color.stSurface)
  }

  private func padSidebarButton(_ title: String, icon: String, target: AppSection) -> some View {
    Button { go(target) } label: {
      Label(title, systemImage: icon)
        .font(.ui(14, section == target ? .semibold : .regular))
        .foregroundStyle(section == target ? Color.stAccentText : Color.stInk2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 15)
        .frame(height: 44)
        .background(section == target ? Color.stSelected : Color.clear,
                    in: RoundedRectangle(cornerRadius: Radius.sm))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(section == target ? .isSelected : [])
  }

  private var padCompactBar: some View {
    HStack {
      Menu {
        Button("Home", systemImage: "house") { go(.home) }
        Button("Read", systemImage: "text.alignleft") { go(.feeds) }
        Button("Saved", systemImage: "bookmark") { go(.saved) }
        Button("Watch", systemImage: "play.rectangle") { go(.channels) }
        Button("Settings", systemImage: "gearshape") { go(.settings) }
        Divider()
        if edition.isOut { Button("The Edition") { go(.edition) } }
        Button("Highlights") { go(.highlights) }
        Button("Discover") { go(.discover) }
        Button("Archive") { go(.archive) }
        Button("Trash") { go(.trash) }
        Button("Saved videos") { go(.savedVideos) }
        ForEach(collections) { collection in Button(collection.name) { go(.collection(collection.id)) } }
      } label: {
        HStack(spacing: 9) {
          Image("Mark").resizable().frame(width: 26, height: 26)
            .clipShape(RoundedRectangle(cornerRadius: 5))
          Text("Stash").font(.ui(18, .semibold))
          Image(systemName: "chevron.down").font(.ui(10))
        }
      }
      .accessibilityLabel("Choose section")
      Spacer()
      Button { capturing = true } label: { Label("Save a link", systemImage: "plus") }
        .labelStyle(.iconOnly)
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 22)
    .frame(height: 54)
    .background(Color.stSurface)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
  }

  @ViewBuilder
  private var padPage: some View {
    switch section {
    case .home: page(.home) { HomeView(go: go) }
    case .feeds, .read: page(section) { FeedsView() }
    case .saved: page(.saved) { SavedView(archive: false) }
    case .edition: page(.edition) { EditionView(onPutAway: { section = .feeds }) }
    case .highlights: page(.highlights) { HighlightsView() }
    case .discover: page(.discover) { DiscoverView() }
    case .archive: page(.archive) { SavedView(archive: true) }
    case .trash: page(.trash) { SavedView(archive: false, trash: true) }
    case .channels, .watch: page(section) { WatchView(kind: .channels) }
    case .savedVideos: page(.savedVideos) { WatchView(kind: .saved) }
    case .collection(let id):
      if let collection = collections.first(where: { $0.id == id }) {
        page(section) { WatchView(kind: .collection(collection)) }
      } else {
        page(section) { WatchView(kind: .channels) }
      }
    case .settings: page(.settings) { SettingsView() }
    }
  }

  /// Keyboard shortcuts for an iPad with a keyboard. Hold ⌘ to see them listed.
  private var padShortcuts: some View {
    Group {
      Button("Home") { go(.home) }.keyboardShortcut("1", modifiers: .command)
      Button("Feeds") { go(.feeds) }.keyboardShortcut("2", modifiers: .command)
      Button("Saved") { go(.saved) }.keyboardShortcut("3", modifiers: .command)
      Button("Watch") { go(.channels) }.keyboardShortcut("4", modifiers: .command)
      Button("Settings") { go(.settings) }.keyboardShortcut(",", modifiers: .command)
      Button("Save a Link") { capturing = true }.keyboardShortcut("n", modifiers: .command)
    }
    .opacity(0)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .disabled(showingEdition || showingPlayer || capturing)
  }

  /// Only the page in front checks for new posts and owns the toolbar.
  private func page<Content: View>(_ value: AppSection, @ViewBuilder _ content: () -> Content) -> some View {
    content().environment(\.isActivePage, section == value)
  }

  /// Normalises restored destinations for iPhone tabs and the iPad sidebar.
  private func fitSections() {
    if wide {
      if section == .read { section = readPage == .edition && !edition.isOut ? .feeds : readPage }
      if section == .watch { section = watchPage }
    } else {
      switch section {
      case .feeds, .saved, .highlights, .discover, .archive, .trash:
        readPage = section
        section = .read
      case .edition:
        readPage = edition.isOut ? .edition : .feeds
        section = .read
      case .channels, .savedVideos, .collection:
        watchPage = section
        section = .watch
      default: break
      }
    }
  }

  private var phoneTabs: some View {
    TabView(selection: $section) {
      Tab("Home", systemImage: "house", value: AppSection.home) {
        page(.home) { HomeView(go: go) }
      }
      Tab("Read", systemImage: "text.alignleft", value: AppSection.read) {
        readRow.environment(\.isActivePage, section == .read)
      }
      Tab("Watch", systemImage: "play.rectangle", value: AppSection.watch) {
        watchRow.environment(\.isActivePage, section == .watch)
      }
      Tab("Settings", systemImage: "gearshape", value: AppSection.settings) {
        page(.settings) { SettingsView() }
      }
    }
    .tabViewStyle(.sidebarAdaptable)
  }

  private var readRow: some View {
    PageRow(selection: $readPage, pages: [(.feeds, "Feeds"), (.saved, "Saved")], extras: [
      (.highlights, "Highlights"), (.discover, "Discover"), (.archive, "Archive"), (.trash, "Trash"),
    ] + (edition.isOut ? [(.edition, "The Edition")] : []), moreTitle: "More") { page in
      switch page {
      case .saved: SavedView(archive: false)
      case .archive: SavedView(archive: true)
      case .trash: SavedView(archive: false, trash: true)
      case .edition: EditionView(onPutAway: { readPage = .feeds })
      case .highlights: HighlightsView()
      case .discover: DiscoverView()
      default: FeedsView()
      }
    }
  }

  private var watchRow: some View {
    PageRow(selection: $watchPage, pages: [(.channels, "Latest"), (.savedVideos, "Saved")], extras: Array(watchPages.dropFirst(2)), moreTitle: "Collections") { page in
      switch page {
      case .savedVideos: WatchView(kind: .saved)
      case .collection(let id):
        if let collection = collections.first(where: { $0.id == id }) {
          WatchView(kind: .collection(collection))
        } else {
          WatchView(kind: .channels)
        }
      default: WatchView(kind: .channels)
      }
    }
  }
  #endif

  private var watchPages: [(AppSection, String)] {
    [(AppSection.channels, "Latest"), (AppSection.savedVideos, "Saved")]
      + collections.map { (AppSection.collection($0.id), $0.name) }
  }

  /// Goes to a part of the app. On iPhone, pages inside Read and Watch open their tab.
  private func go(_ target: AppSection) {
    #if os(iOS)
    if wide {
      // On iPad every page has its own place in the sidebar.
      if target == .edition && !edition.isOut { showingEdition = true; return }
      switch target {
      case .read: section = readPage
      case .watch: section = watchPage
      default: section = target
      }
      return
    }
    switch target {
    case .edition:
      showingEdition = true
      return
    case .feeds, .saved, .highlights, .discover, .archive, .trash:
      readPage = target
      section = .read
      return
    case .channels, .savedVideos, .collection:
      watchPage = target
      section = .watch
      return
    default: break
    }
    #endif
    section = target
  }
}

#if os(iOS)
/// A row of pages along the top of a tab, as on the web app's iPhone layout.
struct PageRow<Content: View>: View {
  @Environment(\.isActivePage) private var tabActive
  @Binding var selection: AppSection
  let pages: [(AppSection, String)]
  var extras: [(AppSection, String)] = []
  var moreTitle = "More"
  @ViewBuilder let content: (AppSection) -> Content
  @State private var visited: [AppSection] = []

  var body: some View {
    ZStack {
      ForEach(visited, id: \.self) { page in
        let active = page == selection
        content(page)
          .opacity(active ? 1 : 0)
          .allowsHitTesting(active)
          .disabled(!active)
          .accessibilityHidden(!active)
          .environment(\.isActivePage, active && tabActive)
          .zIndex(active ? 1 : 0)
      }
    }
    .onAppear { visit(selection) }
    .onChange(of: selection) { _, page in visit(page) }
    .safeAreaInset(edge: .top, spacing: 0) {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) {
          primaryPages
          moreMenu
          Spacer(minLength: 0)
        }
        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) { primaryPages; Spacer(minLength: 0) }
          moreMenu.frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 6)
      .background(.bar)
    }
  }

  @ViewBuilder
  private var primaryPages: some View {
    ForEach(pages, id: \.0) { page, title in
      Button(title) { selection = page }
        .font(.ui(13, selection == page ? .medium : .regular, relativeTo: .subheadline))
        .foregroundStyle(selection == page ? Color.stPage : Color.stInk)
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .background(selection == page ? Color.stInk : Color.stSunken, in: Capsule())
        .buttonStyle(.plain)
        .accessibilityAddTraits(selection == page ? .isSelected : [])
    }
  }

  @ViewBuilder
  private var moreMenu: some View {
    if !extras.isEmpty {
      Menu {
        ForEach(extras, id: \.0) { page, title in
          Button { selection = page } label: {
            if selection == page { Label(title, systemImage: "checkmark") } else { Text(title) }
          }
        }
      } label: {
        Label(extras.first(where: { $0.0 == selection })?.1 ?? moreTitle, systemImage: "chevron.down")
          .font(.stSmall).lineLimit(1).truncationMode(.middle)
          .padding(.horizontal, 12).frame(minHeight: 44)
      }
      .foregroundStyle(Color.stInk)
      .accessibilityLabel(moreTitle)
      .accessibilityValue(extras.first(where: { $0.0 == selection })?.1 ?? "")
    }
  }

  private func visit(_ page: AppSection) {
    guard !visited.contains(page) else { return }
    visited.append(page)
    if visited.count > 8 { visited.removeFirst() }
  }
}
#endif
