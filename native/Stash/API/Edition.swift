import Foundation

// The Edition: a weekly issue laid out from what the week left behind: feed stories you never
// opened, saves left on the shelf, highlights worth seeing again, and your week in reading.
// Issues are kept with your account (personalization `edition`), in the same shape the web app
// uses, so whichever opens first makes the issue and the others show that one.
// The ranking engine below is a port of the web's lib/edition/engine.ts.

struct Edition: Codable, Hashable {
  var kind = "weekly"
  /// The day the issue came out, as a local yyyy-mm-dd date.
  let date: String
  let number: Int
  let builtAt: String
  let entries: [Entry]
  var skipped: [String]
  let quotes: [Quote]
  let week: WeekStats
  let considered: Int
  let sources: Int

  struct Entry: Codable, Hashable {
    let id: String
    /// lead, missed or shelf.
    let slot: String
    /// A short reason it was chosen, e.g. "412 points on Hacker News".
    let why: String?
  }

  struct Quote: Codable, Hashable {
    let id: String
    let quote: String
    let itemId: String
    let slug: String
    let title: String
    let source: String
    let createdAt: String
  }

  struct WeekStats: Codable, Hashable {
    let finished: Int
    let minutes: Double
    let highlights: Int
    let topSource: String?
    let longest: Longest?
    struct Longest: Codable, Hashable { let title: String; let minutes: Double }
  }
}

/// The Edition's settings and stored issues.
struct EditionState {
  /// The day (0 is Sunday) and hour a new issue comes out.
  var day = 6
  var hour = 7
  /// Show the issue's strip on Home while it is out and unopened.
  var showOnHome = true
  /// How many saves Home's Up next shows.
  var upNext = 5
  /// Issue dates opened, and marked read.
  var opened: [String] = []
  var read: [String] = []
  var editions: [Edition] = []

  /// The issue that is (or last was) out, and whether it's still out.
  func status(now: Date = .now) -> (out: Bool, date: String) {
    let date = EditionSchedule.issueDate(now: now, day: day, hour: hour)
    return (now < EditionSchedule.outUntil(date) && !read.contains(date), date)
  }

  /// Out and not opened yet: Home shows a strip for it.
  func isFresh(now: Date = .now) -> Bool {
    let status = status(now: now)
    return status.out && !opened.contains(status.date)
  }
}

enum EditionSchedule {
  private static var calendar: Calendar { Calendar.current }

  static func localDate(_ date: Date) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  static func at(_ date: String, hour: Int) -> Date {
    let parts = date.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return .now }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour)) ?? .now
  }

  private static func adding(_ days: Int, to date: Date) -> Date {
    calendar.date(byAdding: .day, value: days, to: date) ?? date
  }

  /// 0 is Sunday, as in JavaScript.
  private static func weekday(_ date: Date) -> Int { calendar.component(.weekday, from: date) - 1 }

  /// The date of the latest issue at or before `now`.
  static func issueDate(now: Date, day: Int, hour: Int) -> String {
    let back = (weekday(now) - day + 7) % 7
    var date = localDate(adding(-back, to: now))
    if at(date, hour: hour) > now {
      date = localDate(adding(-7, to: at(date, hour: 12)))
    }
    return date
  }

  /// When an issue stops being out: midnight at the end of the Sunday on or after it.
  static func outUntil(_ date: String) -> Date {
    let start = at(date, hour: 0)
    return adding((7 - weekday(start)) % 7 + 1, to: start)
  }

  /// The start of the seven days an issue covers.
  static func weekStart(_ date: String) -> Date { adding(-7, to: at(date, hour: 0)) }

  /// Issue numbers count weeks from the first weekly Edition.
  static func issueNumber(_ date: String) -> Int {
    let days = calendar.dateComponents([.day], from: at("2026-10-17", hour: 12), to: at(date, hour: 12)).day ?? 0
    return max(1, Int((Double(days) / 7).rounded(.down)) + 1)
  }

  static let dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
}

// MARK: Loading and saving

enum EditionStore {
  private static let keep = 12

  static func load() async throws -> EditionState {
    let fields = try await Personalization.fields()
    return state(from: fields["edition"])
  }

