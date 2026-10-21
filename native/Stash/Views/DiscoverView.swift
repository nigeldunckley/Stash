import SwiftUI

/// Discover: feeds Stash suggests from what you read, the ones you're trying, and channels.
struct DiscoverView: View {
  @State private var result: Discover.Suggestions?
  @State private var error: String?
  /// Suggestions you've acted on stay where they are, ticked, until you leave.
  @State private var acted: [String: String] = [:]
  @State private var toaster = Toaster()
  @State private var turningOn = false
  @State private var showingTrials = false
  @State private var showingFollowed = false

  private var suggestions: [FeedSuggestion] { result?.suggestions ?? [] }

  private var fresh: [FeedSuggestion] {
    suggestions.filter { $0.status == "NEW" || acted[$0.id] != nil }.sorted { $0.score > $1.score }
  }

  private var own: [FeedSuggestion] { fresh.filter { !$0.isChannel && !$0.isStarter } }
  private var channels: [FeedSuggestion] { fresh.filter(\.isChannel) }
  private var starters: [FeedSuggestion] { fresh.filter(\.isStarter) }
  private var trials: [FeedSuggestion] { suggestions.filter { $0.status == "TRIAL" && acted[$0.id] == nil } }
  private var trialsDue: [FeedSuggestion] { trials.filter { ($0.trialDaysLeft ?? 1) == 0 } }
  private var activeTrials: [FeedSuggestion] { trials.filter { ($0.trialDaysLeft ?? 1) > 0 } }
  private var following: [FeedSuggestion] { suggestions.filter { $0.status == "FOLLOWING" && acted[$0.id] == nil } }

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 28) {
          if let result, !result.enabled {
            EmptyBox(title: "Suggestions are off", message: "Turn them on and Stash will look for feeds like the ones you read, each night.", systemImage: "sparkles", boxed: false) {
              Button("Turn on suggestions") { turnOn() }
                .buttonStyle(.textProminent)
                .disabled(turningOn)
            }
          } else if result == nil {
            if let error {
              EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark", boxed: false) {
                Button("Try again") { Task { await load() } }
              }
            } else {
              SkeletonCards()
            }
          } else {
            if own.isEmpty && channels.isEmpty && starters.isEmpty && trials.isEmpty {
              EmptyBox(title: "Nothing new to suggest", message: "Stash looks again each night, from what you read and save.", systemImage: "sparkles", boxed: false)
            }
            if !own.isEmpty { section("From what you read", own) }
            if !channels.isEmpty { section("Channels for Watch", channels) }
            if !starters.isEmpty { section("Starting points", starters) }
            if !trialsDue.isEmpty {
              DisclosureGroup("Trials to review (\(trialsDue.count))", isExpanded: $showingTrials) {
                VStack(spacing: 0) {
                  ForEach(trialsDue) { suggestion in
                    HStack(spacing: 12) {
                      VStack(alignment: .leading, spacing: 4) {
                        Text(suggestion.title).font(.stSection)
                        Text(suggestion.host).font(.stSmall).foregroundStyle(Color.stMuted)
                      }
                      Spacer()
                      Button("Keep") { act(.follow, suggestion) }.buttonStyle(.textProminent)
                      Button("Stop following") { act(.drop, suggestion) }.buttonStyle(.text)
                    }
                    .padding(.vertical, 12)
                    Divider()
                  }
                }
              }
              .font(.stSection).tint(Color.stInk)
            }
            if !activeTrials.isEmpty { section("Trying for a week", activeTrials) }
            if !following.isEmpty {
              DisclosureGroup("Followed from here (\(following.count))", isExpanded: $showingFollowed) {
                section("Following", following)
              }
              .font(.stSection).tint(Color.stInk)
            }
            if let built = result?.builtAt {
              Text("Updated \(built.formatted(.relative(presentation: .named)))")
                .font(.stDetail)
                .foregroundStyle(Color.stMuted)
            }
          }
        }
        .pageWidth()
        .padding(.bottom, 40)
      }
      .background(Color.stPage)
      .stashPage("Discover", detail: fresh.isEmpty ? nil : "\(fresh.filter { $0.status == "NEW" }.count) new", accentDetail: true,
        folio: FolioContent(items: [FolioContent.today, "UPDATED EACH NIGHT AT 03:00"]))
      .refreshable { await load() }
      .task { if result == nil { await load() } }
      .toasts(toaster)
    }
  }

  private func section(_ title: String, _ list: [FeedSuggestion]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeading(title: title, detail: "\(list.count)")
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 300), spacing: 14, alignment: .top)], spacing: 14) {
        ForEach(list) { suggestion in
          SuggestionCard(suggestion: suggestion, done: acted[suggestion.id], act: act)
        }
      }
    }
  }

  private func load() async {
    do {
      result = try await Discover.suggestions()
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func turnOn() {
    turningOn = true
    Task {
      defer { turningOn = false }
      do {
        try await Discover.setEnabled(true)
        toaster.show("Stash is looking for feeds for you")
        await load()
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }

  private func act(_ action: SuggestionCard.Action, _ suggestion: FeedSuggestion) {
    Task {
      do {
        switch action {
        case .follow:
          try await Discover.follow(suggestion)
          acted[suggestion.id] = suggestion.status == "TRIAL" ? "Kept" : "Following"
          toaster.show(suggestion.status == "TRIAL" ? "Keeping \(suggestion.title)" : "Following \(suggestion.title)")
        case .trial:
          try await Discover.tryForAWeek(suggestion)
          acted[suggestion.id] = "Trying for a week"
          toaster.show("Trying \(suggestion.title) for a week")
        case .drop:
          try await Discover.drop(suggestion)
          withAnimation { result?.suggestions.removeAll { $0.id == suggestion.id } }
          toaster.show("Stopped following \(suggestion.title)")
        case .dismiss:
          withAnimation { result?.suggestions.removeAll { $0.id == suggestion.id } }
          try await Discover.dismiss(suggestion)
          toaster.show("You won't see \(suggestion.title) again")
        }
      } catch {
        toaster.show(error.localizedDescription)
        await load()
      }
    }
  }
}

/// One suggested feed: who it is, why it's here, its latest posts, and what you can do with it.
struct SuggestionCard: View {
  enum Action { case follow, trial, drop, dismiss }

  let suggestion: FeedSuggestion
  /// Set once you've acted on it, e.g. "Following".
  var done: String?
  let act: (Action, FeedSuggestion) -> Void

  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 10) {
        FadeImage(url: suggestion.iconURL ?? URL(string: "https://\(suggestion.host)/favicon.ico"), contentMode: .fit)
        .frame(width: 28, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: 6))

        VStack(alignment: .leading, spacing: 2) {
          Text(suggestion.title)
            .font(.stSection)
            .foregroundStyle(Color.stInk)
            .lineLimit(2)
          Text([suggestion.host, suggestion.cadence].compactMap { $0 }.joined(separator: " · "))
            .font(.stDetail)
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        if done == nil && suggestion.status == "NEW" {
          Button { act(.dismiss, suggestion) } label: {
            Image(systemName: "xmark").font(.ui(12, .semibold))
          }
          .buttonStyle(.borderless)
          .foregroundStyle(Color.stMuted)
          .frame(minWidth: 44, minHeight: 44)
          .accessibilityLabel("Dismiss \(suggestion.title)")
          .help("Not for me")
        }
      }

      Text(suggestion.status == "TRIAL" ? trialLine : suggestion.why)
        .font(.stSmall)
        .foregroundStyle(Color.stAccentText)

      if let description = suggestion.description, !description.isEmpty {
        Text(description)
          .font(.ui(13, relativeTo: .subheadline))
          .foregroundStyle(Color.stMuted)
          .lineLimit(2)
      }

      ForEach(suggestion.latest.prefix(1), id: \.url) { post in
        Button {
          if let url = URL(string: post.url) { openURL(url) }
        } label: {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(post.title)
              .font(.reading(15, .regular, relativeTo: .subheadline))
              .foregroundStyle(Color.stInk)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if let date = post.publishedAt {
              Text(shortAge(date)).font(.stDetail).foregroundStyle(Color.stMuted)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }

      HStack(spacing: 8) {
        if let done {
          Label(done, systemImage: "checkmark")
            .font(.ui(13, .medium))
            .foregroundStyle(Color.stMuted)
        } else if suggestion.status == "TRIAL" {
          Button("Keep it") { act(.follow, suggestion) }.buttonStyle(.textProminent)
          Button("Drop it") { act(.drop, suggestion) }.buttonStyle(.text)
        } else if suggestion.status == "FOLLOWING" {
          Label("Following", systemImage: "checkmark")
            .font(.ui(13))
            .foregroundStyle(Color.stMuted)
        } else {
          Button("Follow") { act(.follow, suggestion) }.buttonStyle(.textProminent)
          if !suggestion.isChannel {
            Button("Try for a week") { act(.trial, suggestion) }.buttonStyle(.text)
          }
        }
        Spacer(minLength: 0)
      }
      .controlSize(.small)
      .padding(.top, 2)
    }
    .padding(14)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .opacity(done == nil ? 1 : 0.7)
  }

  private var trialLine: String {
    guard let days = suggestion.trialDaysLeft else { return "On trial" }
    return days == 0 ? "Trial over · keep it?" : "On trial · \(days) day\(days == 1 ? "" : "s") left"
  }
}
