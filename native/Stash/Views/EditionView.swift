import SwiftUI

/// The Edition's settings and stored issues, shared by the sidebar (which shows The Edition only
/// while an issue is out), Home's strip and the issue itself.
@MainActor
@Observable
final class EditionModel {
  private(set) var state: EditionState?
  private(set) var isMaking = false
  private(set) var error: String?
  private(set) var now = Date.now

  var status: (out: Bool, date: String)? { state?.status(now: now) }
  var isOut: Bool { status?.out ?? false }
  var isFresh: Bool { state?.isFresh(now: now) ?? false }

  /// The issue that's out (or last came out), once it's been made.
  var current: Edition? {
    guard let date = status?.date else { return nil }
    return state?.editions.first { $0.date == date }
  }

  func refresh() async {
    now = .now
    if let fresh = try? await EditionStore.load() { state = fresh }
  }

  /// Makes this week's issue if it's out and nobody has made it yet.
  func make(subscriptions: [Subscription]) async {
    guard !isMaking else { return }
    isMaking = true
    defer { isMaking = false }
    do {
      state = try await EditionStore.loadThisWeek(subscriptions: subscriptions)
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  func markOpened(_ date: String) {
    guard state?.opened.contains(date) == false else { return }
    state?.opened.append(date)
    Task { try? await EditionStore.markOpened(date) }
  }

  func markRead(_ date: String, _ read: Bool = true) async throws {
    state = try await EditionStore.markRead(date, read)
  }

  func skip(_ ids: [String], in date: String) {
    if let index = state?.editions.firstIndex(where: { $0.date == date }) {
      state?.editions[index].skipped += ids
    }
    Task { try? await EditionStore.skip(ids, in: date) }
  }

  func set(_ key: String, _ value: Any) async {
    // Show the change straight away; the server copy follows.
    switch (key, value) {
    case ("day", let day as Int): state?.day = day
    case ("hour", let hour as Int): state?.hour = hour
    case ("showOnHome", let show as Bool): state?.showOnHome = show
    case ("upNext", let count as Int): state?.upNext = count
    default: break
    }
    do {
      try await EditionStore.setSetting(key, value)
    } catch {
      self.error = error.localizedDescription
    }
    await refresh()
  }
}

/// The weekly issue: the best of the week you missed, the back of the shelf, highlights worth
/// another look, someone new to read, and your week in reading.
struct EditionView: View {
  /// Called once the issue is marked read, to leave it.
  let onPutAway: () -> Void

  @Environment(EditionModel.self) private var model
  @State private var subscriptions: [Subscription] = []
  @State private var items: [String: LibraryItem] = [:]
  @State private var loadedFor: String?
  @State private var newcomers: [FeedSuggestion] = []
  @State private var verdicts: [FeedSuggestion] = []
  @State private var actedOn: [String: String] = [:]
  @State private var path = NavigationPath()
  @State private var toaster = Toaster()

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        Group {
          if let edition = model.current {
            issue(edition)
          } else if let error = model.error {
            ContentUnavailableView {
              Label("Couldn't make this week's issue", systemImage: "newspaper")
            } description: {
              Text(error)
            } actions: {
              Button("Try again") { Task { await model.make(subscriptions: subscriptions) } }
            }
          } else {
            VStack(spacing: 12) {
              ProgressView()
              Text("Putting this week's issue together…")
                .font(.callout)
                .foregroundStyle(Color.stashMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
          }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: 760)
        .frame(maxWidth: .infinity)
      }
      .background(Color.stashBackground)
      .navigationTitle("The Edition")
      #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
      #endif
      .navigationDestination(for: LibraryItem.self) { item in
        ItemDestination(item: item, perform: perform)
      }
      .refreshable { await load(force: true) }
      .task { await load(force: false) }
      .toasts(toaster)
    }
  }

  // MARK: The issue

  @ViewBuilder
  private func issue(_ edition: Edition) -> some View {
    let skipped = Set(edition.skipped)
    let shown = edition.entries.filter { !skipped.contains($0.id) && items[$0.id].map { $0.state != "DELETED" } ?? false }
    let lead = shown.first { $0.slot == "lead" }
    let missed = shown.filter { $0.slot == "missed" }
    let shelf = shown.filter { $0.slot == "shelf" }

    VStack(alignment: .leading, spacing: 30) {
      masthead(edition, shown: shown)

      if let lead, let item = items[lead.id] {
        leadStory(item, why: lead.why)
      } else if loadedFor == nil {
        ProgressView().frame(maxWidth: .infinity)
      }

      if !missed.isEmpty {
        stories("Also missed this week", missed)
      }
      if !shelf.isEmpty {
        stories("From the back of the shelf", shelf)
      }
      if !edition.quotes.isEmpty {
        quotes(edition.quotes)
      }
      if !newcomers.isEmpty {
        VStack(alignment: .leading, spacing: 12) {
          SectionHeading(title: "Someone new")
          ForEach(newcomers) { suggestion in
            SuggestionCard(suggestion: suggestion, done: actedOn[suggestion.id], act: actOnSuggestion)
          }
        }
      }
      if !verdicts.isEmpty {
        VStack(alignment: .leading, spacing: 12) {
          SectionHeading(title: verdicts.count > 1 ? "Your trials" : "Your trial")
          ForEach(verdicts) { suggestion in
            SuggestionCard(suggestion: suggestion, done: actedOn[suggestion.id], act: actOnSuggestion)
          }
        }
      }
      weekInReading(edition.week)
      putAway(edition)
    }
  }

  private func masthead(_ edition: Edition, shown: [Edition.Entry]) -> some View {
    let minutes = edition.entries.reduce(0) { $0 + (items[$1.id]?.readingMinutes ?? 4) }
    let day = EditionSchedule.at(edition.date, hour: 12)
    return VStack(alignment: .leading, spacing: 8) {
      Rectangle().fill(Color.stashInk).frame(height: 2)
      (Text("The Edition") + Text(".").foregroundStyle(Color.stashAccent))
        .font(.system(size: 44, weight: .bold))
        .tracking(-2)
        .foregroundStyle(Color.stashInk)
      HStack(spacing: 10) {
        Kicker("No. \(edition.number)")
        Kicker(day.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        Kicker("\(edition.entries.count) stories · \(minutes) min")
      }
      Text("Chosen from \(edition.considered) stories across \(edition.sources) sources you didn't get to this week.")
        .font(.callout)
        .foregroundStyle(Color.stashMuted)
      Rectangle().fill(Color.stashBorder).frame(height: 1)
    }
  }

  private func leadStory(_ item: LibraryItem, why: String?) -> some View {
    NavigationLink(value: item) {
      VStack(alignment: .leading, spacing: 10) {
        if item.imageURL != nil {
          CoverImage(url: item.imageURL)
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        Kicker("The week's best you missed", accent: true)
        Text(item.title)
          .font(.system(size: 30, weight: .semibold, design: .serif))
          .foregroundStyle(Color.stashInk)
          .multilineTextAlignment(.leading)
        if let description = item.description, !description.isEmpty {
          Text(description)
            .font(.system(.body, design: .serif))
            .foregroundStyle(Color.stashMuted)
            .lineLimit(4)
        }
        storyMeta(item, why: why)
      }
      .opacity(isDone(item) ? 0.5 : 1)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .contextMenu { storyMenu(item) }
  }

  private func stories(_ title: String, _ entries: [Edition.Entry]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      SectionHeading(title: title).padding(.bottom, 6)
      ForEach(entries, id: \.id) { entry in
        if let item = items[entry.id] {
          Divider()
          NavigationLink(value: item) {
            HStack(alignment: .top, spacing: 14) {
              VStack(alignment: .leading, spacing: 6) {
                Text(item.title)
                  .font(.stashTitle(.title3))
                  .foregroundStyle(Color.stashInk)
                  .lineLimit(3)
                  .multilineTextAlignment(.leading)
                if let description = item.description, !description.isEmpty {
                  Text(description)
                    .font(.subheadline)
                    .foregroundStyle(Color.stashMuted)
                    .lineLimit(2)
                }
                storyMeta(item, why: entry.why)
              }
              Spacer(minLength: 0)
              if item.imageURL != nil {
                CoverImage(url: item.imageURL)
                  .frame(width: 96, height: 72)
                  .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
              }
            }
            .padding(.vertical, 12)
            .opacity(isDone(item) ? 0.5 : 1)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .contextMenu { storyMenu(item) }
        }
      }
    }
  }

  private func storyMeta(_ item: LibraryItem, why: String?) -> some View {
    HStack(spacing: 8) {
      if isDone(item) {
        Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.stashAccent)
      }
      SiteIcon(url: item.iconURL)
      Text(sourceName(item)).lineLimit(1)
      if let minutes = item.readingMinutes { Text("· \(minutes) min") }
      if let why { Text("· \(why)").foregroundStyle(Color.stashAccentText).lineLimit(1) }
    }
    .font(.stashDetail)
    .foregroundStyle(Color.stashMuted)
  }

  @ViewBuilder
  private func storyMenu(_ item: LibraryItem) -> some View {
    if item.isFeedItem {
      Button { perform(.save, item) } label: { Label("Save for later", systemImage: "bookmark") }
    }
    Button { skip(item) } label: { Label("Skip", systemImage: "forward") }
    if let url = item.originalURL {
      Divider()
      Link(destination: url) { Label("Open original", systemImage: "safari") }
      ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
    }
  }

  private func quotes(_ quotes: [Edition.Quote]) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      SectionHeading(title: "Your highlights")
      ForEach(quotes, id: \.id) { quote in
        Button { open(itemID: quote.itemId) } label: {
          VStack(alignment: .leading, spacing: 8) {
            Text("“\(quote.quote)”")
              .font(.system(.title3, design: .serif).italic())
              .foregroundStyle(Color.stashInk)
              .multilineTextAlignment(.leading)
            Text("\(quote.title) · \(quote.source)")
              .font(.stashDetail)
              .foregroundStyle(Color.stashMuted)
              .lineLimit(1)
          }
          .padding(.leading, 14)
          .overlay(alignment: .leading) { Rectangle().fill(Color.stashAccent).frame(width: 2) }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func weekInReading(_ week: Edition.WeekStats) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeading(title: "Your week in reading")
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .topLeading)], alignment: .leading, spacing: 14) {
        stat("Finished", "\(week.finished)")
        stat("Time reading", week.minutes >= 60 ? "\(Int(week.minutes) / 60)h \(Int(week.minutes) % 60)m" : "\(Int(week.minutes)) min")
        stat("Highlights", "\(week.highlights)")
        if let top = week.topSource { stat("Most read", top) }
        if let longest = week.longest { stat("Longest read", "\(longest.title) · \(Int(longest.minutes)) min") }
      }
    }
  }