  private static func state(from value: Any?) -> EditionState {
    let stored = value as? [String: Any] ?? [:]
    let weekly = stored["weekly"] as? [String: Any] ?? [:]
    var state = EditionState()
    if let day = weekly["day"] as? Int { state.day = day }
    if let hour = weekly["hour"] as? Int { state.hour = hour }
    state.showOnHome = (weekly["showOnHome"] as? Bool) != false
    if let upNext = weekly["upNext"] as? Int { state.upNext = upNext }
    state.opened = weekly["opened"] as? [String] ?? []
    state.read = weekly["read"] as? [String] ?? []
    // Daily editions from before The Edition went weekly are left behind.
    state.editions = (stored["editions"] as? [[String: Any]] ?? []).compactMap { raw in
      guard raw["kind"] as? String == "weekly",
            let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
      return try? JSONDecoder().decode(Edition.self, from: data)
    }
    return state
  }

  /// Changes the stored settings and issues, keeping anything else stored there as it is.
  @discardableResult
  static func update(
    weekly change: (inout [String: Any]) -> Void = { _ in },
    editions changeEditions: (inout [[String: Any]]) -> Void = { _ in }
  ) async throws -> EditionState {
    let fields = try await Personalization.update("edition") { value in
      var stored = value as? [String: Any] ?? [:]
      var weekly = stored["weekly"] as? [String: Any] ?? [:]
      change(&weekly)
      for key in ["opened", "read"] {
        if let dates = weekly[key] as? [String] { weekly[key] = Array(dates.suffix(keep)) }
      }
      var editions = (stored["editions"] as? [[String: Any]] ?? []).filter { $0["kind"] as? String == "weekly" }
      changeEditions(&editions)
      stored["weekly"] = weekly
      stored["editions"] = Array(editions.prefix(keep))
      return stored
    }
    return state(from: fields["edition"])
  }

  static func markOpened(_ date: String) async throws {
    try await update(weekly: { $0["opened"] = with(date, $0["opened"]) })
  }

  /// Puts The Edition away until the next issue, or (with `false`) brings it back.
  @discardableResult
  static func markRead(_ date: String, _ read: Bool = true) async throws -> EditionState {
    try await update(weekly: { weekly in
      if read {
        weekly["read"] = with(date, weekly["read"])
        weekly["opened"] = with(date, weekly["opened"])
      } else {
        weekly["read"] = (weekly["read"] as? [String] ?? []).filter { $0 != date }
      }
    })
  }

  static func skip(_ ids: [String], in date: String) async throws {
    try await update(editions: { editions in
      for index in editions.indices where editions[index]["date"] as? String == date {
        let skipped = editions[index]["skipped"] as? [String] ?? []
        editions[index]["skipped"] = skipped + ids.filter { !skipped.contains($0) }
      }
    })
  }

  static func setSetting(_ key: String, _ value: Any) async throws {
    try await update(weekly: { $0[key] = value })
  }

  private static func with(_ date: String, _ value: Any?) -> [String] {
    let dates = value as? [String] ?? []
    return dates.contains(date) ? dates : dates + [date]
  }

