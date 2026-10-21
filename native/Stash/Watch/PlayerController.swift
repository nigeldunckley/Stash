import SwiftUI
import WebKit
import Observation
#if os(iOS)
import AVFoundation
#endif

/// Where the one video player is showing: on a player screen, in the mini player in the
/// corner, or (on Mac) in its own small window on top of other apps.
enum PlayerHost: Equatable {
  case none
  case screen(UUID)
  case mini
  case floating
}

/// Plays YouTube videos through the same embedded player the web app uses, and
/// keeps Stash up to date: where you got to, and when a video counts as watched.
@MainActor
@Observable
final class PlayerController: NSObject {
  let webView: WKWebView

  private(set) var item: LibraryItem?
  /// Where the video is showing now.
  var host: PlayerHost = .none
  /// The player screen in sight, if any, which the video goes back to from the floating window.
  private(set) var screenID: UUID?
  private(set) var time: Double = 0
  private(set) var duration: Double = 0
  private(set) var isPlaying = false
  private(set) var rate: Double = 1
  /// What to play next, in order. The current video is skipped.
  var queue: [LibraryItem] = []
  /// Play the next video when one ends.
  var autoplay: Bool = UserDefaults.standard.object(forKey: "watchAutoplay") as? Bool ?? true {
    didSet { UserDefaults.standard.set(autoplay, forKey: "watchAutoplay") }
  }

  @ObservationIgnored private var savedTime: Double = 0
  @ObservationIgnored private var savingPosition = false
  @ObservationIgnored private var pendingPositions: [String: (seconds: Double, duration: Double)] = [:]
  private(set) var syncError: String?
  @ObservationIgnored private var watched: Set<String> = []
  @ObservationIgnored private var pageLoaded = false
  /// YouTube's own frame inside the player page, where picture in picture has to be asked for.
  @ObservationIgnored private var videoFrame: WKFrameInfo?

  static let speeds: [Double] = [1, 1.25, 1.5, 1.75, 2]
  private static let origin = "https://www.youtube-nocookie.com"

  override init() {
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.isElementFullscreenEnabled = true
    #if os(iOS)
    config.allowsInlineMediaPlayback = true
    config.allowsPictureInPictureMediaPlayback = true
    #endif
    let controller = WKUserContentController()
    // Lets the app find YouTube's frame, to ask its video for picture in picture.
    controller.addUserScript(WKUserScript(
      source: "if (location.hostname.endsWith('youtube-nocookie.com')) window.webkit.messageHandlers.player.postMessage({ event: 'frame' })",
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: false
    ))
    config.userContentController = controller
    webView = WKWebView(frame: .zero, configuration: config)
    super.init()
    controller.add(PlayerMessages(self), name: "player")
    webView.navigationDelegate = self
    webView.isInspectable = true
    #if os(iOS)
    webView.scrollView.isScrollEnabled = false
    webView.isOpaque = false
    webView.backgroundColor = .black
    // Sound keeps playing with the screen locked, and in Picture in Picture.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
    #endif
  }

  // MARK: Playing

  func play(_ next: LibraryItem) {
    guard let videoID = Watch.videoID(next) else { return }
    if item?.id == next.id {
      command("playVideo")
      return
    }
    savePosition()
    let start = Watch.startTime(next).rounded(.down)
    item = next
    time = start
    duration = Watch.duration(next) ?? 0
    isPlaying = false
    savedTime = start
    rate = Self.rate(for: next)
    Task { try? await Library.markSeen([next.id]) }

    if pageLoaded {
      command("loadVideoById", [["videoId": videoID, "startSeconds": start]])
    } else {
      webView.loadHTMLString(Self.page(videoID: videoID, start: Int(start)), baseURL: StashConfig.server)
    }
  }

  func toggle() { command(isPlaying ? "pauseVideo" : "playVideo") }
  func pause() { command("pauseVideo") }

  func seek(to seconds: Double) {
    let target = max(0, seconds)
    command("seekTo", [target, true])
    command("playVideo")
    time = target
  }

