import SwiftUI

/// Watch: Latest (what you were watching, your channels, and new videos by day), one channel
/// or collection, or the videos you've saved.
struct WatchView: View {
  enum Kind: Hashable {
    case channels
    case collection(WatchCollection)
    case saved
  }

  let kind: Kind

  @State private var list = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var collections: [WatchCollection] = []
  @State private var savedOrder: [String] = []
  @State private var channel: Subscription?
  @State private var collection: WatchCollection?
  @State private var toaster = Toaster()
  @AppStorage("watchShowAll") private var showAll = false
  @AppStorage("watchLength") private var length = LengthFilter.any
  @State private var continuing: [LibraryItem] = []
  @State private var unseenByChannel: [String: Int] = [:]
  @State private var path = NavigationPath()

  private enum Route: Hashable { case allChannels }

  /// Latest's front page, before you narrow it to a channel or collection.
  private var isFront: Bool {
    if case .channels = kind { return channel == nil && collection == nil }
    return false
  }

  private var activeCollection: WatchCollection? {
    if case .collection(let fixed) = kind { return fixed }
    return collection
  }

  private var query: String {
    switch kind {
    case .saved:
      return "in:inbox use:folders type:video sort:saved-asc"
    case .channels, .collection:
      return [
        "in:following use:folders type:video",
        channel.map { "subscription:\(searchValue($0.searchKey))" } ?? "",
        activeCollection.map { "collection:\($0.id)" } ?? "",
        showAll ? "" : "-is:seen",
        "sort:published-desc",
      ]
      .filter { !$0.isEmpty }
      .joined(separator: " ")
    }
  }

  private var title: String {
    switch kind {
    case .saved: return "Saved videos"
    case .collection(let fixed): return fixed.name
    case .channels: return channel?.name ?? collection?.name ?? "Latest"
    }
  }

  private var actions: [ItemAction] {
    kind == .saved ? [.archive, .delete] : [.save, .archive]
  }

