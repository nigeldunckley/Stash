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
  /// Where the mini player sits, from 0 (left or top) to 1 (right or bottom) of the room it
  /// has, so it keeps its place as the window changes size; and how wide it is.
  @AppStorage("miniPlayerX") private var miniX = 1.0
  @AppStorage("miniPlayerY") private var miniY = 1.0
  @AppStorage("miniPlayerWidth") private var miniWidth = 340.0
  /// The card's size as laid out (video plus title and controls).
  @State private var miniSize = CGSize(width: 340, height: 300)
  /// The card's frame while it's being moved or resized, and where it started.
  @State private var miniLive: CGRect?
  @State private var miniStart: CGRect?

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
    // A saved card flying to Saved, or a hairline to Archive.
    .overlay { flightLayer }
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

  @ViewBuilder
  private var flightLayer: some View {
    GeometryReader { geometry in
      if !sidebarHidden, let moment = Moments.shared.current, let target = Moments.shared.targets[moment.kind] {
        MomentFlight(moment: moment, target: target, origin: geometry.frame(in: .global).origin)
          .id(moment.id)
      }
    }
    .allowsHitTesting(false)
  }

  /// The video you left, over the page. Drag it anywhere (it snaps to nearby edges) and drag a
  /// corner to resize it; it remembers both.
  @ViewBuilder
  private var miniPlayer: some View {
    if player.host == .mini {
      GeometryReader { geometry in
        let rect = miniLive ?? miniRest(in: geometry.size)
        MiniPlayer(
          onExpand: { showingPlayer = true },
          width: rect.width,
          onMove: { value in miniMove(value, in: geometry.size) },
          onResize: { corner, value in miniResize(corner, value, in: geometry.size) }
        )
        .onGeometryChange(for: CGSize.self) { $0.size } action: { miniSize = $0 }
        .position(x: rect.midX, y: rect.midY)
      }
      .transition(.scale(scale: 0.9).combined(with: .opacity))
    }
  }

  private static let miniInset: CGFloat = 16
  private static let miniWidths: ClosedRange<CGFloat> = 260...760

  /// The card's height for a width: the video grows, the title and controls don't.
  private func cardHeight(for width: CGFloat) -> CGFloat {
    miniSize.height - videoHeight(miniSize.width) + videoHeight(width)
  }

  private func clampWidth(_ width: CGFloat) -> CGFloat {
    min(max(width, Self.miniWidths.lowerBound), Self.miniWidths.upperBound)
  }

  /// The room the card can move in.
  private func miniBounds(_ size: CGSize) -> CGRect {
    CGRect(origin: .zero, size: size).insetBy(dx: Self.miniInset, dy: Self.miniInset)
  }

  /// Where the card sits when nothing is dragging it.
  private func miniRest(in size: CGSize) -> CGRect {
    let bounds = miniBounds(size)
    let width = min(clampWidth(CGFloat(miniWidth)), max(Self.miniWidths.lowerBound, bounds.width))
    let height = cardHeight(for: width)
    return CGRect(
      x: bounds.minX + CGFloat(miniX) * max(0, bounds.width - width),
      y: bounds.minY + CGFloat(miniY) * max(0, bounds.height - height),
      width: width,
      height: height
    )
  }

  /// Keeps a frame inside the page.
  private func clamp(_ rect: CGRect, in size: CGSize) -> CGRect {
    let bounds = miniBounds(size)
    var rect = rect
    rect.origin.x = min(max(rect.minX, bounds.minX), max(bounds.minX, bounds.maxX - rect.width))
    rect.origin.y = min(max(rect.minY, bounds.minY), max(bounds.minY, bounds.maxY - rect.height))
    return rect
  }

  private func miniMove(_ value: DragGesture.Value?, in size: CGSize) {
    guard let value else { return miniSettle(in: size, snap: true) }
    let start = miniStart ?? miniRest(in: size)
    miniStart = start
    miniLive = clamp(start.offsetBy(dx: value.translation.width, dy: value.translation.height), in: size)
  }

  private func miniResize(_ corner: ResizeCorner, _ value: DragGesture.Value?, in size: CGSize) {
    guard let value else { return miniSettle(in: size, snap: false) }
    let start = miniStart ?? miniRest(in: size)
    miniStart = start
    let grow = corner.isLeading ? -value.translation.width : value.translation.width
    let room = miniBounds(size).width
    let width = min(max(start.width + grow, Self.miniWidths.lowerBound), min(Self.miniWidths.upperBound, room))
    let height = cardHeight(for: width)
    // The opposite corner stays put.
    let rect = CGRect(
      x: corner.isLeading ? start.maxX - width : start.minX,
      y: corner.isTop ? start.maxY - height : start.minY,
      width: width,
      height: height
    )
    miniLive = clamp(rect, in: size)
  }

  /// Saves where the card ended up, snapping to an edge it was dropped near.
  private func miniSettle(in size: CGSize, snap: Bool) {
    defer { miniStart = nil }
    guard let rect = miniLive else { return }
    let bounds = miniBounds(size)
    let spareX = bounds.width - rect.width, spareY = bounds.height - rect.height
    var x = spareX > 0 ? Double((rect.minX - bounds.minX) / spareX) : 1
    var y = spareY > 0 ? Double((rect.minY - bounds.minY) / spareY) : 1
    if snap {
      let near: CGFloat = 28
      if rect.minX - bounds.minX < near { x = 0 } else if bounds.maxX - rect.maxX < near { x = 1 }
      if rect.minY - bounds.minY < near { y = 0 } else if bounds.maxY - rect.maxY < near { y = 1 }
    }
    withAnimation(.snappy(duration: 0.22)) {
      miniX = min(max(x, 0), 1)
      miniY = min(max(y, 0), 1)
      miniWidth = Double(rect.width)
      miniLive = nil
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
