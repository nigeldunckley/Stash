import Foundation

/// A feed Stash suggests from what you read. The server builds these each night.
struct FeedSuggestion: Decodable, Identifiable, Hashable {
  let id: String
  let siteUrl: String
  let feedUrl: String?
  /// "rss", or "youtube" for a channel.
  let kind: String
  let title: String
  let description: String?
  let icon: String?
  let author: String?
  let postsPerWeek: Double?
  let lastPostAt: Date?
  let score: Double
  let reasons: [Reason]
  let latest: [Post]
  let status: String
  let subscriptionId: String?
  let trialEndsAt: Date?

  struct Reason: Decodable, Hashable {
    /// link, blogroll, save, writer, neighbour, similar or starter.
    let kind: String
    let guide: String
    let guideName: String
    let count: Int
    let title: String?
  }

  struct Post: Decodable, Hashable {
    let title: String
    let url: String
    let image: String?
    let summary: String?
    let publishedAt: Date?
    let minutes: Double?
  }

  var isChannel: Bool { kind == "youtube" }
  var isStarter: Bool { reasons.first?.kind == "starter" }
  var iconURL: URL? { icon.flatMap(URL.init(string:)) }
  var host: String { URL(string: siteUrl)?.host()?.replacingOccurrences(of: "www.", with: "") ?? siteUrl }

  /// Why it's here, in a few words.
  var why: String {
    guard let reason = reasons.first else { return "From what you read" }
    let times = reason.count == 1 ? "once" : reason.count == 2 ? "twice" : "\(reason.count)×"
    switch reason.kind {
    case "link": return "Linked \(times) by \(reason.guideName)"
    case "blogroll": return "In \(reason.guideName)’s blogroll"
    case "save": return reason.count > 1 ? "You saved \(reason.count) articles from this feed" : "You saved an article from this feed"
    case "writer": return "Articles by \(reason.guideName), whose work you have read"
    case "neighbour": return "Links to the same places as \(reason.guideName)"
    case "similar": return "Similar to \(reason.guideName)"
    case "starter": return reason.title.map { "A starting point · \($0)" } ?? "A starting point"
    default: return "From what you read"
    }
  }

  /// How often it posts.
  var cadence: String? {
    guard let perWeek = postsPerWeek, perWeek > 0 else { return nil }
    if perWeek >= 1 { return "≈ \(Int(perWeek.rounded())) / week" }
    let perMonth = perWeek * 4.3
    if perMonth >= 1 { return "≈ \(Int(perMonth.rounded())) / month" }
    return "Now and then"
  }

  var matchPercent: Int { Int((min(1, score / 0.8) * 100).rounded()) }

  var trialDaysLeft: Int? {
    guard let trialEndsAt else { return nil }
    return max(0, Int((trialEndsAt.timeIntervalSinceNow / 86_400).rounded(.up)))
  }
}

enum Discover {
  private static let fields = """
    id siteUrl feedUrl kind title description icon author postsPerWeek lastPostAt score
    reasons { kind guide guideName count title }
    latest { title url image summary publishedAt minutes }
    status subscriptionId trialEndsAt
    """

  struct Suggestions {
    var suggestions: [FeedSuggestion]
    var enabled: Bool
    var builtAt: Date?
  }

  private struct SuggestionsData: Decodable {
    let feedSuggestions: Result
    struct Result: Decodable {
      let suggestions: [FeedSuggestion]?
      let builtAt: Date?
      let enabled: Bool?
      let errorCodes: [String]?
    }
  }

  private static func fetch(_ status: String, first: Int) async throws -> Suggestions {
    let gql = """
      query FeedSuggestions($statuses: [FeedSuggestionStatus!], $first: Int) {
        feedSuggestions(statuses: $statuses, first: $first) {
          ... on FeedSuggestionsSuccess { suggestions { \(fields) } builtAt enabled }
          ... on FeedSuggestionsError { errorCodes }
        }
      }
      """
    let data: SuggestionsData = try await StashAPI.shared.graphQL(gql, variables: ["statuses": [status], "first": first])
    if let code = data.feedSuggestions.errorCodes?.first { throw StashError.server(code) }
    return Suggestions(
      suggestions: data.feedSuggestions.suggestions ?? [],
      enabled: data.feedSuggestions.enabled ?? true,
      builtAt: data.feedSuggestions.builtAt
    )
  }

  /// New suggestions, plus the ones you're trying or have followed, each asked for on its own
  /// so a long history never crowds out what's new (as the web app does).
  static func suggestions() async throws -> Suggestions {
    async let new = fetch("NEW", first: 40)
    async let trials = fetch("TRIAL", first: 20)
    async let following = fetch("FOLLOWING", first: 12)
    var result = try await new
    result.suggestions += try await trials.suggestions + following.suggestions
    return result
  }

  /// How many new suggestions are waiting, for the sidebar's "11 new".
  static func newCount() async throws -> Int {
    let new = try await fetch("NEW", first: 40)
    return new.enabled ? new.suggestions.count : 0
  }

  static func dismissed() async throws -> [FeedSuggestion] {
    try await fetch("DISMISSED", first: 100).suggestions
  }

