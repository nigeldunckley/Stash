import Foundation

/// Builds the page the reader shows. The article is drawn by the web app's own
/// reader (bundled as reader.js), so typography and highlights match the website exactly.
enum ReaderPage {
  struct Settings {
    var fontSize: Int
    var fontFamily: String
    var lineHeight = 160
    var width = 640
  }

  /// The web reader, built from packages/appreader with `yarn build-stash-app`.
  static let script: String = {
    guard let url = Bundle.main.url(forResource: "reader", withExtension: "js"),
          let source = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return source
  }()

  /// `colophon` is what the end of the article shows (see `Colophon`); nil leaves it out.
  static func html(for content: ArticleContent, viewer: Viewer, settings: Settings, colophon: [String: Any]? = nil) -> String {
    var article = content.json
    article["content"] = content.html
    article["recommendations"] = [Any]()
    article["labels"] = article["labels"] ?? [Any]()
    article["highlights"] = article["highlights"] ?? [Any]()
    if article["linkId"] == nil || article["linkId"] is NSNull { article["linkId"] = article["id"] }
    if article["readingProgressAnchorIndex"] == nil || article["readingProgressAnchorIndex"] is NSNull {
      article["readingProgressAnchorIndex"] = 0
    }

    // JSONSerialization escapes "/" as "\/", so "</script>" in an article can't end this script early.
    let json = encode(article)
    let viewerJSON = encode(viewer.readerJSON)
    let colophonJSON = colophon.map(encode) ?? "null"

    return """
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="color-scheme" content="light dark" />
        <style>
          body { -webkit-text-size-adjust: 100%; margin: 0; }
          html, body { background: var(--colors-readerBg, transparent); }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script>
          window.omnivoreEnv = {
            "NEXT_PUBLIC_APP_ENV": "prod",
            "NEXT_PUBLIC_BASE_URL": "\(StashConfig.server.absoluteString)",
            "NEXT_PUBLIC_SERVER_BASE_URL": "\(StashConfig.server.absoluteString)",
            "NEXT_PUBLIC_HIGHLIGHTS_BASE_URL": "\(StashConfig.server.absoluteString)"
          }
          window.omnivoreArticle = \(json)
          window.omnivoreViewer = \(viewerJSON)
          window.stashApp = true
          window.stashColophon = \(colophonJSON)
          window.themeKey = "System"
          window.fontSize = \(settings.fontSize)
          window.fontFamily = "\(settings.fontFamily)"
          window.lineHeight = \(settings.lineHeight)
          window.margin = \(1024 - settings.width)
          window.stashReaderWidth = \(settings.width)
          window.justifyText = false
          window.prefersHighContrastFont = true
          window.enableHighlightBar = true
          window.highlightOnRelease = false
        </script>
      </body>
    </html>
    """
  }

  private static func encode(_ object: [String: Any]) -> String {
    (try? JSONSerialization.data(withJSONObject: object))
      .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
  }

  /// JavaScript that fires one of the reader's settings events, e.g. updateFontSize.
  static func event(_ name: String, _ values: [String: Any]) -> String {
    let assignments = values.map { key, value in
      let encoded = (try? JSONSerialization.data(withJSONObject: [value], options: .fragmentsAllowed))
        .flatMap { String(data: $0, encoding: .utf8) }
        .map { String($0.dropFirst().dropLast()) } ?? "null"
      return "event.\(key) = \(encoded);"
    }.joined(separator: " ")
    return "(() => { const event = new Event('\(name)'); \(assignments) document.dispatchEvent(event); })();"
  }
}
