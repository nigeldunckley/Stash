import SwiftUI

/// Discover: feeds Stash suggests from what you read, the ones you're trying, and channels.
struct DiscoverView: View {
  @State private var result: Discover.Suggestions?
  @State private var error: String?
  /// Suggestions you've acted on stay where they are, ticked, until you leave.
  @State private var acted: [String: String] = [:]
  @State private var toaster = Toaster()
  @State private var turningOn = false

  private var suggestions: [FeedSuggestion] { result?.suggestions ?? [] }

  private var fresh: [FeedSuggestion] {
    suggestions.filter { $0.status == "NEW" || acted[$0.id] != nil }.sorted { $0.score > $1.score }
  }

  private var own: [FeedSuggestion] { fresh.filter { !$0.isChannel && !$0.isStarter } }
  private var channels: [FeedSuggestion] { fresh.filter(\.isChannel) }
  private var starters: [FeedSuggestion] { fresh.filter(\.isStarter) }
  private var trials: [FeedSuggestion] { suggestions.filter { $0.status == "TRIAL" && acted[$0.id] == nil } }
  private var following: [FeedSuggestion] { suggestions.filter { $0.status == "FOLLOWING" && acted[$0.id] == nil } }

  var body: some View {
    NavigationStack {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 28) {
          if let result, !result.enabled {
            ContentUnavailableView {
              Label("Suggestions are off", systemImage: "sparkles")
            } description: {
              Text("Turn them on and Stash will look for feeds like the ones you read, each night.")
            } actions: {
              Button("Turn on suggestions") { turnOn() }
                .buttonStyle(.borderedProminent)
                .disabled(turningOn)
            }
          } else if result == nil {
            if let error {
              ContentUnavailableView {
                Label("Couldn't load", systemImage: "wifi.exclamationmark")
              } description: {
                Text(error)
              } actions: {
                Button("Try again") { Task { await load() } }
              }
            } else {
              ProgressView().frame(maxWidth: .infinity).padding(.top, 60)
            }
          } else {
            if !trials.isEmpty {
              section("Trying for a week", trials)
            }
            if own.isEmpty && channels.isEmpty && starters.isEmpty && trials.isEmpty {
              ContentUnavailableView(
                "Nothing new to suggest", systemImage: "sparkles",
                description: Text("Stash looks again each night, from what you read and save."))
            }
            if !own.isEmpty { section("From what you read", own) }
            if !channels.isEmpty { section("Channels for Watch", channels) }
            if !starters.isEmpty { section("Starting points", starters) }
            if !following.isEmpty { section("Followed from here", following) }
            if let built = result?.builtAt {
              Text("Updated \(built.formatted(.relative(presentation: .named)))")
                .font(.stashDetail)
                .foregroundStyle(Color.stashMuted)
            }
          }
        }
        .padding(16)
        .frame(maxWidth: 1100)
        .frame(maxWidth: .infinity)
      }
      .background(Color.stashBackground)
      .navigationTitle("Discover")
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
        AsyncImage(url: suggestion.iconURL ?? URL(string: "https://\(suggestion.host)/favicon.ico")) { image in
          image.resizable().scaledToFit()
        } placeholder: {
          RoundedRectangle(cornerRadius: 6).fill(Color.stashSurface)
        }
        .frame(width: 28, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: 6))

        VStack(alignment: .leading, spacing: 2) {
          Text(suggestion.title)
            .font(.headline)
            .foregroundStyle(Color.stashInk)
            .lineLimit(2)
          Text([suggestion.host, suggestion.cadence].compactMap { $0 }.joined(separator: " · "))
            .font(.stashDetail)
            .foregroundStyle(Color.stashMuted)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        if done == nil && suggestion.status == "NEW" {
          Button { act(.dismiss, suggestion) } label: {
            Image(systemName: "xmark").font(.caption.weight(.semibold))
          }
          .buttonStyle(.borderless)
          .foregroundStyle(Color.stashMuted)
          .help("Not for me")
        }
      }

      Text(suggestion.status == "TRIAL" ? trialLine : suggestion.why)
        .font(.caption)
        .foregroundStyle(Color.stashAccentText)

      if let description = suggestion.description, !description.isEmpty {
        Text(description)
          .font(.subheadline)
          .foregroundStyle(Color.stashMuted)
          .lineLimit(2)
      }

      ForEach(suggestion.latest.prefix(2), id: \.url) { post in
        Button {
          if let url = URL(string: post.url) { openURL(url) }
        } label: {
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(post.title)
              .font(.system(.subheadline, design: .serif))
              .foregroundStyle(Color.stashInk)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if let date = post.publishedAt {
              Text(shortAge(date)).font(.stashDetail).foregroundStyle(Color.stashMuted)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }

      HStack(spacing: 8) {
        if let done {
          Label(done, systemImage: "checkmark")
            .font(.callout.weight(.medium))
            .foregroundStyle(Color.stashMuted)
        } else if suggestion.status == "TRIAL" {
          Button("Keep it") { act(.follow, suggestion) }.buttonStyle(.borderedProminent)
          Button("Drop it") { act(.drop, suggestion) }.buttonStyle(.bordered)
        } else if suggestion.status == "FOLLOWING" {
          Label("Following", systemImage: "checkmark")
            .font(.callout)
            .foregroundStyle(Color.stashMuted)
        } else {
          Button("Follow") { act(.follow, suggestion) }.buttonStyle(.borderedProminent)
          if !suggestion.isChannel {
            Button("Try for a week") { act(.trial, suggestion) }.buttonStyle(.bordered)
          }
        }
        Spacer(minLength: 0)
        Text("\(suggestion.matchPercent)% match")
          .font(.stashDetail)
          .foregroundStyle(Color.stashMuted)
      }
      .controlSize(.small)
      .padding(.top, 2)
    }
    .padding(14)
    .background(Color.stashBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.stashBorder, lineWidth: 1))
    .opacity(done == nil ? 1 : 0.7)
  }

  private var trialLine: String {
    guard let days = suggestion.trialDaysLeft else { return "On trial" }
    return days == 0 ? "Trial over · keep it?" : "On trial · \(days) day\(days == 1 ? "" : "s") left"
  }
}
