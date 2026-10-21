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
  private(set) var actionError: String?
  private(set) var navigationError: String?
  private(set) var loadGeneration = 0
  @ObservationIgnored private var failedAction: (String, [String: Any])?
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
    reset()
    let generation = loadGeneration
    self.html = html
    navigationError = nil
    actionError = nil
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
    guard generation == loadGeneration, !Task.isCancelled else { return }
    webView.loadHTMLString(html, baseURL: StashConfig.server)
  }

  /// Clears the page ready for a different article.
  func reset() {
    loadGeneration += 1
    isReady = false
    progress = 0
    failedAction = nil
    actionError = nil
    navigationError = nil
  }

  /// Fires one of the reader's settings events, such as a new font size.
  func send(_ event: String, _ values: [String: Any]) {
    let script = ReaderPage.event(event, values)
    webView.evaluateJavaScript("window.stashPreservePosition ? window.stashPreservePosition(() => { \(script) }) : \(script)", completionHandler: nil)
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
          let requestId = message["requestId"] as? Int,
          let documentID = message["documentID"] as? String else { return }
    let input = message["input"] as? [String: Any] ?? [:]
    let generation = loadGeneration
    Task {
      var result: Any = NSNull()
      var failure: Any = NSNull()
      do {
        result = try await ReaderBridge.perform(action, input: input)
        if action == "articleReadingProgress" { LibraryChanges.shared.publishProgress() }
        else { LibraryChanges.shared.publish() }
        guard generation == loadGeneration else { return }
        actionError = nil
        failedAction = nil
      } catch {
        guard generation == loadGeneration else { return }
        actionError = "Couldn't save your changes. Try again."
        failure = actionError!
        failedAction = (action, input)
      }
      // A response from the previous article must not resolve a request in the next one.
      let values: [Any] = [documentID, requestId, result, failure]
      guard let data = try? JSONSerialization.data(withJSONObject: values),
            let json = String(data: data, encoding: .utf8) else { return }
      webView.evaluateJavaScript("(() => { const [doc,id,result,error] = \(json); if (window.stashDocumentID === doc) window.stashReply(id,result,error); })()", completionHandler: nil)
    }
  }

  func retryAction() {
    guard let (action, input) = failedAction else { return }
    let generation = loadGeneration
    Task {
      do {
        _ = try await ReaderBridge.perform(action, input: input)
        LibraryChanges.shared.publish()
        guard generation == loadGeneration else { return }
        actionError = nil
        failedAction = nil
      } catch {
        guard generation == loadGeneration else { return }
        actionError = "Couldn't save your changes. Try again."
      }
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

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    navigationError = "Couldn't open this article. Try again or open the original."
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    guard (error as? URLError)?.code != .cancelled else { return }
    navigationError = "Couldn't open this article. Try again or open the original."
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
