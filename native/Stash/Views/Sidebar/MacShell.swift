#if os(macOS)
import SwiftUI

/// The Mac window: Stash's floating sidebar panel on the left, the page on the right, all on
/// one page colour with the title bar see-through above it. ⌃⌘S or the strip's sidebar button
/// hides the panel.
struct MacShell: View {
  @Binding var section: AppSection
  let collections: [WatchCollection]

  @Environment(\.scenePhase) private var scenePhase
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @State private var channelsCount: Int?
  @State private var discoverCount: Int?
  @State private var capturing = false

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
      page
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .animation(.snappy(duration: 0.25), value: sidebarHidden)
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
    .task(id: section) { await loadCounts() }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await loadCounts() } } }
  }

  /// The page for the chosen sidebar item. Each page keeps its own navigation, so opening an
  /// article pushes inside the page and the sidebar stays put.
  @ViewBuilder
  private var page: some View {
    switch section {
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
