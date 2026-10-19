import SwiftUI

/// The video you left, still playing in the corner of the window (above the tab bar on
/// iPhone). Tap it to go back to the player; × stops it and saves your place.
struct MiniPlayer: View {
  /// Opens the full player again.
  let onExpand: () -> Void

  @Environment(PlayerController.self) private var player
  @State private var hovering = false

  var body: some View {
    if let item = player.item {
      #if os(macOS)
      card(item)
      #else
      bar(item)
      #endif
    }
  }

  private func subtitle(_ item: LibraryItem) -> String {
    let next = player.upNext.count
    return [item.author ?? item.source, next > 0 ? "Up next: \(next) more" : nil]
      .compactMap { $0 }
      .joined(separator: " · ")
  }

  private var progress: some View {
    GeometryReader { geometry in
      ZStack(alignment: .leading) {
        Capsule().fill(Color.stLine)
        Capsule()
          .fill(Color.stAccent)
          .frame(width: player.duration > 0 ? geometry.size.width * min(1, player.time / player.duration) : 0)
      }
    }
    .frame(height: 3)
  }

  // MARK: Mac

  #if os(macOS)
  private func card(_ item: LibraryItem) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      PlayerWebView(webView: player.webView, active: player.host == .mini)
        .aspectRatio(16 / 9, contentMode: .fit)
        .overlay(alignment: .topTrailing) {
          if hovering {
            HStack(spacing: 6) {
              OverlayButton(systemImage: "pip.enter", help: "Picture in picture") { player.pictureInPicture() }
              OverlayButton(systemImage: "rectangle.on.rectangle", help: "Float on top of other apps (⌥⌘P)") {
                NotificationCenter.default.post(name: .stashPopOut, object: nil)
              }
              OverlayButton(systemImage: "arrow.up.left.and.arrow.down.right", help: "Back to the player", action: onExpand)
              OverlayButton(systemImage: "xmark", help: "Stop") { player.close() }
            }
            .padding(8)
            .transition(.opacity)
          }
        }

      VStack(alignment: .leading, spacing: 0) {
        Button(action: onExpand) {
          VStack(alignment: .leading, spacing: 2) {
            Text(item.title)
              .font(.ui(13, .medium))
              .foregroundStyle(Color.stInk)
              .lineLimit(1)
            Text(subtitle(item))
              .font(.ui(11.5))
              .foregroundStyle(Color.stMuted)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        progress.padding(.top, 10).padding(.bottom, 8)

        HStack(spacing: 14) {
          PlayerControls()
          Spacer(minLength: 0)
          Text("\(Watch.timecode(player.time)) / \(Watch.timecode(player.duration))")
            .font(.mono(11))
            .monospacedDigit()
            .foregroundStyle(Color.stMuted)
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 10)
      .padding(.bottom, 12)
    }
    .frame(width: 340)
    .background(Color.stPanel)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
    .onHover { hovering in withAnimation(.easeOut(duration: 0.15)) { self.hovering = hovering } }
  }
  #endif

  // MARK: iPhone

  #if os(iOS)
  private func bar(_ item: LibraryItem) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        PlayerWebView(webView: player.webView, active: player.host == .mini)
          .frame(width: 112, height: 63)
          .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
          .allowsHitTesting(false)
        VStack(alignment: .leading, spacing: 2) {
          Text(item.title)
            .font(.ui(13, .medium, relativeTo: .subheadline))
            .foregroundStyle(Color.stInk)
            .lineLimit(2)
          Text(subtitle(item))
            .font(.ui(11.5, relativeTo: .caption))
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button { player.toggle() } label: {
          Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 32, height: 32)
        }
        .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
        Button { player.close() } label: {
          Image(systemName: "xmark").frame(width: 32, height: 32)
        }
        .accessibilityLabel("Stop")
      }
      .buttonStyle(.plain)
      .font(.ui(17, relativeTo: .title3))
      .foregroundStyle(Color.stInk)
      .padding(8)
      progress.padding(.horizontal, 8).padding(.bottom, 6)
    }
    .background(Color.stPanel)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .shadow(color: .black.opacity(0.14), radius: 12, y: 6)
    .contentShape(Rectangle())
    .onTapGesture(perform: onExpand)
  }
  #endif
}

/// Back 10 seconds, play or pause, forward 10 seconds and next, for the mini player and the
/// floating window.
struct PlayerControls: View {
  @Environment(PlayerController.self) private var player

  var body: some View {
    HStack(spacing: 14) {
      Button { player.skip(-10) } label: { Image(systemName: "gobackward.10") }
        .help("Back 10 seconds")
      Button { player.toggle() } label: {
        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: 18)
      }
      .help(player.isPlaying ? "Pause" : "Play")
      Button { player.skip(10) } label: { Image(systemName: "goforward.10") }
        .help("Forward 10 seconds")
      Button { player.next() } label: { Image(systemName: "forward.end.fill") }
        .disabled(player.upNext.isEmpty)
        .help("Next video")
    }
    .buttonStyle(.plain)
    .font(.ui(15))
  }
}

/// A small dark button over the video.
struct OverlayButton: View {
  let systemImage: String
  let help: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.ui(12, .semibold))
        .foregroundStyle(.white)
        .frame(width: 28, height: 28)
        .background(Color.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
    .buttonStyle(.plain)
    .help(help)
    .accessibilityLabel(help)
  }
}

extension Notification.Name {
  /// ⌥⌘P: float the video on top of other apps, or bring it back.
  static let stashPopOut = Notification.Name("stashPopOut")
}
