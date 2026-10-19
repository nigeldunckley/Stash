import Foundation

/// The GraphQL the app uses, matching what the web app sends.
enum Library {
  static let itemFields = """
    id title slug url folder pageType contentReader author image headerImage description
    siteName siteIcon subscription originalArticleUrl state createdAt savedAt publishedAt
    readAt seenAt readingProgressPercent readingProgressAnchorIndex wordsCount highlightsCount
    """

  struct Page {
    let items: [LibraryItem]
    let pageInfo: PageInfo
  }

  private struct SearchData: Decodable {
    let search: Result
    struct Result: Decodable {
      let edges: [Edge]?
      let pageInfo: PageInfo?
      let errorCodes: [String]?
    }
    struct Edge: Decodable { let node: LibraryItem }
  }

  /// One page of items. `query` uses the same search language as the web app.
  static func search(_ query: String, after cursor: String? = nil, first: Int = 30) async throws -> Page {
    let gql = """
      query Search($after: String, $first: Int, $query: String) {
        search(first: $first, after: $after, query: $query, includeContent: false) {
          ... on SearchSuccess {
            edges { node { \(itemFields) } }
            pageInfo { hasNextPage endCursor totalCount }
          }
          ... on SearchError { errorCodes }
        }
      }
      """
    var variables: [String: Any] = ["first": first, "query": query]
    if let cursor { variables["after"] = cursor }
    let data: SearchData = try await StashAPI.shared.graphQL(gql, variables: variables)
    if let code = data.search.errorCodes?.first { throw StashError.server(code) }
    return Page(
      items: data.search.edges?.map(\.node) ?? [],
      pageInfo: data.search.pageInfo ?? PageInfo(hasNextPage: false, endCursor: nil, totalCount: 0)
    )
  }

  private struct SubscriptionsData: Decodable {
    let subscriptions: Result
    struct Result: Decodable { let subscriptions: [Subscription]? }
  }