  /// This week's issue, made and saved now if it's out and doesn't exist yet.
  static func loadThisWeek(subscriptions: [Subscription], now: Date = .now) async throws -> EditionState {
    let state = try await load()
    let date = EditionSchedule.issueDate(now: now, day: state.day, hour: state.hour)
    let out = now < EditionSchedule.outUntil(date)
    guard out, state.editions.first?.date != date else { return state }
    let edition = try await make(state: state, date: date, now: now, subscriptions: subscriptions)
    let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(edition)) as? [String: Any] ?? [:]
    return try await update(editions: { editions in
      // Another device may have made it in the meantime; keep theirs.
      if editions.first?["date"] as? String != date { editions.insert(encoded, at: 0) }
    })
  }

  private static func isoDay(_ date: Date) -> String {
    String(date.ISO8601Format().prefix(10))
  }

  /// Follows pages of a search up to `max` items.
  private static func searchAll(_ query: String, max: Int) async throws -> [LibraryItem] {
    var items: [LibraryItem] = []
    var cursor: String?
    while items.count < max {
      let page = try await Library.search(query, after: cursor, first: min(100, max - items.count))
      items += page.items
      guard page.pageInfo.hasNextPage else { break }
      cursor = page.pageInfo.endCursor
    }
    return items
  }

  private static func make(state: EditionState, date: String, now: Date, subscriptions: [Subscription]) async throws -> Edition {
    let since = EditionSchedule.weekStart(date)
    let day: TimeInterval = 86_400
    async let missed = searchAll("in:following use:folders -type:video saved:\(isoDay(since))..* sort:saved-desc", max: 300)
    async let shelf = searchAll("in:inbox use:folders is:unread -type:video saved:*..\(isoDay(now - 14 * day)) sort:saved-desc", max: 80)
    async let history = searchAll("in:all saved:\(isoDay(now - 60 * day))..* sort:saved-desc", max: 400)
    async let read = searchAll("in:all read:\(isoDay(since))..* sort:read-desc", max: 200)
    // If highlights can't be read the issue goes out without them.
    async let highlights = (try? await Highlights.recent(200)) ?? []

    let skipped = Set(state.editions.flatMap(\.skipped))
    let featured = Set(state.editions.flatMap { $0.entries.map(\.id) + $0.quotes.map(\.id) })
    let missedItems = try await missed
    let shelfItems = try await shelf
    let historyItems = try await history
    let readItems = try await read
    let recentHighlights = await highlights
    let buzz = await HackerNews.buzz(for: Array(missedItems.filter { !featured.contains($0.id) }.prefix(30)))

    return EditionEngine.build(.init(
      now: now,
      date: date,
      missed: missedItems,
      shelf: shelfItems,
      history: historyItems,
      read: readItems,
      highlights: recentHighlights,
      skipped: skipped,
      featured: featured,
      buzz: buzz,
      sourceName: { item in
        if let value = item.subscription,
           let match = subscriptions.first(where: { $0.url == value || $0.name == value }) {
          return match.name
        }
        return item.source
      }
    ))
  }
}

/// Points and comments for articles posted to Hacker News, the best public measure of what's popular.
enum HackerNews {
  struct Buzz { let points: Int; let comments: Int }

  static func buzz(for items: [LibraryItem]) async -> [String: Buzz] {
    await withTaskGroup(of: (String, Buzz?).self) { group in
      // A few at a time, so the issue isn't held up for long.
      var queue = items[...]
      var found: [String: Buzz] = [:]
      for _ in 0..<6 {
        if let item = queue.popFirst() { group.addTask { (item.id, await ask(item)) } }
      }
      while let (id, buzz) = await group.next() {
        if let buzz { found[id] = buzz }
        if let item = queue.popFirst() { group.addTask { (item.id, await ask(item)) } }
      }
      return found
    }
  }

  private struct Response: Decodable {
    let hits: [Hit]?
    struct Hit: Decodable { let points: Int?; let num_comments: Int? }
  }

