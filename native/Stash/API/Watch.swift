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

/// A channel found on YouTube by name, to follow.
struct ChannelMatch: Decodable, Identifiable, Hashable {
  let channelId: String
  let feedUrl: String
  let title: String
  let handle: String?
  let avatar: String?
  let subscribers: String?
  var id: String { channelId }
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

  /// Videos you're part way through, most recent first.
  static func continueWatching() async -> [LibraryItem] {
    (try? await Library.search("use:folders type:video is:reading sort:updated-desc", first: 6).items) ?? []
  }

  /// How many unseen videos each channel has, keyed by the channel's feed address.
  static func unseenByChannel() async -> [String: Int] {
    let items = (try? await Library.search("in:following use:folders type:video -is:seen", first: 100).items) ?? []
    return items.reduce(into: [:]) { counts, item in
      if let channel = item.subscription { counts[channel, default: 0] += 1 }
    }
  }

  /// Channels on YouTube whose name matches what was typed.
  static func searchChannels(_ query: String) async throws -> [ChannelMatch] {
    struct Response: Decodable {
      let youtubeChannelSearch: Result
      struct Result: Decodable { let channels: [ChannelMatch]?; let errorCodes: [String]? }
    }
    let data: Response = try await StashAPI.shared.graphQL("""
      query YouTubeChannelSearch($query: String!) {
        youtubeChannelSearch(query: $query) {
          ... on YouTubeChannelSearchSuccess { channels { channelId feedUrl title handle avatar subscribers } }
          ... on YouTubeChannelSearchError { errorCodes }
        }
      }
      """, variables: ["query": query])
    if let code = data.youtubeChannelSearch.errorCodes?.first {
      if code == "BAD_REQUEST" { return [] }
      throw StashError.server(code)
    }
    return data.youtubeChannelSearch.channels ?? []
  }

  /// Follows a channel's feed, without Shorts, as the web app does.
  static func follow(_ channel: ChannelMatch) async throws {
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation Subscribe($input: SubscribeInput!) {
        subscribe(input: $input) {
          ... on SubscribeSuccess { subscriptions { id } }
          ... on SubscribeError { errorCodes }
        }
      }
      """, variables: ["input": ["url": channel.feedUrl, "subscriptionType": "RSS", "includeShorts": false]])
    let codes = (data["subscribe"] as? [String: Any])?["errorCodes"] as? [String] ?? []
    if let code = codes.first, code != "ALREADY_SUBSCRIBED" { throw StashError.server(code) }
  }

  /// Changes a channel's collection (an empty id takes it out of one) or whether it brings in Shorts.
  static func updateChannel(_ id: String, collectionId: String? = nil, includeShorts: Bool? = nil) async throws {
    var input: [String: Any] = ["id": id]
    if let collectionId { input["collectionId"] = collectionId }
    if let includeShorts { input["includeShorts"] = includeShorts }
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation UpdateSubscription($input: UpdateSubscriptionInput!) {
        updateSubscription(input: $input) {
          ... on UpdateSubscriptionSuccess { subscription { id } }
          ... on UpdateSubscriptionError { errorCodes }
        }
      }
      """, variables: ["input": input])
    if let code = ((data["updateSubscription"] as? [String: Any])?["errorCodes"] as? [String])?.first {
      throw StashError.server(code)
    }
  }

  static func unfollow(_ channel: Subscription) async throws {
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation Unsubscribe($name: String!, $subscriptionId: ID!) {
        unsubscribe(name: $name, subscriptionId: $subscriptionId) {
          ... on UnsubscribeSuccess { subscription { id } }
          ... on UnsubscribeError { errorCodes }
        }
      }
      """, variables: ["name": channel.name, "subscriptionId": channel.id])
    if let code = ((data["unsubscribe"] as? [String: Any])?["errorCodes"] as? [String])?.first {
      throw StashError.server(code)
    }
  }

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
    try await Personalization.fields()["watch"] as? [String: Any] ?? [:]
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
