import Foundation

struct LibraryItem: Decodable, Identifiable, Hashable {
  let id: String
  let title: String
  let slug: String
  let url: String
  let folder: String?
  let pageType: String?
  let contentReader: String?
  let author: String?
  let image: String?
  let headerImage: String?
  let description: String?
  let siteName: String?
  let siteIcon: String?
  let subscription: String?
  let originalArticleUrl: String?
  let state: String?
  let createdAt: Date?
  let savedAt: Date?
  let publishedAt: Date?
  let readAt: Date?
  let seenAt: Date?
  let readingProgressPercent: Double?
  let readingProgressAnchorIndex: Int?
  let wordsCount: Int?
  let highlightsCount: Int?

  var originalURL: URL? { URL(string: originalArticleUrl ?? url) }
  /// The article's own header picture first (usually full size), then the feed's thumbnail.
  var imageURL: URL? { (headerImage ?? image).flatMap(URL.init(string:)) }

  /// A guess at a bigger copy of the picture: YouTube's full-size thumbnail, or a WordPress
  /// image without its "-300x200" size. Shown with `imageURL` as the fallback when it's missing.
  var largeImageURL: URL? {
    guard let url = imageURL else { return nil }
    var text = url.absoluteString
    if url.host()?.hasSuffix("ytimg.com") == true {
      // Signed thumbnails carry a query that only fits the original size.
      var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
      components?.query = nil
      text = components?.string ?? text
      text = text.replacingOccurrences(of: #"/(hq|mq|sd)?default\.jpg"#, with: "/maxresdefault.jpg", options: .regularExpression)
    } else {
      text = text.replacingOccurrences(
        of: #"-\d{2,4}x\d{2,4}(?=\.(jpe?g|png|webp|gif)(\?|$))"#, with: "",
        options: [.regularExpression, .caseInsensitive]
      )
    }
    return URL(string: text) ?? url
  }
  var iconURL: URL? { siteIcon.flatMap(URL.init(string:)) }
  var isFeedItem: Bool { folder == "following" }
  var isArchived: Bool { state == "ARCHIVED" }
  var progress: Double { (readingProgressPercent ?? 0) / 100 }

  /// Minutes to read at 235 words a minute, the same pace the web app uses.
  var readingMinutes: Int? {
    guard let words = wordsCount, words > 0 else { return nil }
    return max(1, Int((Double(words) / 235).rounded()))
  }

  /// The site to show above the title: its name, else its address.
  var source: String {
    if let siteName, !siteName.isEmpty { return siteName }
    return originalURL?.host()?.replacingOccurrences(of: "www.", with: "") ?? ""
  }

  /// When it was published, falling back to when it reached Stash.
  var date: Date? { publishedAt ?? savedAt ?? createdAt }
}

struct PageInfo: Decodable {
  let hasNextPage: Bool
  let endCursor: String?
  let totalCount: Int?
}

struct Subscription: Decodable, Identifiable, Hashable {
  let id: String
  let name: String
  let type: String
  let url: String?
  let icon: String?
  let status: String?
  /// The Watch collection a channel files its videos under.
  let collectionId: String?
  let includeShorts: Bool?
  /// When Stash last checked the feed for new posts.
  let lastFetchedAt: Date?

  /// Feed items record their feed by address and newsletter items by name,
  /// so that's what a `subscription:` search has to match.
  var searchKey: String { type == "RSS" ? (url ?? name) : name }
  var isYouTube: Bool { url?.contains("youtube.com") ?? false }
}

struct Viewer: Decodable {
  let id: String
  let name: String
  let email: String?
  let profile: Profile
  struct Profile: Decodable { let id: String; let username: String; let pictureUrl: String? }

  /// The shape the web reader expects for `viewer`.
  var readerJSON: [String: Any] {
    [
      "id": id, "name": name, "email": email ?? "", "source": "EMAIL", "intercomHash": "",
      "featureList": [Any](),
      "profile": ["id": profile.id, "username": profile.username, "pictureUrl": profile.pictureUrl ?? ""],
    ]
  }
}

/// The article itself, with its HTML and highlights kept as raw JSON for the reader.
struct ArticleContent {
  let html: String
  let json: [String: Any]
}

/// Quotes a value for a search filter such as subscription:"Name".
func searchValue(_ value: String) -> String {
  "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
}
