import Foundation

/// A passage you highlighted, with the article it came from.
struct Highlight: Decodable, Identifiable, Hashable {
  let id: String
  let type: String
  let quote: String?
  let annotation: String?
  let color: String?
  let createdAt: Date
  let libraryItem: LibraryItem?

  var isNote: Bool { type == "NOTE" }
}

enum Highlights {
  /// The fields of the article each highlight belongs to: enough to show it and open it in the reader.
  private static let articleFields = """
    id title slug url folder pageType author image headerImage description siteName siteIcon
    subscription originalArticleUrl state createdAt savedAt publishedAt readAt
    readingProgressPercent readingProgressAnchorIndex wordsCount
    """

  struct Page {
    let highlights: [Highlight]
    let endCursor: String?
    let hasNextPage: Bool
  }

  private struct HighlightsData: Decodable {
    let highlights: Result
    struct Result: Decodable {
      let edges: [Edge]?
      let pageInfo: PageInfo?
      let errorCodes: [String]?
    }
    struct Edge: Decodable { let node: Highlight }
  }

  /// Newest first. `query` takes the web's highlight search, e.g. a word in the quote.
  static func page(after cursor: String? = nil, first: Int = 50, query: String? = nil) async throws -> Page {
    let gql = """
      query Highlights($first: Int, $after: String, $query: String) {
        highlights(first: $first, after: $after, query: $query) {
          ... on HighlightsSuccess {
            edges { node { id type quote annotation color createdAt libraryItem { \(articleFields) } } }
            pageInfo { hasNextPage endCursor }
          }
          ... on HighlightsError { errorCodes }
        }
      }
      """
    var variables: [String: Any] = ["first": first]
    if let cursor { variables["after"] = cursor }
    if let query, !query.isEmpty { variables["query"] = query }
    let data: HighlightsData = try await StashAPI.shared.graphQL(gql, variables: variables)
    if let code = data.highlights.errorCodes?.first { throw StashError.server(code) }
    return Page(
      highlights: data.highlights.edges?.map(\.node) ?? [],
      endCursor: data.highlights.pageInfo?.endCursor,
      hasNextPage: data.highlights.pageInfo?.hasNextPage ?? false
    )
  }

  /// Up to `max` of your most recent highlights.
  static func recent(_ max: Int) async throws -> [Highlight] {
    var found: [Highlight] = []
    var cursor: String?
    while found.count < max {
      let page = try await page(after: cursor)
      found += page.highlights
      guard page.hasNextPage, !page.highlights.isEmpty else { break }
      cursor = page.endCursor
    }
    return Array(found.prefix(max))
  }
}

extension Highlights {
  static func delete(_ id: String) async throws {
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation DeleteHighlight($highlightId: ID!) {
        deleteHighlight(highlightId: $highlightId) {
          ... on DeleteHighlightSuccess { highlight { id } }
          ... on DeleteHighlightError { errorCodes }
        }
      }
      """, variables: ["highlightId": id])
    let result = data["deleteHighlight"] as? [String: Any]
    if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
  }
}
