#if os(macOS)
import SwiftUI
import AppKit

/// The video in its own small window on top of every app, on every desktop. It opens by itself
/// when you switch away from Stash with a video playing (unless Settings says otherwise) and
/// goes back into Stash when you return. ⌥⌘P opens and closes it by hand.
@MainActor
final class FloatingPlayer {
  private let player: PlayerController
  private var panel: NSPanel?
  /// Opened because you switched apps, so it goes back by itself when you return.
  private var automatic = false
  private var observers: [NSObjectProtocol] = []

  init(player: PlayerController) {
    self.player = player
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: NSApplication.didResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.appResigned() }
    })
    observers.append(center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.appActivated() }
    })
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  /// "float", "ask" or "sound", from Settings › Watch.
  private var onSwitch: String {
    UserDefaults.standard.string(forKey: "watchOnSwitch") ?? "float"
  }

  private func appResigned() {
    guard onSwitch == "float", player.isPlaying, player.item != nil, player.host != .floating else { return }
    open(automatic: true)
  }

  private func appActivated() {
    guard automatic, player.host == .floating else { return }
    player.dock()
  }

  /// ⌥⌘P and the pop-out buttons.
  func toggle() {
    if player.host == .floating {
      player.dock()
    } else if player.item != nil {
      open(automatic: false)
    }
  }

  private func open(automatic: Bool) {
    self.automatic = automatic
    player.host = .floating
    sync()
  }

  /// Shows or hides the window to match where the player is.
  func sync() {
    if player.host == .floating {
      showPanel()
    } else {
      automatic = false
      panel?.orderOut(nil)
    }
  }

  private func showPanel() {
    let panel = self.panel ?? makePanel()
    self.panel = panel
    panel.orderFrontRegardless()
  }

  private func makePanel() -> NSPanel {
    let panel = FloatingPanel(
      contentRect: NSRect(x: 0, y: 0, width: 420, height: 236),
      styleMask: [.borderless, .nonactivatingPanel, .resizable],
      backing: .buffered,
      defer: false
    )
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    // Moving is done by hand (see `move`), so the video can sit under the drag.
    panel.isMovableByWindowBackground = false
    panel.hidesOnDeactivate = false
    panel.hasShadow = true
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.contentAspectRatio = NSSize(width: 16, height: 9)
    panel.minSize = NSSize(width: Self.minWidth, height: videoHeight(Self.minWidth))

    let content = NSHostingView(rootView: FloatingPlayerView(
      onClose: { [weak self] in self?.player.close() },
      onBack: { [weak self] in
        self?.player.dock()
        NSApp.activate()
      },
      onMove: { [weak self] moving in self?.move(moving) },
      onResize: { [weak self] corner, resizing in self?.resize(corner, resizing) }
    )
    .environment(player))
    content.wantsLayer = true
    content.layer?.cornerRadius = 12
    content.layer?.masksToBounds = true
    panel.contentView = content

    // Top right of the screen the first time; after that, wherever and however big you left it.
    if !panel.setFrameUsingName(Self.frameName), let screen = NSScreen.main {
      let visible = screen.visibleFrame
      panel.setFrameOrigin(NSPoint(x: visible.maxX - 420 - 20, y: visible.maxY - 236 - 20))
    }
    panel.setFrameAutosaveName(Self.frameName)
    return panel
  }

  private static let frameName = "StashFloatingPlayer"
  private static let minWidth: CGFloat = 280

  // MARK: Moving and resizing

  /// The window's frame and the pointer when a drag began, in screen coordinates.
  private var dragStart: (frame: NSRect, mouse: NSPoint)?

  /// The visible part of the screen the pointer is on.
  private func screenFrame(_ point: NSPoint) -> NSRect {
    let screen = NSScreen.screens.first { $0.frame.contains(point) } ?? panel?.screen ?? NSScreen.main
    return screen?.visibleFrame ?? .zero
  }

  /// Follows the pointer while `moving`, then snaps to a screen edge it was dropped near.
  /// Reads the pointer itself, since the window moves under the drag.
  func move(_ moving: Bool) {
    guard let panel else { return }
    let mouse = NSEvent.mouseLocation
    guard moving else { return finishDrag(snap: true) }
    let start = dragStart ?? (frame: panel.frame, mouse: mouse)
    dragStart = start
    var frame = start.frame.offsetBy(dx: mouse.x - start.mouse.x, dy: mouse.y - start.mouse.y)
    let screen = screenFrame(mouse)
    frame.origin.x = min(max(frame.minX, screen.minX), screen.maxX - frame.width)
    frame.origin.y = min(max(frame.minY, screen.minY), screen.maxY - frame.height)
    panel.setFrameOrigin(frame.origin)
  }

  /// Resizes from a corner at 16:9, keeping the opposite corner where it was.
  func resize(_ corner: ResizeCorner, _ resizing: Bool) {
    guard let panel else { return }
    let mouse = NSEvent.mouseLocation
    guard resizing else { return finishDrag(snap: false) }
    let start = dragStart ?? (frame: panel.frame, mouse: mouse)
    dragStart = start
    let screen = screenFrame(NSPoint(x: start.frame.midX, y: start.frame.midY))
    let grow = corner.isLeading ? start.mouse.x - mouse.x : mouse.x - start.mouse.x
    let maxWidth = max(Self.minWidth, min(1280, screen.width * 0.8))
    let width = min(max(start.frame.width + grow, Self.minWidth), maxWidth)
    let height = videoHeight(width)
    // Screen coordinates run upwards, so the top edge is maxY.
    var frame = NSRect(
      x: corner.isLeading ? start.frame.maxX - width : start.frame.minX,
      y: corner.isTop ? start.frame.minY : start.frame.maxY - height,
      width: width,
      height: height
    )
    frame.origin.x = min(max(frame.minX, screen.minX), screen.maxX - frame.width)
    frame.origin.y = min(max(frame.minY, screen.minY), screen.maxY - frame.height)
    panel.setFrame(frame, display: true)
  }

  private func finishDrag(snap: Bool) {
    defer { dragStart = nil }
    guard let panel, dragStart != nil else { return }
    var frame = panel.frame
    if snap {
      let screen = screenFrame(NSPoint(x: frame.midX, y: frame.midY))
      let near: CGFloat = 32, margin: CGFloat = 16
      if frame.minX - screen.minX < near { frame.origin.x = screen.minX + margin }
      else if screen.maxX - frame.maxX < near { frame.origin.x = screen.maxX - frame.width - margin }
      if frame.minY - screen.minY < near { frame.origin.y = screen.minY + margin }
      else if screen.maxY - frame.maxY < near { frame.origin.y = screen.maxY - frame.height - margin }
      if frame != panel.frame { panel.setFrame(frame, display: true, animate: true) }
    }
    panel.saveFrame(usingName: Self.frameName)
  }
}