  static func subscriptions() async throws -> [Subscription] {
    let gql = """
      query GetSubscriptions($sort: SortParams) {
        subscriptions(sort: $sort) {
          ... on SubscriptionsSuccess { subscriptions { id name type url icon status collectionId includeShorts lastFetchedAt } }
          ... on SubscriptionsError { errorCodes }
        }
      }
      """
    let data: SubscriptionsData = try await StashAPI.shared.graphQL(gql, variables: ["sort": ["by": "UPDATED_TIME"]])
    return (data.subscriptions.subscriptions ?? [])
      .filter { $0.status == nil || $0.status == "ACTIVE" }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private struct ViewerData: Decodable { let me: Viewer? }

  static func viewer() async throws -> Viewer {
    let gql = "query Viewer { me { id name email profile { id username pictureUrl } } }"
    let data: ViewerData = try await StashAPI.shared.graphQL(gql)
    guard let me = data.me else { throw StashError.signedOut }
    return me
  }

  /// The article with its HTML and highlights, as the reader needs them.
  static func article(username: String, slug: String) async throws -> ArticleContent {
    let gql = """
      query GetArticle($username: String!, $slug: String!) {
        article(username: $username, slug: $slug) {
          ... on ArticleSuccess {
            article {
              id title url author image headerImage savedAt createdAt publishedAt contentReader
              originalArticleUrl readingProgressPercent readingProgressTopPercent
              readingProgressAnchorIndex slug folder description linkId state siteName siteIcon
              wordsCount directionality content
              highlights(input: { includeFriends: false }) {
                id type shortId quote prefix suffix patch color annotation createdByMe createdAt
                updatedAt sharedAt highlightPositionPercent highlightPositionAnchorIndex
                labels { id name color createdAt }
              }
              labels { id name color createdAt }
            }
          }
          ... on ArticleError { errorCodes }
        }
      }
      """
    let data = try await StashAPI.shared.graphQLJSON(gql, variables: ["username": username, "slug": slug])
    let result = data["article"] as? [String: Any]
    guard var article = result?["article"] as? [String: Any] else {
      let code = (result?["errorCodes"] as? [String])?.first ?? "NOT_FOUND"
      throw StashError.server("Couldn't open this article (\(code)).")
    }
    let html = article["content"] as? String ?? ""
    article["content"] = nil
    return ArticleContent(html: html, json: article)
  }

  // MARK: Actions

  /// Moves a feed item into Saved ("inbox"), or back to Feeds ("following").
  static func move(_ id: String, to folder: String) async throws {
    let gql = """
      mutation MoveToFolder($id: ID!, $folder: String!) {
        moveToFolder(id: $id, folder: $folder) {
          ... on MoveToFolderSuccess { success }
          ... on MoveToFolderError { errorCodes }
        }
      }
      """
    try await mutate(gql, variables: ["id": id, "folder": folder])
  }

  static func setArchived(_ id: String, _ archived: Bool) async throws {
    let gql = """
      mutation SetLinkArchived($input: ArchiveLinkInput!) {
        setLinkArchived(input: $input) {
          ... on ArchiveLinkSuccess { linkId }
          ... on ArchiveLinkError { errorCodes }
        }
      }
      """
    try await mutate(
      gql, variables: ["input": ["linkId": id, "archived": archived]])
  }

  static func delete(_ id: String) async throws {
    let gql = """
      mutation SetBookmarkArticle($input: SetBookmarkArticleInput!) {
        setBookmarkArticle(input: $input) {
          ... on SetBookmarkArticleSuccess { bookmarkedArticle { id } }
          ... on SetBookmarkArticleError { errorCodes }
        }
      }
      """
    try await mutate(
      gql, variables: ["input": ["articleID": id, "bookmark": false]])
  }

  /// Marks items seen, as opening them in Feeds does on the web.
  static func markSeen(query: String, expectedCount: Int? = nil) async throws {
    let gql = """
      mutation BulkAction($action: BulkActionType!, $query: String!, $expectedCount: Int) {
        bulkAction(query: $query, action: $action, expectedCount: $expectedCount) {
          ... on BulkActionSuccess { success }
          ... on BulkActionError { errorCodes }
        }
      }
      """
    var variables: [String: Any] = ["action": "MARK_AS_SEEN", "query": query]
    if let expectedCount { variables["expectedCount"] = expectedCount }
    try await mutate(gql, variables: variables)
  }

  static func markSeen(_ ids: [String]) async throws {
    guard !ids.isEmpty else { return }
    try await markSeen(query: "in:following use:folders includes:\(ids.joined(separator: ","))", expectedCount: ids.count)
  }

  /// Sets how far through an item you are; 100 marks it read (or a video watched).
  static func setProgress(_ id: String, percent: Double, anchor: Int = 0) async throws {
    let gql = """
      mutation SaveArticleReadingProgress($input: SaveArticleReadingProgressInput!) {
        saveArticleReadingProgress(input: $input) {
          ... on SaveArticleReadingProgressSuccess { updatedArticle { id } }
          ... on SaveArticleReadingProgressError { errorCodes }
        }
      }
      """
    try await mutate(gql, variables: ["input": [
      "id": id, "force": true, "readingProgressPercent": percent, "readingProgressAnchorIndex": anchor,
    ]])
  }

  /// Brings back a deleted item, as Undo does on the web.
  static func restore(_ id: String) async throws {
    let gql = """
      mutation UpdatePage($input: UpdatePageInput!) {
        updatePage(input: $input) {
          ... on UpdatePageSuccess { updatedPage { id } }
          ... on UpdatePageError { errorCodes }
        }
      }
      """
    try await mutate(gql, variables: ["input": ["pageId": id, "state": "SUCCEEDED"]])
  }

  static func save(url: String) async throws {
    let gql = """
      mutation SaveUrl($input: SaveUrlInput!) {
        saveUrl(input: $input) {
          ... on SaveSuccess { url }
          ... on SaveError { errorCodes message }
        }
      }
      """
    let input: [String: Any] = [
      "url": url,
      "source": "stash-app",
      "clientRequestId": UUID().uuidString.lowercased(),
      "timezone": TimeZone.current.identifier,
    ]
    try await mutate(gql, variables: ["input": input])
  }
}

extension Library {
  /// Each mutation answers with either a success or `errorCodes`; turn the latter into an error.
  private struct MutationResult: Decodable {
    let errorCodes: [String]?
    let message: String?
  }

  fileprivate static func mutate(_ gql: String, variables: [String: Any]) async throws {
    let data: [String: MutationResult] = try await StashAPI.shared.graphQL(gql, variables: variables)
    if let result = data.values.first, let code = result.errorCodes?.first {
      throw StashError.server(result.message ?? "Stash couldn't do that (\(code)).")
    }
  }
}
