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

/// A sidebar on Mac, grouped into Read and Watch like the web app. On iPad, the system sidebar
/// with the same groups (a tab bar along the top when it's tucked away). On iPhone, tabs for
/// Home, Read, Watch and Settings. The Edition opens from Home or Read’s More menu.
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
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  /// The full player, opened from the mini player.
  @State private var showingPlayer = false
  /// The iPad sidebar's own arrangement, with Feeds, Saved and Latest kept in its tab bar.
  @AppStorage("padTabs") private var padCustomization = TabViewCustomization()
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
      #if os(iOS)
      // iPad side by side with another app can switch between its sidebar and iPhone's tabs.
      // Snapshots for the app switcher can flip the width for a moment, so only follow it while
      // the app is in front.
      .onChange(of: horizontalSizeClass) { _, _ in if scenePhase == .active { fitSections() } }
      #endif
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
      // iPad shows its tabs at the top or in a sidebar, so only iPhone's bottom bar is aimed at.
      let moment = horizontalSizeClass == .compact ? Moments.shared.current : nil
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

  /// A full-width iPad: every page in the sidebar rather than a row of pages in each tab.
  private var wide: Bool { horizontalSizeClass == .regular }

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

  /// iPad: Read and Watch as groups in the system sidebar, as on the Mac and the web, so every
  /// page is one tap away. The sidebar and tab bar are the system's, so they take on Liquid
  /// Glass on iPadOS 26.
  private var padTabs: some View {
    TabView(selection: $section) {
      Tab("Home", systemImage: "house", value: AppSection.home) {
        page(.home) { HomeView(go: go) }
      }
      .customizationID("home")
      TabSection("Read") {
        Tab("Feeds", systemImage: "dot.radiowaves.up.forward", value: AppSection.feeds) {
          page(.feeds) { FeedsView() }
        }
        .customizationID("feeds")
        .defaultVisibility(.visible, for: .tabBar)
        Tab("Saved", systemImage: "bookmark", value: AppSection.saved) {
          page(.saved) { SavedView(archive: false) }
        }
        .customizationID("saved")
        .defaultVisibility(.visible, for: .tabBar)
        Tab("The Edition", systemImage: "newspaper", value: AppSection.edition) {
          page(.edition) { EditionView(onPutAway: { section = .feeds }) }
        }
        .customizationID("edition")
        .hidden(!edition.isOut)
        Tab("Highlights", systemImage: "highlighter", value: AppSection.highlights) {
          page(.highlights) { HighlightsView() }
        }
        .customizationID("highlights")
        Tab("Discover", systemImage: "safari", value: AppSection.discover) {
          page(.discover) { DiscoverView() }
        }
        .customizationID("discover")
        Tab("Archive", systemImage: "archivebox", value: AppSection.archive) {
          page(.archive) { SavedView(archive: true) }
        }
        .customizationID("archive")
        Tab("Trash", systemImage: "trash", value: AppSection.trash) {
          page(.trash) { SavedView(archive: false, trash: true) }
        }
        .customizationID("trash")
      }
      TabSection("Watch") {
        Tab("Latest", systemImage: "play.rectangle", value: AppSection.channels) {
          page(.channels) { WatchView(kind: .channels) }
        }
        .customizationID("channels")
        .defaultVisibility(.visible, for: .tabBar)
        Tab("Saved", systemImage: "bookmark", value: AppSection.savedVideos) {
          page(.savedVideos) { WatchView(kind: .saved) }
        }
        .customizationID("savedVideos")
        ForEach(collections) { collection in
          Tab(collection.name, systemImage: "folder", value: AppSection.collection(collection.id)) {
            page(.collection(collection.id)) { WatchView(kind: .collection(collection)) }
          }
          .customizationID("collection-\(collection.id)")
        }
      }
      Tab("Settings", systemImage: "gearshape", value: AppSection.settings) {
        page(.settings) { SettingsView() }
      }
      .customizationID("settings")
    }
    .tabViewStyle(.sidebarAdaptable)
    .tabViewCustomization($padCustomization)
    .background { padShortcuts }
    .linkCapture(isPresented: $capturing)
    // Lists scroll clear of the mini player in the corner.
    .safeAreaPadding(.bottom, player.host == .mini ? 104 : 0)
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

  /// Moves between iPhone's Read and Watch tabs and iPad's separate pages when the width changes.
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