/// A borderless panel that can still take clicks on its buttons.
private final class FloatingPanel: NSPanel {
  override var canBecomeKey: Bool { true }
}

/// The floating window: just the video, with controls when the pointer is over it.
private struct FloatingPlayerView: View {
  let onClose: () -> Void
  let onBack: () -> Void
  /// Moving the window: true while dragging, false when it ends.
  let onMove: (Bool) -> Void
  let onResize: (ResizeCorner, Bool) -> Void

  @Environment(PlayerController.self) private var player
  @State private var hovering = false

  var body: some View {
    ZStack {
      Color.black
      PlayerWebView(webView: player.webView, active: player.host == .floating)
      // Over the video, so a drag anywhere moves the window and a click plays or pauses.
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture { player.toggle() }
      if hovering { controls.transition(.opacity) }
      ResizeHandles { corner, value in onResize(corner, value != nil) }
    }
    .gesture(
      DragGesture(minimumDistance: 3)
        .onChanged { _ in onMove(true) }
        .onEnded { _ in onMove(false) }
    )
    .onHover { hovering in withAnimation(.easeOut(duration: 0.15)) { self.hovering = hovering } }
  }

  private var controls: some View {
    VStack(spacing: 0) {
      HStack(spacing: 6) {
        OverlayButton(systemImage: "xmark", help: "Stop", action: onClose)
        Spacer(minLength: 0)
        OverlayButton(systemImage: "pip.enter", help: "Picture in picture") { player.pictureInPicture() }
        OverlayButton(systemImage: "arrow.up.left.and.arrow.down.right", help: "Back to Stash", action: onBack)
      }
      .padding(10)

      Spacer(minLength: 0)

      VStack(alignment: .leading, spacing: 8) {
        if let item = player.item {
          Text(item.title)
            .font(.ui(13, .medium))
            .lineLimit(1)
        }
        GeometryReader { geometry in
          ZStack(alignment: .leading) {
            Capsule().fill(Color.white.opacity(0.3))
            Capsule()
              .fill(Color.stAccent)
              .frame(width: player.duration > 0 ? geometry.size.width * min(1, player.time / player.duration) : 0)
          }
        }
        .frame(height: 3)
        HStack(spacing: 14) {
          PlayerControls()
          Spacer(minLength: 0)
          Text("\(Watch.timecode(player.time)) / \(Watch.timecode(player.duration))")
            .font(.mono(11))
            .monospacedDigit()
            .opacity(0.75)
        }
      }
      .foregroundStyle(.white)
      .padding(.horizontal, 14)
      .padding(.top, 28)
      .padding(.bottom, 12)
      .background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom))
    }
  }
}
#endif
