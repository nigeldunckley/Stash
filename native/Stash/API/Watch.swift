import Foundation

/// A Watch collection, such as Tech or Motorsport. Each one is a label that
/// channels (and single videos) are filed under.
struct WatchCollection: Identifiable, Hashable {
  let id: String
  let name: String
  let color: String
}

struct TranscriptLine: Decodable, Hashable {
  let start: Double
  let duration: Double
  let text: String
}

struct Chapter: Hashable {
  let start: Double
  let title: String
}

/// Watch's calls and helpers, matching the web app's lib/youtube.ts and lib/watch.
enum Watch {
  // MARK: Videos

  /// The YouTube id in a watch, short, embed or youtu.be link.
  static func videoID(_ item: LibraryItem) -> String? {
    guard let url = URL(string: item.originalArticleUrl ?? item.url), let host = url.host()?.lowercased() else {
      return nil
    }
    if host == "youtu.be" {
      let id = String(url.path().dropFirst().prefix(11))
      return id.isEmpty ? nil : id
    }
    guard host.hasSuffix("youtube.com") else { return nil }
    if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value {
      return v
    }
    let parts = url.path().split(separator: "/")
    if parts.count >= 2, ["shorts", "embed", "live", "v"].contains(String(parts[0])) {
      return String(parts[1].prefix(11))
    }
    return nil
  }

  static func isVideo(_ item: LibraryItem) -> Bool {
    item.pageType == "VIDEO" || videoID(item) != nil
  }

  /// The video job stores a video's length as a word count at 3.92 words a second.
  static func duration(_ item: LibraryItem) -> Double? {
    guard let words = item.wordsCount, words > 0 else { return nil }
    return (Double(words) / 3.92).rounded()
  }

  /// Where to start: where you left off, unless that was the very end.
  @MainActor static func startTime(_ item: LibraryItem) -> Double {
    let at = Double(positions[item.id] ?? item.readingProgressAnchorIndex ?? 0)
    if let length = duration(item), at > length - 15 { return 0 }
    return at
  }

  /// Positions reached this session, so reopening a video picks up there straight away.
  @MainActor static var positions: [String: Int] = [:]

  /// 754 -> "12:34", 3723 -> "1:02:03".
  static func timecode(_ seconds: Double) -> String {
    let whole = max(0, Int(seconds))
    let h = whole / 3600, m = (whole % 3600) / 60, s = whole % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
  }

  /// Chapters from description lines starting with a timecode, using YouTube's rule:
  /// at least three, in order, starting at 0:00.
  static func chapters(_ description: String?) -> [Chapter] {
    guard let description else { return [] }
    let pattern = #/^\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|·.]?\s*(.+)$/#
    var chapters: [Chapter] = []
    for line in description.split(separator: "\n") {
      guard let match = line.trimmingCharacters(in: .whitespaces).wholeMatch(of: pattern) else { continue }
      let start = match.1.split(separator: ":").reduce(0.0) { $0 * 60 + (Double($1) ?? 0) }
      if let previous = chapters.last, start <= previous.start { continue }
      chapters.append(Chapter(start: start, title: String(match.2).trimmingCharacters(in: .whitespaces)))
    }
    return chapters.count >= 3 && chapters.first?.start == 0 ? chapters : []
  }

  // MARK: Server

  /// Remembers how far in you got: seconds in the anchor index, share watched as progress.
  static func savePosition(_ id: String, seconds: Double, duration: Double) async throws {
    let percent = duration > 0 ? seconds / duration * 100 : 0
    try await saveProgress(id, percent: min(100, max(0, percent.rounded())), anchor: max(0, Int(seconds)))
  }

  static func markWatched(_ id: String, _ watched: Bool = true) async throws {
    try await saveProgress(id, percent: watched ? 100 : 0, anchor: 0)
  }

  private static func saveProgress(_ id: String, percent: Double, anchor: Int) async throws {
    _ = try await StashAPI.shared.graphQLJSON("""
      mutation SaveVideoPosition($input: SaveArticleReadingProgressInput!) {
        saveArticleReadingProgress(input: $input) {
          ... on SaveArticleReadingProgressSuccess { updatedArticle { id } }
          ... on SaveArticleReadingProgressError { errorCodes }
        }
      }
      """, variables: ["input": [
        "id": id, "force": true, "readingProgressPercent": percent, "readingProgressAnchorIndex": anchor,
      ]])
  }

  static func transcript(_ videoID: String) async throws -> [TranscriptLine] {
    struct Response: Decodable {
      let youtubeTranscript: Result
      struct Result: Decodable { let lines: [TranscriptLine]?; let errorCodes: [String]? }
    }
    let data: Response = try await StashAPI.shared.graphQL("""
      query YouTubeTranscript($videoId: String!) {
        youtubeTranscript(videoId: $videoId) {
          ... on YouTubeTranscriptSuccess { lines { start duration text } }
          ... on YouTubeTranscriptError { errorCodes }
        }
      }
      """, variables: ["videoId": videoID])
    if let code = data.youtubeTranscript.errorCodes?.first { throw StashError.server(code) }
    return data.youtubeTranscript.lines ?? []
  }

  /// Watch's lists kept with your account: the collections, and the order of Saved videos.
  private static func watchFields() async throws -> [String: Any] {
    let data = try await StashAPI.shared.graphQLJSON("""
      query WatchFields {
        getUserPersonalization {
          ... on GetUserPersonalizationSuccess { userPersonalization { fields } }
          ... on GetUserPersonalizationError { errorCodes }
        }
      }
      """, variables: [:])
    let result = data["getUserPersonalization"] as? [String: Any]
    let fields = (result?["userPersonalization"] as? [String: Any])?["fields"] as? [String: Any]
    return fields?["watch"] as? [String: Any] ?? [:]
  }

  /// The pinned order of Saved videos, as set on the web.
  static func savedOrder() async -> [String] {
    ((try? await watchFields())?["order"] as? [String]) ?? []
  }

  static func collections() async throws -> [WatchCollection] {
    async let ids = watchFields()
    let labels = try await StashAPI.shared.graphQLJSON("""
      query GetLabels { labels { ... on LabelsSuccess { labels { id name color } } ... on LabelsError { errorCodes } } }
      """, variables: [:])
    let all = ((labels["labels"] as? [String: Any])?["labels"] as? [[String: Any]]) ?? []
    let order = (try await ids)["collections"] as? [String] ?? []
    let byID = Dictionary(uniqueKeysWithValues: all.compactMap { label -> (String, WatchCollection)? in
      guard let id = label["id"] as? String, let name = label["name"] as? String else { return nil }
      return (id, WatchCollection(id: id, name: name, color: label["color"] as? String ?? "#8B8D98"))
    })
    return order.compactMap { byID[$0] }
  }
}
