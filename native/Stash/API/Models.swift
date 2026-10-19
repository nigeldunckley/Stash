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
  var imageURL: URL? { (image ?? headerImage).flatMap(URL.init(string:)) }
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
