#if os(macOS)
import SwiftUI

/// The Mac window: Stash's floating sidebar panel on the left, the page on the right, all on
/// one page colour with the title bar see-through above it. ⌃⌘S or the strip's sidebar button
/// hides the panel.
struct MacShell: View {
  @Binding var section: AppSection
  let collections: [WatchCollection]

  @Environment(\.scenePhase) private var scenePhase
  @Environment(PlayerController.self) private var player
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @State private var channelsCount: Int?
  @State private var discoverCount: Int?
  @State private var capturing = false
  /// Pages you've visited, newest last. They stay alive behind the current one, so each keeps
  /// its scroll position and anything it has open.
  @State private var visited: [AppSection] = []
  /// The full player, opened from the mini player over whatever page you're on.
  @State private var showingPlayer = false
  @State private var floating: FloatingPlayer?
  @AppStorage("miniPlayerCorner") private var miniCorner = MiniCorner.bottomTrailing
  @State private var miniDrag: CGSize = .zero

  /// How many pages stay alive at once.
  private static let keepAlive = 6

  var body: some View {
    HStack(spacing: 0) {
      if !sidebarHidden {
        SidebarPanel(
          section: $section,
          collections: collections,
          channelsCount: channelsCount,
          discoverCount: discoverCount,
          capturing: $capturing
        )
        .padding(.leading, 12)
        .padding(.bottom, 12)
        .transition(.move(edge: .leading).combined(with: .opacity))
      }
      ZStack {
        ForEach(visited, id: \.self) { visitedSection in
          let active = visitedSection == section && !showingPlayer
          page(visitedSection)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(active ? 1 : 0)
            .allowsHitTesting(active)
            // Hidden pages don't take key presses or keyboard shortcuts.
            .disabled(!active)
            .accessibilityHidden(!active)
            .environment(\.isActivePage, active)
            .zIndex(active ? 1 : 0)
        }
        if showingPlayer, let item = player.item {
          expandedPlayer(item).zIndex(2)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .overlay { miniPlayer }
    }
    .animation(.snappy(duration: 0.25), value: sidebarHidden)
    .animation(.snappy(duration: 0.25), value: player.host == .mini)
    .animation(.snappy(duration: 0.3), value: showingPlayer)
    .background(Color.stPage)
    .containerBackground(Color.stPage, for: .window)
    .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
    .toolbar {
      ToolbarItem(placement: .navigation) {
        Button { sidebarHidden.toggle() } label: {
          Label(sidebarHidden ? "Show Sidebar" : "Hide Sidebar", systemImage: "sidebar.left")
        }
        .help(sidebarHidden ? "Show the sidebar (⌃⌘S)" : "Hide the sidebar (⌃⌘S)")
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: .stashCapture)) { _ in
      sidebarHidden = false
      capturing = true
    }
    .onReceive(NotificationCenter.default.publisher(for: .stashOpenSettings)) { _ in section = .settings }
    .onReceive(NotificationCenter.default.publisher(for: .stashPopOut)) { _ in floating?.toggle() }
    .onChange(of: player.host) { _, _ in floating?.sync() }
    .onAppear { if floating == nil { floating = FloatingPlayer(player: player) } }
    .onAppear { visit(section) }
    .onChange(of: section) { _, value in
      showingPlayer = false
      visit(value)
    }
    .onChange(of: collections) { _, current in
      // A collection that's gone shouldn't linger as a hidden page.
      visited.removeAll { page in
        if case .collection(let id) = page { return !current.contains { $0.id == id } }
        return false
      }
    }
    .task(id: section) { await loadCounts() }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await loadCounts() } } }
  }

  /// The page for the chosen sidebar item. Each page keeps its own navigation, so opening an
  /// article pushes inside the page and the sidebar stays put.
  @ViewBuilder
  private func page(_ target: AppSection) -> some View {
    switch target {
    case .home, .read, .watch: HomeView(go: { section = $0 })
    case .edition: EditionView(onPutAway: { section = .home })
    case .feeds: FeedsView()
    case .saved: SavedView(archive: false)
    case .highlights: HighlightsView()
    case .discover: DiscoverView()
    case .archive: SavedView(archive: true)
    case .channels: WatchView(kind: .channels)
    case .savedVideos: WatchView(kind: .saved)
    case .collection(let id):
      if let collection = collections.first(where: { $0.id == id }) {
        WatchView(kind: .collection(collection)).id(id)
      } else {
        WatchView(kind: .channels)
      }
    case .settings: SettingsView()
    }
  }

  /// The video you left, in a corner of the page. Drag it to another corner.
  @ViewBuilder
  private var miniPlayer: some View {
    if player.host == .mini {
      GeometryReader { geometry in
        MiniPlayer(onExpand: { showingPlayer = true })
          .offset(miniDrag)
          .gesture(
            DragGesture(coordinateSpace: .named("page"))
              .onChanged { miniDrag = $0.translation }
              .onEnded { value in
                let left = value.location.x < geometry.size.width / 2
                let top = value.location.y < geometry.size.height / 2
                withAnimation(.snappy(duration: 0.25)) {
                  miniCorner = top ? (left ? .topLeading : .topTrailing) : (left ? .bottomLeading : .bottomTrailing)
                  miniDrag = .zero
                }
              }
          )
          .padding(22)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: miniCorner.alignment)
      }
      .coordinateSpace(.named("page"))
      .transition(.scale(scale: 0.9).combined(with: .opacity))
    }
  }

  /// The full player for whatever is playing, over the page, with a way back down.
  private func expandedPlayer(_ item: LibraryItem) -> some View {
    NavigationStack {
      PlayerScreen(item: item, queue: player.queue, actions: [], perform: { _, _ in })
        .toolbar {
          ToolbarItem(placement: .navigation) {
            Button { showingPlayer = false } label: { Label("Close the player", systemImage: "chevron.down") }
              .help("Close the player; the video keeps playing in the corner")
              .keyboardShortcut(.escape, modifiers: [])
          }
        }
    }
    .background(Color.stPage)
    .transition(.move(edge: .bottom))
  }

  private func visit(_ page: AppSection) {
    visited.removeAll { $0 == page }
    visited.append(page)
    if visited.count > Self.keepAlive { visited.removeFirst(visited.count - Self.keepAlive) }
  }

  /// The Channels badge and Discover's "new" count.
  private func loadCounts() async {
    async let videos = try? Library.search("in:following use:folders type:video -is:seen", first: 1).pageInfo.totalCount
    async let suggestions = try? Discover.newCount()
    channelsCount = await videos
    discoverCount = await suggestions
  }
}
extension Notification.Name {
  /// ⌘N: open the sidebar's save box.
  static let stashCapture = Notification.Name("stashCapture")
  /// ⌘,: open Settings.
  static let stashOpenSettings = Notification.Name("stashOpenSettings")
}
#endif

#if os(macOS)
/// Which corner of the page the mini player sits in.
enum MiniCorner: String {
  case topLeading, topTrailing, bottomLeading, bottomTrailing

  var alignment: Alignment {
    switch self {
    case .topLeading: return .topLeading
    case .topTrailing: return .topTrailing
    case .bottomLeading: return .bottomLeading
    case .bottomTrailing: return .bottomTrailing
    }
  }
}
#endif
