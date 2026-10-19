import SwiftUI
import WebKit
import Observation

/// Runs the web view that shows one article, and carries out what the reader asks
/// for (creating highlights, saving reading progress) against the Stash server.
@MainActor
@Observable
final class ReaderController: NSObject {
  let webView: WKWebView
  private(set) var isReady = false
  private(set) var progress: Double = 0
  @ObservationIgnored private var html: String?
  /// What the reader picked in the colophon: "next", "archiveNext", "archive" or "close".
  @ObservationIgnored var onColophon: ((String) -> Void)?

  override init() {
    let config = WKWebViewConfiguration()
    // A private store per article: it only ever holds the sign-in cookie set below.
    config.websiteDataStore = .nonPersistent()
    #if os(iOS)
    config.allowsInlineMediaPlayback = true
    config.dataDetectorTypes = []
    #endif
    let controller = WKUserContentController()
    controller.addUserScript(WKUserScript(
      source: ReaderPage.script,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    ))
    config.userContentController = controller
    webView = WKWebView(frame: .zero, configuration: config)
    super.init()

    let proxy = MessageProxy(self)
    controller.add(proxy, name: "stashAction")
    controller.add(proxy, name: "readingProgressUpdate")
    controller.add(proxy, name: "stashColophon")
    webView.navigationDelegate = self
    webView.isInspectable = true
    #if os(iOS)
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.scrollView.backgroundColor = .clear
    #endif
  }

  /// Loads the page with the server as its address, so the reader's fonts and
  /// its own requests reach Stash, signed in with the app's token.
  func load(html: String, token: String?) async {
    self.html = html
    if let token, let host = StashConfig.server.host(),
       let cookie = HTTPCookie(properties: [
         .domain: host,
         .path: "/",
         .name: "auth",
         .value: token,
         .secure: "TRUE",
         .expires: Date().addingTimeInterval(86_400),
       ]) {
      await webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie)
    }
    webView.loadHTMLString(html, baseURL: StashConfig.server)
  }

  /// Clears the page ready for a different article.
  func reset() {
    isReady = false
    progress = 0
  }

  /// Fires one of the reader's settings events, such as a new font size.
  func send(_ event: String, _ values: [String: Any]) {
    webView.evaluateJavaScript(ReaderPage.event(event, values), completionHandler: nil)
  }

  fileprivate func handleProgress(_ body: Any) {
    if let values = body as? [String: Any], let value = values["progress"] as? Double {
      progress = min(max(value / 100, 0), 1)
    }
  }

  /// Does what the reader asked, then hands the answer back to the waiting request.
  fileprivate func handleAction(_ body: Any) {
    guard let message = body as? [String: Any],
          let action = message["actionID"] as? String,
          let requestId = message["requestId"] as? Int else { return }
    let input = message["input"] as? [String: Any] ?? [:]
    Task {
      let result = (try? await ReaderBridge.perform(action, input: input)) ?? NSNull()
      let json = (try? JSONSerialization.data(withJSONObject: result, options: .fragmentsAllowed))
        .flatMap { String(data: $0, encoding: .utf8) } ?? "null"
      webView.evaluateJavaScript("window.stashReply(\(requestId), \(json))", completionHandler: nil)
    }
  }

  private func openExternally(_ url: URL) {
    #if os(iOS)
    UIApplication.shared.open(url)
    #else
    NSWorkspace.shared.open(url)
    #endif
  }
}

extension ReaderController: WKNavigationDelegate {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction
  ) async -> WKNavigationActionPolicy {
    let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
    // Embedded media in an article (videos, tweets) loads normally.
    if !isMainFrame { return .allow }
    // Links in the article open in the browser.
    if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url {
      openExternally(url)
      return .cancel
    }
    // The page itself loads once; anything that tries to replace it afterwards is ignored.
    return isReady ? .cancel : .allow
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    isReady = true
  }

  /// The system can stop a web view in the background; put the article back.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    isReady = false
    if let html { webView.loadHTMLString(html, baseURL: StashConfig.server) }
  }
}

/// Holds the controller weakly, so the web view's handlers don't keep it alive.
@MainActor
private final class MessageProxy: NSObject, WKScriptMessageHandler {
  weak var owner: ReaderController?

  init(_ owner: ReaderController) { self.owner = owner }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    switch message.name {
    case "stashAction": owner?.handleAction(message.body)
    case "stashColophon":
      if let choice = (message.body as? [String: Any])?["choice"] as? String { owner?.onColophon?(choice) }
    default: owner?.handleProgress(message.body)
    }
  }
}
