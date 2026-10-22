import Foundation

/// What the web reader asks the app to do, sent on to the server as the web app would.
enum ReaderBridge {
  private static let highlightFields = """
    id type shortId quote prefix suffix patch color annotation createdByMe createdAt updatedAt
    sharedAt highlightPositionPercent highlightPositionAnchorIndex labels { id name color createdAt }
    """

  /// Returns what the reader expects back for each action.
  static func perform(_ action: String, input: [String: Any]) async throws -> Any {
    switch action {
    case "createHighlight":
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation CreateHighlight($input: CreateHighlightInput!) {
          createHighlight(input: $input) {
            ... on CreateHighlightSuccess { highlight { \(highlightFields) } }
            ... on CreateHighlightError { errorCodes }
          }
        }
        """, variables: ["input": input])
      return try payload(data, "createHighlight", "highlight")

    case "mergeHighlight":
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation MergeHighlight($input: MergeHighlightInput!) {
          mergeHighlight(input: $input) {
            ... on MergeHighlightSuccess { highlight { \(highlightFields) } overlapHighlightIdList }
            ... on MergeHighlightError { errorCodes }
          }
        }
        """, variables: ["input": input])
      return try payload(data, "mergeHighlight", "highlight")

    case "updateHighlight":
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation UpdateHighlight($input: UpdateHighlightInput!) {
          updateHighlight(input: $input) {
            ... on UpdateHighlightSuccess { highlight { id } }
            ... on UpdateHighlightError { errorCodes }
          }
        }
        """, variables: ["input": input])
      let highlight = try payload(data, "updateHighlight", "highlight") as? [String: Any]
      return highlight?["id"] ?? NSNull()

    case "deleteHighlight":
      guard let id = input["highlightId"] as? String else { return false }
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation DeleteHighlight($highlightId: ID!) {
          deleteHighlight(highlightId: $highlightId) {
            ... on DeleteHighlightSuccess { highlight { id } }
            ... on DeleteHighlightError { errorCodes }
          }
        }
        """, variables: ["highlightId": id])
      _ = try payload(data, "deleteHighlight", "highlight")
      return true

    case "articleReadingProgress":
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation SaveArticleReadingProgress($input: SaveArticleReadingProgressInput!) {
          saveArticleReadingProgress(input: $input) {
            ... on SaveArticleReadingProgressSuccess { updatedArticle { id } }
            ... on SaveArticleReadingProgressError { errorCodes }
          }
        }
        """, variables: ["input": input])
      _ = try payload(data, "saveArticleReadingProgress", "updatedArticle")
      return true

    // The reading trail: the parts of the article you've actually read, kept with it on the
    // server so the Mac and iPhone add up. These never show an error; the reader tries again.
    case "readingTrail":
      guard let id = input["id"] as? String else { return NSNull() }
      do {
        let data = try await StashAPI.shared.graphQLJSON("""
          query ReadingTrail($id: ID!) {
            readingTrail(id: $id) {
              ... on ReadingTrailSuccess { trail }
              ... on ReadingTrailError { errorCodes }
            }
          }
          """, variables: ["id": id])
        return try payload(data, "readingTrail", "trail")
      } catch {
        return NSNull()
      }

    case "saveReadingTrail":
      guard let id = input["id"] as? String, let trail = input["trail"] as? String else { return false }
      do {
        let data = try await StashAPI.shared.graphQLJSON("""
          mutation SaveReadingTrail($input: SaveReadingTrailInput!) {
            saveReadingTrail(input: $input) {
              ... on ReadingTrailSuccess { trail }
              ... on ReadingTrailError { errorCodes }
            }
          }
          """, variables: ["input": ["id": id, "trail": trail]])
        _ = try payload(data, "saveReadingTrail", "trail")
        return true
      } catch {
        return false
      }

    default:
      throw Unsupported()
    }
  }

  /// An action this version of the app doesn't know, answered with an error so the reader
  /// isn't left waiting.
  struct Unsupported: Error {}

  /// Actions that save quietly in the background: no error banner, and nothing for the lists
  /// to refresh.
  static func isQuiet(_ action: String) -> Bool {
    action == "readingTrail" || action == "saveReadingTrail"
  }

  private static func payload(_ data: [String: Any], _ field: String, _ key: String) throws -> Any {
    let result = data[field] as? [String: Any]
    if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
    return result?[key] ?? NSNull()
  }
}