  // MARK: Actions

  private static func update(_ id: String, _ action: String, subscriptionId: String? = nil) async throws {
    var input: [String: Any] = ["id": id, "action": action]
    if let subscriptionId { input["subscriptionId"] = subscriptionId }
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation UpdateFeedSuggestion($input: UpdateFeedSuggestionInput!) {
        updateFeedSuggestion(input: $input) {
          ... on UpdateFeedSuggestionSuccess { suggestion { id status } }
          ... on UpdateFeedSuggestionError { errorCodes }
        }
      }
      """, variables: ["input": input])
    let result = data["updateFeedSuggestion"] as? [String: Any]
    if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
  }

  /// Subscribes to the feed, then records what you did so the next night's suggestions learn from it.
  private static func subscribe(_ suggestion: FeedSuggestion, action: String) async throws {
    guard let feedURL = suggestion.feedUrl else { throw StashError.server("This one has no feed to follow.") }
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation Subscribe($input: SubscribeInput!) {
        subscribe(input: $input) {
          ... on SubscribeSuccess { subscriptions { id } }
          ... on SubscribeError { errorCodes }
        }
      }
      """, variables: ["input": ["url": feedURL, "subscriptionType": "RSS"]])
    let result = data["subscribe"] as? [String: Any]
    let id = (result?["subscriptions"] as? [[String: Any]])?.first?["id"] as? String
    let codes = result?["errorCodes"] as? [String] ?? []
    if id == nil && !codes.contains("ALREADY_SUBSCRIBED") {
      throw StashError.server("Couldn't follow \(suggestion.title).")
    }
    try await update(suggestion.id, action, subscriptionId: id)
  }

  private static func unsubscribe(_ suggestion: FeedSuggestion) async throws {
    guard let id = suggestion.subscriptionId else { return }
    _ = try await StashAPI.shared.graphQLJSON("""
      mutation Unsubscribe($name: String!, $subscriptionId: ID!) {
        unsubscribe(name: $name, subscriptionId: $subscriptionId) {
          ... on UnsubscribeSuccess { subscription { id } }
          ... on UnsubscribeError { errorCodes }
        }
      }
      """, variables: ["name": suggestion.title, "subscriptionId": id])
  }

  static func follow(_ suggestion: FeedSuggestion) async throws {
    if suggestion.status == "TRIAL" {
      try await update(suggestion.id, "KEEP")
    } else {
      try await subscribe(suggestion, action: "FOLLOW")
    }
  }

  static func tryForAWeek(_ suggestion: FeedSuggestion) async throws {
    try await subscribe(suggestion, action: "TRY")
  }

  /// Ends a trial and unsubscribes.
  static func drop(_ suggestion: FeedSuggestion) async throws {
    try await unsubscribe(suggestion)
    try await update(suggestion.id, "DROP")
  }

  /// Never suggested again (until restored).
  static func dismiss(_ suggestion: FeedSuggestion) async throws {
    try await update(suggestion.id, "DISMISS")
  }

  static func restore(_ suggestion: FeedSuggestion) async throws {
    try await update(suggestion.id, "RESTORE")
  }
}

extension Discover {
  /// "Someone new" in The Edition: the strongest suggestions with a story to show, one of them a
  /// writer you keep finishing when there is one. Channels and starting points stay on Discover.
  static func someoneNew(_ suggestions: [FeedSuggestion], count: Int = 2) -> [FeedSuggestion] {
    let ranked = suggestions
      .filter { $0.status == "NEW" && $0.feedUrl != nil && !($0.latest.first?.title.isEmpty ?? true)
        && !$0.isChannel && !$0.isStarter && $0.score >= 0.45 }
      .sorted { $0.score > $1.score }
    var picks = Array(ranked.prefix(count))
    if let writer = ranked.first(where: { $0.reasons.first?.kind == "writer" }),
       !picks.contains(writer), picks.count == count {
      picks[count - 1] = writer
    }
    return picks
  }

  /// Trials whose week is up and haven't been answered yet, oldest first.
  static func verdictsDue(_ suggestions: [FeedSuggestion], now: Date = .now) -> [FeedSuggestion] {
    suggestions
      .filter { suggestion in
        guard suggestion.status == "TRIAL", let end = suggestion.trialEndsAt else { return false }
        let ended = now.timeIntervalSince(end)
        return ended >= -43_200 && ended < 7 * 86_400
      }
      .sorted { ($0.trialEndsAt ?? .now) < ($1.trialEndsAt ?? .now) }
  }

  /// Turning suggestions off forgets them on the server; turning them on starts the first look.
  static func setEnabled(_ enabled: Bool) async throws {
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation SetFeedSuggestionsEnabled($enabled: Boolean!) {
        setFeedSuggestionsEnabled(enabled: $enabled) {
          ... on SetFeedSuggestionsEnabledSuccess { enabled }
          ... on SetFeedSuggestionsEnabledError { errorCodes }
        }
      }
      """, variables: ["enabled": enabled])
    let result = data["setFeedSuggestionsEnabled"] as? [String: Any]
    if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
  }
}