  private func stat(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Kicker(label)
      Text(value)
        .font(.system(.title3, design: .serif))
        .foregroundStyle(Color.stashInk)
        .lineLimit(2)
    }
  }

  private func putAway(_ edition: Edition) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Rectangle().fill(Color.stashBorder).frame(height: 1)
      HStack {
        Text("That's this week's issue. The next one arrives on \(EditionSchedule.dayNames[model.state?.day ?? 6]).")
          .font(.callout)
          .foregroundStyle(Color.stashMuted)
        Spacer(minLength: 12)
        Button("Mark as read") { markRead(edition) }
          .buttonStyle(.borderedProminent)
      }
    }
    .padding(.bottom, 24)
  }

  // MARK: Loading

  private func load(force: Bool) async {
    if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
    if force { await model.refresh() }
    if model.current == nil { await model.make(subscriptions: subscriptions) }
    guard let edition = model.current else { return }
    model.markOpened(edition.date)

    if force || loadedFor != edition.date {
      let ids = edition.entries.map(\.id)
      if !ids.isEmpty, let page = try? await Library.search("includes:\(ids.joined(separator: ","))", first: ids.count) {
        items = Dictionary(page.items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
      }
      loadedFor = edition.date
    }
    if force || (newcomers.isEmpty && verdicts.isEmpty) {
      let suggestions = (try? await Discover.suggestions())?.suggestions ?? []
      // The issue keeps the newcomers it first showed, so trying one doesn't swap it for another.
      if newcomers.isEmpty { newcomers = Discover.someoneNew(suggestions) }
      verdicts = Discover.verdictsDue(suggestions)
    }
  }

  // MARK: Doing things

  private func sourceName(_ item: LibraryItem) -> String {
    if let value = item.subscription, let match = subscriptions.first(where: { $0.url == value || $0.name == value }) {
      return match.name
    }
    return item.source
  }

  /// Seen isn't done: only reading, skipping, saving or archiving counts.
  private func isDone(_ item: LibraryItem) -> Bool {
    item.progress >= 0.02 || item.isArchived || (item.subscription != nil && !item.isFeedItem)
  }

  private func open(itemID: String) {
    if let item = items[itemID] {
      path.append(item)
      return
    }
    Task {
      if let item = try? await Library.search("includes:\(itemID)", first: 1).items.first {
        items[item.id] = item
        path.append(item)
      }
    }
  }

  private func skip(_ item: LibraryItem) {
    guard let date = model.current?.date else { return }
    withAnimation { model.skip([item.id], in: date) }
    if item.isFeedItem && item.seenAt == nil { Task { try? await Library.markSeen([item.id]) } }
    toaster.show("Skipped")
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    if path.count > 0 { path.removeLast() }
    Task {
      do {
        try await action.run(on: item)
        toaster.show(action == .save ? "Saved for later" : action.doneMessage)
        if let updated = try? await Library.search("includes:\(item.id)", first: 1).items.first {
          items[item.id] = updated
        }
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }

  private func markRead(_ edition: Edition) {
    Task {
      do {
        try await model.markRead(edition.date)
        onPutAway()
      } catch {
        toaster.show("Couldn't mark the issue read")
      }
    }
  }

  private func actOnSuggestion(_ action: SuggestionCard.Action, _ suggestion: FeedSuggestion) {
    Task {
      do {
        switch action {
        case .follow:
          try await Discover.follow(suggestion)
          actedOn[suggestion.id] = suggestion.status == "TRIAL" ? "Kept" : "Following"
        case .trial:
          try await Discover.tryForAWeek(suggestion)
          actedOn[suggestion.id] = "Trying for a week"
        case .drop:
          try await Discover.drop(suggestion)
          actedOn[suggestion.id] = "Dropped"
        case .dismiss:
          try await Discover.dismiss(suggestion)
          withAnimation { newcomers.removeAll { $0.id == suggestion.id } }
        }
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }
}