  func skip(_ seconds: Double) { seek(to: time + seconds) }

  func setRate(_ value: Double) {
    command("setPlaybackRate", [value])
    rate = value
    if let item {
      var rates = UserDefaults.standard.dictionary(forKey: "watchRates") as? [String: Double] ?? [:]
      rates[Self.channelKey(item)] = value
      UserDefaults.standard.set(rates, forKey: "watchRates")
    }
  }

  func next() {
    guard let upcoming = upNext.first else { pause(); return }
    play(upcoming)
  }

  /// Saves the place and stops, when leaving the player.
  func stop() {
    savePosition()
    pause()
  }

  // MARK: Where it shows

  /// A player screen came into sight: the video moves onto it.
  func screenShown(_ id: UUID) {
    screenID = id
    host = .screen(id)
  }

  /// A player screen went out of sight. A playing video carries on in the mini player,
  /// unless Settings says to pause.
  func screenLeft(_ id: UUID) {
    if screenID == id { screenID = nil }
    guard host == .screen(id) else { return }
    if isPlaying && UserDefaults.standard.string(forKey: "watchOnLeave") != "pause" {
      host = .mini
    } else {
      stop()
      host = .none
    }
  }

  /// Closes the mini player or floating window: saves the place and stops.
  func close() {
    stop()
    host = .none
  }

  /// Back from the floating window to the screen in sight, or the mini player.
  func dock() {
    guard host == .floating else { return }
    host = screenID.map { .screen($0) } ?? .mini
  }

  /// Hands the video to Apple's picture-in-picture window. Apple only allows this from a click.
  func pictureInPicture() {
    guard let videoFrame else { return }
    let script = """
      const video = document.querySelector('video')
      if (!video) return false
      if (video.webkitSupportsPresentationMode && video.webkitSupportsPresentationMode('picture-in-picture')) {
        video.webkitSetPresentationMode(video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture')
        return true
      }
      if (document.pictureInPictureEnabled) { await video.requestPictureInPicture(); return true }
      return false
      """
    webView.callAsyncJavaScript(script, arguments: [:], in: videoFrame, in: .page, completionHandler: nil)
  }

  var upNext: [LibraryItem] {
    QueueOrder.remaining(queue, after: item?.id)
  }

  func moveUpcoming(_ id: String, by offset: Int) {
    guard let index = queue.firstIndex(where: { $0.id == id }),
          let current = item, let currentIndex = queue.firstIndex(where: { $0.id == current.id }) else { return }
    let destination = index + offset
    guard destination > currentIndex, queue.indices.contains(destination) else { return }
    let moved = queue.remove(at: index)
    queue.insert(moved, at: destination)
  }

  // MARK: Player messages

  fileprivate func handle(_ body: Any, frame: WKFrameInfo) {
    guard let message = body as? [String: Any], let event = message["event"] as? String else { return }
    switch event {
    case "frame":
      videoFrame = frame
    case "ready":
      pageLoaded = true
      if let item { command("setPlaybackRate", [Self.rate(for: item)]) }
    case "info":
      if let value = message["time"] as? Double { time = value }
      if let value = message["duration"] as? Double, value > 0 { duration = value }
      if let value = message["rate"] as? Double { rate = value }
      if let state = message["state"] as? Int {
        isPlaying = state == 1
        if state == 0 { ended() }
      }
      progressChanged()
    default:
      break
    }
  }

  /// Every so often, remember the place; at 90% the video counts as watched.
  private func progressChanged() {
    guard let item else { return }
    Watch.positions[item.id] = Int(time)
    if abs(time - savedTime) >= 10 { savePosition() }
    if duration > 0, time / duration >= 0.9, !watched.contains(item.id) {
      watched.insert(item.id)
      Task {
        do {
          try await Watch.markWatched(item.id)
          LibraryChanges.shared.publish()
        } catch { watched.remove(item.id); syncError = "Couldn't save your watched status. It will retry." }
      }
    }
  }

  private func ended() {
    if autoplay { next() }
  }