  /// Saved videos play oldest first, except any pinned on the web, which come first in their order.
  private var videos: [LibraryItem] {
    let items = list.visibleItems.filter { kind == .saved || length.matches($0) }
    guard kind == .saved, !savedOrder.isEmpty else { return items }
    let rank = Dictionary(savedOrder.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
    return items.enumerated().sorted { a, b in
      switch (rank[a.element.id], rank[b.element.id]) {
      case let (ra?, rb?): return ra < rb
      case (.some, nil): return true
      case (nil, .some): return false
      default: return a.offset < b.offset
      }
    }.map(\.element)
  }

  private var channels: [Subscription] { subscriptions.filter(\.isYouTube) }

  var body: some View {
    NavigationStack(path: $path) {
      videoList
      .overlay { emptyState }
      .toasts(toaster)
      .stashPage(title, detail: detail, accentDetail: kind != .saved && !showAll) { tools }
      .navigationDestination(for: LibraryItem.self) { item in
        PlayerScreen(item: item, queue: videos, actions: actions, perform: perform)
          .onAppear { list.markSeen(item) }
      }
      .navigationDestination(for: Route.self) { _ in
        AllChannelsView { picked in
          channel = picked
          path = NavigationPath()
        }
      }
      .refreshable { await reload() }
      .task(id: query) { await list.load(query) }
      .task { await loadExtras() }
    }
  }

  /// A grid on Mac; on iPhone a list, so videos swipe like everything else.
  @ViewBuilder
  private var videoList: some View {
    #if os(iOS)
    List {
      if isFront {
        Group { frontSections }
          .listRowSeparator(.hidden)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
      }
      ForEach(videos) { item in
        ZStack {
          NavigationLink(value: item) { EmptyView() }.opacity(0)
          card(item)
        }
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
        .itemSwipes(item, unseen: isUnseen(item), perform: perform)
        .itemMenu(item, unseen: isUnseen(item), perform: perform)
        .task { await list.loadMore(after: item) }
      }
      if list.isLoading && !list.items.isEmpty {
        HStack { Spacer(); ProgressView(); Spacer() }.stashListRow()
      }
    }
    .stashList()
    #else
    // The web's grid: cards at least 232pt wide, 18pt apart, 22pt between rows, in day bands
    // for new videos.
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 26) {
        if isFront { frontSections }
        ForEach(dayGroups, id: \.label) { group in
          VStack(alignment: .leading, spacing: 14) {
            if kind != .saved {
              HStack(spacing: 10) {
                Kicker(group.label)
                Rectangle().fill(Color.stLine).frame(height: 1)
              }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 232), spacing: 18, alignment: .top)], spacing: 22) {
              ForEach(group.items) { item in
                NavigationLink(value: item) { card(item) }
                  .buttonStyle(.plain)
                  .itemMenu(item, unseen: isUnseen(item), perform: perform)
                  .task { await list.loadMore(after: item) }
              }
            }
          }
        }
        if list.isLoading && !list.items.isEmpty {
          ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding()
        }
      }
      .pageWidth()
      .padding(.bottom, 40)
    }
    .scrollContentBackground(.hidden)
    #endif
  }

  /// Continue watching, then your channels, at the top of Latest.
  @ViewBuilder
  private var frontSections: some View {
    if !continuing.isEmpty {
      VStack(alignment: .leading, spacing: 14) {
        WatchBand("Continue watching")
        #if os(macOS)
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 18, alignment: .top), count: 3), spacing: 22) {
          ForEach(continuing.prefix(3)) { item in
            NavigationLink(value: item) { continueCard(item) }
              .buttonStyle(.plain)
          }
        }
        #else
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: 14) {
            ForEach(continuing) { item in
              NavigationLink(value: item) { continueCard(item).frame(width: 240) }
                .buttonStyle(.plain)
            }
          }
        }
        #endif
      }
    }
    if !channels.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        WatchBand("Your channels") {
          Button { path.append(Route.allChannels) } label: {
            Text("All channels ›").font(.stSmall).foregroundStyle(Color.stMuted)
          }
          .buttonStyle(.plain)
          .fixedSize()
        }
        ChannelStrip(
          channels: channels,
          unseen: unseenByChannel,
          onPick: { channel = $0 },
          onAll: { path.append(Route.allChannels) }
        )
      }
    }
  }

  private func continueCard(_ item: LibraryItem) -> some View {
    VideoCard(item: item, channelName: channelName(item), timeLeft: videoTimeLeft(item))
  }

  /// "12 new", "40 videos" or "8 saved" beside the title.
  private var detail: String? {
    guard let total = list.total else { return nil }
    if kind == .saved { return "\(total) saved" }
    return showAll ? "\(total) videos" : "\(total) new"
  }

  /// Videos grouped by the day they came out; saved videos stay in one group, in their order.
  private var dayGroups: [(label: String, items: [LibraryItem])] {
    guard kind != .saved else { return [("Saved", videos)] }
    var result: [(label: String, items: [LibraryItem])] = []
    for item in videos {
      let label = dayGroup(item.publishedAt ?? item.savedAt)
      if let index = result.firstIndex(where: { $0.label == label }) {
        result[index].items.append(item)
      } else {
        result.append((label, [item]))
      }
    }
    return result
  }

  private func card(_ item: LibraryItem) -> some View {
    VideoCard(item: item, channelName: channelName(item), unseen: isUnseen(item))
  }

  private func isUnseen(_ item: LibraryItem) -> Bool { kind != .saved && list.isUnseen(item) }

  // MARK: Toolbar

  @ViewBuilder
  private var tools: some View {
    if kind != .saved {
      #if os(macOS)
      StashSegmented(selection: $length, LengthFilter.allCases.map { StashSegmented<LengthFilter>.Option($0.title, $0) })
      #else
      Menu {
        Picker("Length", selection: $length) {
          ForEach(LengthFilter.allCases) { Text($0.title).tag($0) }
        }
      } label: {
        Label(length.title, systemImage: "clock")
      }
      #endif
      StashSegmented(selection: $showAll, [.init("New", false), .init("All", true)])

      Menu {
        Picker("Channel", selection: $channel) {
          Text("All channels").tag(Subscription?.none)
          ForEach(channels) { Text($0.name).tag(Optional($0)) }
        }
        .pickerStyle(.inline)
        if case .channels = kind, !collections.isEmpty {
          Picker("Collection", selection: $collection) {
            Text("Every collection").tag(WatchCollection?.none)
            ForEach(collections) { Text($0.name).tag(Optional($0)) }
          }
          .pickerStyle(.inline)
        }
        if let channel {
          Section(channel.name) {
            Toggle("Include Shorts", isOn: Binding(
              get: { channel.includeShorts ?? false },
              set: { value in updateChannel(channel, includeShorts: value) }
            ))
            if !collections.isEmpty {
              Picker("Collection", selection: Binding(
                get: { channel.collectionId ?? "" },
                set: { value in updateChannel(channel, collectionId: value) }
              )) {
                Text("No collection").tag("")
                ForEach(collections) { Text($0.name).tag($0.id) }
              }
            }
            Button("Unfollow \(channel.name)", role: .destructive) { unfollow(channel) }
          }
        }
      } label: {
        Label(channel?.name ?? collection?.name ?? "All channels", systemImage: "line.3.horizontal.decrease")
      }
      .menuStyle(.button)
      .buttonStyle(.text)
      .fixedSize()
      .help("Choose a channel or collection")
    }
  }

  // MARK: States

  @ViewBuilder
  private var emptyState: some View {
    if list.visibleItems.isEmpty {
      if let error = list.error {
        EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark", boxed: false) {
          Button("Try again") { Task { await reload() } }
        }
      } else if list.isLoading {
        #if os(macOS)
        SkeletonCards(count: 8, minWidth: 232, height: 190).pageWidth().frame(maxHeight: .infinity, alignment: .top)
        #else
        SkeletonRows()
        #endif
      } else if kind == .saved {
        EmptyBox(title: "No saved videos", message: "Save videos from your channels to watch them later.", systemImage: "play.rectangle.on.rectangle", boxed: false)
      } else {
        EmptyBox(title: showAll ? "No videos" : "All caught up", message: showAll ? "Videos from the channels you follow appear here." : "Nothing new from your channels.", systemImage: "play.rectangle", boxed: false)
      }
    }
  }

  // MARK: Doing things

  private func channelName(_ item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func reload() async {
    await list.reload(query)
    if kind == .saved { savedOrder = await Watch.savedOrder() }
    if case .channels = kind { await loadFront() }
  }

  private func loadExtras() async {
    if kind == .saved { savedOrder = await Watch.savedOrder() }
    if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
    if case .channels = kind {
      if collections.isEmpty { collections = (try? await Watch.collections()) ?? [] }
      await loadFront()
    }
  }

  private func loadFront() async {
    async let watching = Watch.continueWatching()
    async let counts = Watch.unseenByChannel()
    continuing = await watching
    unseenByChannel = await counts
  }

  private func updateChannel(_ target: Subscription, collectionId: String? = nil, includeShorts: Bool? = nil) {
    Task {
      do {
        try await Watch.updateChannel(target.id, collectionId: collectionId, includeShorts: includeShorts)
        subscriptions = (try? await Library.subscriptions()) ?? subscriptions
        channel = subscriptions.first { $0.id == target.id }
        await list.reload(query)
      } catch {
        toaster.show("Couldn't change \(target.name)")
      }
    }
  }

  private func unfollow(_ target: Subscription) {
    Task {
      do {
        try await Watch.unfollow(target)
        channel = nil
        subscriptions.removeAll { $0.id == target.id }
        toaster.show("Unfollowed \(target.name)")
      } catch {
        toaster.show("Couldn't unfollow \(target.name)")
      }
    }
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    runItemAction(
      action, item, toaster: toaster,
      remove: { list.remove(item) },
      restore: { list.restore(item) },
      refresh: {
        if action == .markSeen || action == .openOriginal { list.markSeen(item) } else { await list.reload(query) }
      }
    )
  }
}
