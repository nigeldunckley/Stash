import SwiftUI

/// Watch's add box, as on the web: paste a video link to save it, paste a channel link or
/// @handle to follow it, or type a name to search YouTube for channels.
struct WatchAddBox: View {
  /// Called after a video is saved or a channel followed, so the page can refresh.
  var onAdded: () -> Void = {}

  @State private var text = ""
  @State private var state: LookupState = .idle
  @State private var busy: String?
  @State private var done: Set<String> = []
  @State private var followedFeeds: Set<String> = []

  private enum LookupState {
    case idle
    case loading
    case video(url: String, channel: ChannelMatch?)
    case channels([ChannelMatch])
    case none(String)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      CaptureField(text: $text, prompt: "Paste a video or channel link, or search YouTube")
      results
    }
    .task(id: text) { await lookUp() }
    .task { await loadFollowed() }
  }

  // MARK: Results

  @ViewBuilder
  private var results: some View {
    switch state {
    case .idle:
      EmptyView()
    case .loading:
      SkeletonRows(count: 1)
    case .video(let url, let channel):
      VStack(spacing: 8) {
        resultRow(icon: nil, systemImage: "play.rectangle", title: "Save this video", detail: "It goes in Watch › Saved") {
          action("Save", id: url, done: "Saved") { save(url) }
        }
        if let channel { channelRow(channel) }
      }
    case .channels(let channels):
      VStack(spacing: 8) {
        ForEach(channels.prefix(6)) { channelRow($0) }
      }
    case .none(let message):
      Text(message)
        .font(.ui(13))
        .foregroundStyle(Color.stMuted)
        .padding(.horizontal, 2)
    }
  }

  private func channelRow(_ channel: ChannelMatch) -> some View {
    resultRow(
      icon: channel.avatar.flatMap(URL.init(string:)),
      systemImage: nil,
      title: channel.title,
      detail: [channel.handle, channel.subscribers].compactMap { $0 }.joined(separator: " · ")
    ) {
      if followedFeeds.contains(channel.feedUrl) && !done.contains(channel.feedUrl) {
        Label("Following", systemImage: "checkmark")
          .font(.ui(12, .medium))
          .foregroundStyle(Color.stMuted)
      } else {
        action("Follow", id: channel.feedUrl, done: "Following") { follow(channel) }
      }
    }
  }

  private func resultRow<Trailing: View>(
    icon: URL?, systemImage: String?, title: String, detail: String,
    @ViewBuilder trailing: () -> Trailing
  ) -> some View {
    HStack(spacing: 12) {
      Group {
        if let systemImage {
          Image(systemName: systemImage)
            .font(.ui(16))
            .foregroundStyle(Color.stMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.stSunken)
        } else {
          FadeImage(url: icon)
        }
      }
      .frame(width: 36, height: 36)
      .clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
          .font(.ui(14, .medium))
          .foregroundStyle(Color.stInk)
          .lineLimit(1)
        if !detail.isEmpty {
          Text(detail)
            .font(.mono(11))
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
      }
      Spacer(minLength: 8)
      trailing()
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }

  @ViewBuilder
  private func action(_ title: String, id: String, done doneTitle: String, run: @escaping () -> Void) -> some View {
    if done.contains(id) {
      Label(doneTitle, systemImage: "checkmark")
        .font(.ui(12, .medium))
        .foregroundStyle(Color.stMuted)
    } else {
      Button(title, action: run)
        .buttonStyle(.textProminent)
        .disabled(busy != nil)
    }
  }

  // MARK: Looking up

  /// Runs a moment after typing stops; links straight away.
  private func lookUp() async {
    let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard value.count >= 2 else { state = .idle; return }
    let link = Self.isLink(value)
    if !link {
      try? await Task.sleep(for: .milliseconds(350))
      if Task.isCancelled { return }
    }
    state = .loading
    do {
      if link, Self.isVideoLink(value) {
        let full = Self.url(value)?.absoluteString ?? value
        state = .video(url: full, channel: nil)
        let channel = try? await Watch.lookupChannel(full)
        if Task.isCancelled { return }
        state = .video(url: full, channel: channel)
      } else if Self.looksLikeYouTube(value) {
        let channel = try await Watch.lookupChannel(value)
        if Task.isCancelled { return }
        state = channel.map { .channels([$0]) } ?? .none("No YouTube channel at that address.")
      } else if link {
        state = .none("Paste a YouTube video or channel link.")
      } else {
        let channels = try await Watch.searchChannels(value)
        if Task.isCancelled { return }
        state = channels.isEmpty ? .none("No channels called “\(value)”.") : .channels(channels)
      }
    } catch {
      if !Task.isCancelled { state = .none("Couldn't reach YouTube. Try again in a moment.") }
    }
  }

  private func loadFollowed() async {
    let subscriptions = (try? await Library.subscriptions()) ?? []
    followedFeeds = Set(subscriptions.compactMap(\.url))
  }

  // MARK: Doing things

  private func save(_ url: String) {
    busy = url
    Task {
      do {
        try await Library.save(url: url)
        Moments.shared.saved(title: url, link: url)
        done.insert(url)
        onAdded()
      } catch {
        state = .none(error.localizedDescription)
      }
      busy = nil
    }
  }

  private func follow(_ channel: ChannelMatch) {
    busy = channel.feedUrl
    Task {
      do {
        try await Watch.follow(channel)
        done.insert(channel.feedUrl)
        followedFeeds.insert(channel.feedUrl)
        onAdded()
      } catch {
        state = .none("Couldn't follow \(channel.title). Try again in a moment.")
      }
      busy = nil
    }
  }

  // MARK: Telling links apart, as the web's lib/youtube.ts does

  private static func url(_ value: String) -> URL? {
    URL(string: value.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil ? value : "https://\(value)")
  }

  static func isLink(_ value: String) -> Bool {
    guard !value.contains(" "), value.contains("."), let host = url(value)?.host() else { return false }
    return host.contains(".")
  }

  static func looksLikeYouTube(_ value: String) -> Bool {
    if value.range(of: #"^@[\w.-]{3,}$"#, options: .regularExpression) != nil { return true }
    guard let host = url(value)?.host()?.lowercased() else { return false }
    return host == "youtube.com" || host.hasSuffix(".youtube.com") || host == "youtu.be"
  }

  static func isVideoLink(_ value: String) -> Bool {
    guard let link = url(value), let host = link.host()?.lowercased() else { return false }
    if host == "youtu.be" { return link.path().count > 1 }
    guard host == "youtube.com" || host.hasSuffix(".youtube.com") else { return false }
    if URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "v" }) == true {
      return true
    }
    let parts = link.path().split(separator: "/")
    return parts.count >= 2 && ["shorts", "embed", "live", "v"].contains(String(parts[0]))
  }
}