  private func savePosition() {
    guard let item, duration > 0, abs(time - savedTime) >= 2 else { return }
    pendingPositions[item.id] = (time, duration)
    flushPositions()
  }

  private func flushPositions() {
    guard !savingPosition, !pendingPositions.isEmpty else { return }
    savingPosition = true
    Task {
      defer { savingPosition = false }
      while let (id, position) = pendingPositions.first {
        do {
          try await Watch.savePosition(id, seconds: position.seconds, duration: position.duration)
          if self.item?.id == id { savedTime = position.seconds }
          if pendingPositions[id]?.seconds == position.seconds { pendingPositions.removeValue(forKey: id) }
          syncError = nil
          LibraryChanges.shared.publishProgress()
        } catch {
          syncError = "Couldn't save your place. Try again."
          return
        }
      }
    }
  }

  func retryPosition() { savePosition(); flushPositions() }

  private func command(_ name: String, _ args: [Any] = []) {
    guard let data = try? JSONSerialization.data(withJSONObject: args),
          let json = String(data: data, encoding: .utf8) else { return }
    webView.evaluateJavaScript("window.stashPlayer && window.stashPlayer.command('\(name)', \(json))", completionHandler: nil)
  }

  private static func channelKey(_ item: LibraryItem) -> String {
    item.subscription ?? item.author ?? "other"
  }

  /// Speed is remembered per channel: a lecture at 1.75×, a film at 1×.
  private static func rate(for item: LibraryItem) -> Double {
    (UserDefaults.standard.dictionary(forKey: "watchRates") as? [String: Double])?[channelKey(item)] ?? 1
  }

  /// A page holding the YouTube player, which reports its time and state back to the app.
  private static func page(videoID: String, start: Int) -> String {
    let originParam = StashConfig.server.absoluteString
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
      .addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
    let src = "\(origin)/embed/\(videoID)?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=\(originParam)"
      + (start > 0 ? "&start=\(start)" : "")
    return """
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
          iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
        </style>
      </head>
      <body>
        <iframe id="player" src="\(src)"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
        <script>
          const ORIGIN = '\(origin)'
          const frame = document.getElementById('player')
          const send = (message) => window.webkit.messageHandlers.player.postMessage(message)
          let ready = false
          window.stashPlayer = {
            command: (func, args) => frame.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func, args: args || [] }), ORIGIN)
          }
          // The player only reports back once asked to; keep asking until it answers.
          const listen = () => frame.contentWindow.postMessage(
            JSON.stringify({ event: 'listening', id: 'stash' }), ORIGIN)
          frame.addEventListener('load', listen)
          const asking = setInterval(() => ready ? clearInterval(asking) : listen(), 500)
          window.addEventListener('message', (event) => {
            if (event.origin !== ORIGIN) return
            let data
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data } catch { return }
            if (data.event === 'onReady') { ready = true; send({ event: 'ready' }); return }
            if (data.event !== 'infoDelivery' || !data.info) return
            ready = true
            const info = data.info
            send({
              event: 'info',
              time: info.currentTime ?? null,
              duration: info.duration ?? null,
              state: info.playerState ?? null,
              rate: info.playbackRate ?? null,
            })
          })
        </script>
      </body>
    </html>
    """
  }
}

extension PlayerController: WKNavigationDelegate {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction
  ) async -> WKNavigationActionPolicy {
    // "Watch on YouTube" and other links inside the player open outside the app.
    if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url {
      #if os(iOS)
      await UIApplication.shared.open(url)
      #else
      NSWorkspace.shared.open(url)
      #endif
      return .cancel
    }
    return .allow
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    pageLoaded = false
    videoFrame = nil
    if let item {
      self.item = nil
      play(item)
    }
  }
}

/// Holds the controller weakly, so the web view's handler doesn't keep it alive.
@MainActor
private final class PlayerMessages: NSObject, WKScriptMessageHandler {
  weak var owner: PlayerController?

  init(_ owner: PlayerController) { self.owner = owner }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    owner?.handle(message.body, frame: message.frameInfo)
  }
}