  private static func ask(_ item: LibraryItem) async -> Buzz? {
    let url = item.originalArticleUrl ?? item.url
    guard url.hasPrefix("http"), !url.contains("news.ycombinator.com") else { return nil }
    let bare = url
      .replacingOccurrences(of: #"^https?://(www\.)?"#, with: "", options: .regularExpression)
      .replacingOccurrences(of: #"[?#].*$"#, with: "", options: .regularExpression)
    var components = URLComponents(string: "https://hn.algolia.com/api/v1/search")!
    components.queryItems = [
      .init(name: "restrictSearchableAttributes", value: "url"),
      .init(name: "hitsPerPage", value: "3"),
      .init(name: "query", value: bare),
    ]
    guard let requestURL = components.url else { return nil }
    var request = URLRequest(url: requestURL)
    request.timeoutInterval = 4
    guard let (data, _) = try? await URLSession.shared.data(for: request),
          let response = try? JSONDecoder().decode(Response.self, from: data) else { return nil }
    let best = (response.hits ?? []).max { ($0.points ?? 0) < ($1.points ?? 0) }
    guard let points = best?.points, points > 0 else { return nil }
    return Buzz(points: points, comments: best?.num_comments ?? 0)
  }
}

// MARK: The ranking engine

/// Each candidate gets five signals between 0 and 1: relevance (how close its words are to what
/// you read, save and highlight), affinity (how often you read this source), popularity (Hacker
/// News points, or the same story from several feeds), freshness and quality. The score mixes
/// them; each section then picks by its own rules.
enum EditionEngine {
  struct Input {
    let now: Date
    let date: String
    /// The week's feed stories, opened or not; the engine keeps the unopened.
    let missed: [LibraryItem]
    /// Saved, unread articles older than two weeks.
    let shelf: [LibraryItem]
    /// Recent items with what you did with them, to learn from.
    let history: [LibraryItem]
    /// What you opened this week, for the week in reading.
    let read: [LibraryItem]
    let highlights: [Highlight]
    let skipped: Set<String>
    let featured: Set<String>
    let buzz: [String: HackerNews.Buzz]
    let sourceName: (LibraryItem) -> String
  }

  private static let missedCount = 3
  private static let shelfCount = 3
  private static let quoteCount = 2
  private static let day: TimeInterval = 86_400

  private static let stopWords = Set("""
    the and for with that this from your you are was were have has had not but
    what when where who why how all any can will just than then them they their
    there these those into over under about after before more most some such
    only own same other our out its it's his her him she he new now one two
    three get got also been being does did doing would could should may might
    very much many make made like via per using use used here off yet still
    even ever every each both few lot lots way ways thing things time times
    year years day days week weeks today why's how's what's don't can't won't
    i'm we're they're you're isn't aren't didn't doesn't let's says said say
    first last best good great big little long short high low part show
    video episode podcast newsletter issue edition read reading article post
    """.split(whereSeparator: \.isWhitespace).map(String.init))

  /// Lower-case words worth matching on, with a light plural stem.
  static func words(_ text: String?) -> [String] {
    guard let text else { return [] }
    let folded = text.lowercased().folding(options: .diacriticInsensitive, locale: nil)
    var cleaned = String.UnicodeScalarView()
    for scalar in folded.unicodeScalars {
      let keep = CharacterSet.letters.contains(scalar) || CharacterSet.decimalDigits.contains(scalar)
        || CharacterSet.whitespacesAndNewlines.contains(scalar) || scalar == "'" || scalar == "-"
      cleaned.append(keep ? scalar : " ")
    }
    return String(cleaned)
      .split(whereSeparator: { $0.isWhitespace || $0 == "-" })
      .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: "'")) }
      .filter { $0.count >= 3 && !stopWords.contains($0) && !$0.allSatisfy(\.isNumber) }
      .map { $0.count > 4 && $0.hasSuffix("s") && !$0.hasSuffix("ss") ? String($0.dropLast()) : $0 }
  }

  private static func itemWords(_ item: LibraryItem) -> [String] {
    var seen = Set<String>()
    return words("\(item.title) \(item.description ?? "")").filter { seen.insert($0).inserted }
  }

  /// What a feed item records as its feed, or the site for everything else.
  static func sourceKey(_ item: LibraryItem) -> String {
    if let subscription = item.subscription { return subscription.lowercased() }
    if let siteName = item.siteName, !siteName.isEmpty { return siteName.lowercased() }
    return item.originalURL?.host()?.replacingOccurrences(of: "www.", with: "") ?? item.url
  }

  private static func isSavedByYou(_ item: LibraryItem) -> Bool {
    item.folder != "following" && item.subscription == nil
  }

  /// How much you engaged with an item, from 0 (ignored or skipped) to 1 (read most of it,
  /// highlighted it, or kept it). Nil when there's nothing to go on yet.
  private static func engagement(_ item: LibraryItem, _ skipped: Set<String>) -> Double? {
    if skipped.contains(item.id) { return 0 }
    let progress = item.readingProgressPercent ?? 0
    if progress >= 60 || (item.highlightsCount ?? 0) > 0 { return 1 }
    // Saved from a feed into the library.
    if item.subscription != nil, let folder = item.folder, folder != "following" { return 1 }
    if progress >= 10 { return 0.6 }
    if item.seenAt != nil || item.isArchived { return 0 }
    // Saved by hand: a sign of interest even before it is read.
    if isSavedByYou(item) { return 0.7 }
    return nil
  }

  private struct Profile {
    var words: [String: Double] = [:]
    var documentFrequency: [String: Int] = [:]
    var documents = 0
    var sources: [String: (score: Double, count: Int)] = [:]
  }

  private static func learn(_ history: [LibraryItem], _ skipped: Set<String>) -> Profile {
    var profile = Profile(documents: history.count)
    for item in history {
      let unique = itemWords(item)
      unique.forEach { profile.documentFrequency[$0, default: 0] += 1 }
      guard let value = engagement(item, skipped) else { continue }
      // Read items pull their words up; ignored ones push them down a little.
      unique.forEach { profile.words[$0, default: 0] += value - 0.4 }
      if item.pageType != "VIDEO" || item.subscription != nil {
        let key = sourceKey(item)
        let source = profile.sources[key] ?? (0, 0)
        profile.sources[key] = (source.score + value, source.count + 1)
      }
    }
    return profile
  }

  private static func affinity(_ profile: Profile, _ item: LibraryItem) -> (value: Double, count: Int) {
    let source = profile.sources[sourceKey(item)]
    // Starts at a neutral 0.5 and moves with each item you read or ignore.
    return (((source?.score ?? 0) + 1) / Double((source?.count ?? 0) + 2), source?.count ?? 0)
  }

  private static func relevance(_ profile: Profile, _ item: LibraryItem) -> (value: Double, topic: String?) {
    let unique = itemWords(item)
    var total = 0.0
    var best: (word: String, value: Double)?
    for word in unique {
      let weight = profile.words[word] ?? 0
      guard weight > 0 else { continue }
      let idf = log(Double(profile.documents + 1) / Double((profile.documentFrequency[word] ?? 0) + 1)) + 1
      let value = weight * idf
      total += value
      // Only name a topic you've read about more than once.
      if weight >= 1, value > (best?.value ?? -1) { best = (word, value) }
    }
    return (total / (Double(unique.count) + 1).squareRoot(), best?.word)
  }

  /// Points and comments some feeds put in the summary (Hacker News, Lobsters).
  private static func pointsInText(_ text: String?) -> (points: Int, comments: Int) {
    func number(_ pattern: String) -> Int {
      guard let text, let match = text.firstMatch(of: try! Regex(pattern).ignoresCase()) else { return 0 }
      for index in 1..<match.output.count {
        if let value = match.output[index].substring, let number = Int(value) { return number }
      }
      return 0
    }
    return (
      number(#"(?:points?|score)\s*:?\s*(\d+)|(\d+)\s+points?"#),
      number(#"(?:comments?)\s*:?\s*(\d+)|(\d+)\s+comments?"#)
    )
  }

  private static func normalisedURL(_ item: LibraryItem) -> String {
    guard let url = item.originalURL, let host = url.host() else { return item.url }
    var path = url.path()
    if path.hasSuffix("/") { path.removeLast() }
    return host.replacingOccurrences(of: "www.", with: "") + path
  }

  private static func overlap(_ a: [String], _ b: [String]) -> Double {
    guard a.count >= 3, b.count >= 3 else { return 0 }
    let set = Set(a)
    let shared = b.filter { set.contains($0) }.count
    return Double(shared) / Double(a.count + b.count - shared)
  }

  /// How many other feeds brought in the same story.
  private static func coverage(_ items: [LibraryItem]) -> [Int] {
    let titles = items.map { words($0.title) }
    let urls = items.map(normalisedURL)
    let keys = items.map(sourceKey)
    return items.indices.map { i in
      var others = Set<String>()
      for j in items.indices where i != j && keys[i] != keys[j] {
        if urls[i] == urls[j] || overlap(titles[i], titles[j]) >= 0.5 { others.insert(keys[j]) }
      }
      return others.count
    }
  }

  private static func minutes(_ item: LibraryItem) -> Double {
    // No word count yet: guess, as summaries are usually teasers.
    Double(item.readingMinutes ?? 4)
  }

  private static func hasImage(_ item: LibraryItem) -> Bool { item.image != nil || item.headerImage != nil }

  private static func ageHours(_ item: LibraryItem, _ now: Date) -> Double {
    guard let date = item.publishedAt ?? item.savedAt ?? item.createdAt else { return 48 }
    return max(0, now.timeIntervalSince(date) / 3600)
  }

  private struct Scored {
    let item: LibraryItem
    var score: Double
    let relevance: Double
    let freshness: Double
    let why: String?
  }

  private static func score(_ items: [LibraryItem], _ profile: Profile, _ input: Input) -> [Scored] {
    let cover = coverage(items)
    let relevances = items.map { relevance(profile, $0) }
    let top = max(0, relevances.map(\.value).max() ?? 0)
    return items.indices.map { index in
      let item = items[index]
      let rel = top > 0 ? relevances[index].value / top : 0
      let source = affinity(profile, item)
      let inText = pointsInText(item.description)
      let buzz = input.buzz[item.id]
      let points = max(inText.points, buzz?.points ?? 0)
      let comments = max(inText.comments, buzz?.comments ?? 0)
      let fromPoints = min(1, log1p(Double(points + comments * 2)) / log1p(1000))
      let fromCoverage = min(1, Double(cover[index]) / 2)
      let popularity = max(fromPoints, fromCoverage)
      let freshness = exp(-ageHours(item, input.now) / 36)
      let quality: Double = (hasImage(item) ? 0.6 : 0) + (item.description != nil ? 0.2 : 0) + ((item.wordsCount ?? 0) >= 600 ? 0.2 : 0)
      let saved = isSavedByYou(item)
      let score = 0.35 * rel + 0.25 * source.value + 0.2 * popularity + 0.1 * freshness + 0.1 * quality + (saved ? 0.08 : 0)

      // The reason shown with the story is its strongest signal.
      var reasons: [(text: String, strength: Double)] = []
      if saved { reasons.append(("Saved by you", 0.95)) }
      if cover[index] > 0 { reasons.append(("On \(cover[index] + 1) of your feeds", 0.5 + fromCoverage / 2)) }
      if points >= 50 {
        let where_ = buzz != nil && (buzz?.points ?? 0) >= inText.points ? " on Hacker News" : ""
        reasons.append(("\(points) points\(where_)", 0.4 + fromPoints / 2))
      }
      if let topic = relevances[index].topic, rel >= 0.4 { reasons.append(("More on \(topic)", rel * 0.8)) }
      if source.count >= 3 && source.value >= 0.65 {
        reasons.append(("You read a lot of \(input.sourceName(item))", source.value * 0.7))
      }
      if freshness >= 0.85 { reasons.append(("Just published", 0.25)) }
      let why = reasons.max { $0.strength < $1.strength }?.text

      return Scored(item: item, score: score, relevance: rel, freshness: freshness, why: why)
    }
  }

  /// A stable shuffle: the same issue date always gives the same order.
  private static func seeded<T>(_ list: [T], _ seed: String) -> [T] {
    var hash: UInt32 = 2_166_136_261
    for unit in seed.utf16 { hash = (hash ^ UInt32(unit)) &* 16_777_619 }
    func next() -> Double {
      hash = (hash ^ (hash >> 15)) &* 2_246_822_507
      hash = (hash ^ (hash >> 13)) &* 3_266_489_909
      hash ^= hash >> 16
      return Double(hash) / 4_294_967_296
    }
    var out = list
    if out.count > 1 {
      for i in stride(from: out.count - 1, to: 0, by: -1) {
        out.swapAt(i, Int(next() * Double(i + 1)))
      }
    }
    return out
  }

  private static func weekStats(_ input: Input, since: Date, until: Date) -> Edition.WeekStats {
    func inWeek(_ date: Date?) -> Bool { date.map { $0 >= since && $0 < until } ?? false }
    let opened = input.read.filter { inWeek($0.readAt) }
    let finished = opened.filter { ($0.readingProgressPercent ?? 0) >= 90 }
    let total = opened.reduce(0.0) { $0 + minutes($1) * min(100, $1.readingProgressPercent ?? 0) / 100 }
    var bySource: [String: Int] = [:]
    for item in opened where (item.readingProgressPercent ?? 0) >= 30 {
      bySource[input.sourceName(item), default: 0] += 1
    }
    let top = bySource.max { $0.value < $1.value }
    let longest = finished.max { minutes($0) < minutes($1) }
    return .init(
      finished: finished.count,
      minutes: total.rounded(),
      highlights: input.highlights.filter { inWeek($0.createdAt) }.count,
      topSource: (top?.value ?? 0) >= 2 ? top?.key : nil,
      longest: longest.map { .init(title: $0.title, minutes: minutes($0)) }
    )
  }

  static func build(_ input: Input) -> Edition {
    let profile = learn(input.history, input.skipped)
    let dayAgo = input.now - day
    // The week the issue covers: the seven days up to the start of its date.
    let since = EditionSchedule.weekStart(input.date)
    let until = since + 7 * day

    func untouched(_ item: LibraryItem) -> Bool {
      !input.featured.contains(item.id) && !input.skipped.contains(item.id)
        && item.state != "ARCHIVED" && item.state != "DELETED"
        && (item.readingProgressPercent ?? 0) < 2
    }

    // Missed: the week's feed stories you never opened, leaving the last day to Home.
    let missedPool = input.missed.filter { item in
      guard untouched(item), item.folder == "following", item.pageType != "VIDEO" else { return false }
      let saved = item.savedAt ?? item.createdAt ?? .distantPast
      let published = item.publishedAt ?? item.savedAt ?? item.createdAt ?? .distantPast
      return saved >= since && published < dayAgo
    }
    let scored = score(missedPool, profile, input)
      // A week on, freshness says little; what you'd have liked says more.
      .map { entry -> Scored in
        var entry = entry
        entry.score += -0.1 * entry.freshness + 0.05 * entry.relevance
        return entry
      }
      .sorted { $0.score > $1.score }

    var entries: [Edition.Entry] = []
    var chosen = Set<String>()
    var perSource: [String: Int] = [:]
    var stories: [(url: String, words: [String])] = []

    func sameStory(_ item: LibraryItem) -> Bool {
      stories.contains { $0.url == normalisedURL(item) || overlap($0.words, words(item.title)) >= 0.5 }
    }
    func take(_ entry: Scored, _ slot: String, why: String? = nil) {
      entries.append(.init(id: entry.item.id, slot: slot, why: why ?? entry.why))
      chosen.insert(entry.item.id)
      stories.append((normalisedURL(entry.item), words(entry.item.title)))
      perSource[sourceKey(entry.item), default: 0] += 1
    }
    func allowed(_ entry: Scored) -> Bool {
      !chosen.contains(entry.item.id) && !sameStory(entry.item) && (perSource[sourceKey(entry.item)] ?? 0) < 1
    }
    func count(_ slot: String) -> Int { entries.filter { $0.slot == slot }.count }

    // Lead: the best long read with a picture.
    if let lead = scored.first(where: { hasImage($0.item) && minutes($0.item) >= 5 })
      ?? scored.first(where: { hasImage($0.item) }) ?? scored.first {
      take(lead, "lead")
    }

    // Also missed: the next best, one per source, pictures first.
    for withPicture in [true, false] {
      for entry in scored {
        if count("missed") >= missedCount { break }
        if withPicture && !hasImage(entry.item) { continue }
        if allowed(entry) { take(entry, "missed") }
      }
    }

    // The back of the shelf: old saves, the longer and closer to what you read the better.
    let shelf = score(input.shelf.filter(untouched), profile, input)
      .map { entry -> Scored in
        var entry = entry
        entry.score = 0.6 * entry.score + 0.4 * (min(30, minutes(entry.item)) / 30)
        return entry
      }
      .sorted { $0.score > $1.score }
    for entry in shelf {
      if count("shelf") >= shelfCount { break }
      if allowed(entry) { take(entry, "shelf", why: "Saved, never opened") }
    }

    // Highlights worth seeing again: a fair length, a couple of weeks old, not shown before.
    let usable = input.highlights.filter { highlight in
      let length = highlight.quote?.trimmingCharacters(in: .whitespacesAndNewlines).count ?? 0
      return !input.featured.contains(highlight.id) && length >= 40 && length <= 320 && highlight.libraryItem != nil
    }
    let settled = usable.filter { $0.createdAt < input.now - 14 * day }
    var picked = Array(seeded(settled, input.date).prefix(quoteCount))
    if picked.count < quoteCount {
      let ids = Set(picked.map(\.id))
      picked += seeded(usable.filter { !ids.contains($0.id) }, input.date).prefix(quoteCount - picked.count)
    }

    return Edition(
      date: input.date,
      number: EditionSchedule.issueNumber(input.date),
      builtAt: input.now.ISO8601Format(),
      entries: entries,
      skipped: [],
      quotes: picked.compactMap { highlight in
        guard let item = highlight.libraryItem else { return nil }
        return .init(
          id: highlight.id,
          quote: (highlight.quote ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
          itemId: item.id,
          slug: item.slug,
          title: item.title,
          source: item.source,
          createdAt: highlight.createdAt.ISO8601Format()
        )
      },
      week: weekStats(input, since: since, until: until),
      considered: missedPool.count,
      sources: Set(missedPool.map(sourceKey)).count
    )
  }
}
