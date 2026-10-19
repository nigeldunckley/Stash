import SwiftUI

/// Latest's length filter: useful when you have ten minutes.
enum LengthFilter: String, CaseIterable, Identifiable {
  case any, short, medium, long

  var id: Self { self }

  var title: String {
    switch self {
    case .any: return "Any length"
    case .short: return "< 10 min"
    case .medium: return "10–30"
    case .long: return "Longer"
    }
  }

  /// Videos with no known length always show.
  func matches(_ item: LibraryItem) -> Bool {
    guard self != .any, let seconds = Watch.duration(item) else { return true }
    switch self {
    case .any: return true
    case .short: return seconds < 600
    case .medium: return seconds >= 600 && seconds <= 1800
    case .long: return seconds > 1800
    }
  }
}

/// "11 min left" for a part-watched video.
@MainActor func videoTimeLeft(_ item: LibraryItem) -> String? {
  guard let length = Watch.duration(item) else { return nil }
  let at = Double(Watch.positions[item.id] ?? item.readingProgressAnchorIndex ?? 0)
  let minutes = Int(((length - at) / 60).rounded(.up))
  return minutes > 0 ? "\(minutes) min left" : nil
}

/// A caps label with a line after it, and an optional link on the right.
struct WatchBand<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  init(_ title: String, @ViewBuilder trailing: @escaping () -> Trailing) {
    self.title = title
    self.trailing = trailing
  }

  var body: some View {
    HStack(spacing: 10) {
      Kicker(title)
      Rectangle().fill(Color.stLine).frame(height: 1)
      trailing()
    }
  }
}

extension WatchBand where Trailing == EmptyView {
  init(_ title: String) {
    self.init(title) { EmptyView() }
  }
}

/// Your channels as a row of round icons; an orange ring means something new.
struct ChannelStrip: View {
  let channels: [Subscription]
  let unseen: [String: Int]
  let onPick: (Subscription) -> Void
  let onAll: () -> Void

  /// Channels with something new first, then the rest by name.
  private var ordered: [Subscription] {
    channels.sorted { a, b in
      let (na, nb) = (count(a), count(b))
      if (na > 0) != (nb > 0) { return na > 0 }
      return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
  }

  private func count(_ channel: Subscription) -> Int {
    channel.url.flatMap { unseen[$0] } ?? 0
  }

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 18) {
        ForEach(ordered.prefix(16)) { channel in
          Button { onPick(channel) } label: {
            item(channel.name, isNew: count(channel) > 0) {
              FadeImage(url: channel.icon.flatMap(URL.init(string:)))
            }
          }
          .buttonStyle(.plain)
          .help(count(channel) > 0 ? "\(channel.name): \(count(channel)) new" : channel.name)
        }
        Button(action: onAll) {
          item("All \(channels.count)", isNew: false) {
            Image(systemName: "square.grid.2x2")
              .font(.ui(18))
              .foregroundStyle(Color.stMuted)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(Color.stSunken)
          }
        }
        .buttonStyle(.plain)
      }
      .padding(.vertical, 4)
      .padding(.horizontal, 4)
    }
  }

  private func item<Icon: View>(_ name: String, isNew: Bool, @ViewBuilder icon: () -> Icon) -> some View {
    VStack(spacing: 6) {
      icon()
        .frame(width: 48, height: 48)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.stLine, lineWidth: 1))
        .padding(3)
        .overlay {
          if isNew { Circle().strokeBorder(Color.stAccent, lineWidth: 2) }
        }
      Text(name)
        .font(.ui(11.5, relativeTo: .caption))
        .foregroundStyle(Color.stInk2)
        .lineLimit(1)
        .frame(width: 64)
    }
    .contentShape(Rectangle())
  }
}

/// Every channel you follow, grouped by collection, with the add box to follow more.
struct AllChannelsView: View {
  let onPick: (Subscription) -> Void

  @State private var channels: [Subscription] = []
  @State private var collections: [WatchCollection] = []
  @State private var unseen: [String: Int] = [:]
  @State private var loaded = false

  private var groups: [(name: String, channels: [Subscription])] {
    var result = collections.map { collection in
      (name: collection.name, channels: channels.filter { $0.collectionId == collection.id })
    }
    let filed = Set(collections.map(\.id))
    result.append((name: "Not in a collection", channels: channels.filter { !filed.contains($0.collectionId ?? "") }))
    return result.filter { !$0.channels.isEmpty }
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 26) {
        WatchAddBox { Task { await load() } }
        if !loaded {
          SkeletonCards(count: 8, minWidth: 220, height: 68)
        } else if channels.isEmpty {
          EmptyBox(title: "No channels yet", message: "Paste a channel link or search for one above to follow it.", systemImage: "play.rectangle", boxed: false)
        }
        ForEach(groups, id: \.name) { group in
          VStack(alignment: .leading, spacing: 12) {
            WatchBand(group.name)
            grid {
              ForEach(group.channels) { channel in
                Button { onPick(channel) } label: { channelCard(channel) }
                  .buttonStyle(.plain)
              }
            }
          }
        }
      }
      .pageWidth()
      .padding(.bottom, 40)
    }
    .background(Color.stPage)
    .stashPage("All channels", detail: loaded ? "\(channels.count) channels" : nil)
    .task { await load() }
  }

  private func grid<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12, alignment: .top)], spacing: 12) {
      content()
    }
  }

  private func channelCard(_ channel: Subscription) -> some View {
    let count = channel.url.flatMap { unseen[$0] } ?? 0
    return HStack(spacing: 12) {
      FadeImage(url: channel.icon.flatMap(URL.init(string:)))
        .frame(width: 40, height: 40)
        .clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(channel.name)
          .font(.ui(14, .medium))
          .foregroundStyle(Color.stInk)
          .lineLimit(1)
        if count > 0 {
          Text("\(count) new").font(.mono(11)).foregroundStyle(Color.stAccentText)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .contentShape(Rectangle())
  }

  private func load() async {
    async let subscriptions = Library.subscriptions()
    async let labels = Watch.collections()
    async let counts = Watch.unseenByChannel()
    channels = ((try? await subscriptions) ?? []).filter(\.isYouTube)
    collections = (try? await labels) ?? []
    unseen = await counts
    loaded = true
  }
}
