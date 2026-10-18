import SwiftUI

/// Watch: new videos from your channels (optionally one collection), or the videos you've saved.
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
    case .channels: return channel?.name ?? collection?.name ?? "Channels"
    }
  }

  private var actions: [ItemAction] {
    kind == .saved ? [.archive, .delete] : [.save, .archive]
  }

  /// Saved videos play oldest first, except any pinned on the web, which come first in their order.
  private var videos: [LibraryItem] {
    let items = list.visibleItems
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
    NavigationStack {
      videoList
      .overlay { emptyState }
      .toasts(toaster)
      .background(Color.stPage)
      .navigationTitle(title)
      .navigationDestination(for: LibraryItem.self) { item in
        PlayerScreen(item: item, queue: videos, actions: actions, perform: perform)
          .onAppear { list.markSeen(item) }
      }
      .toolbar { ToolbarItemGroup(placement: .primaryAction) { tools } }
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
    ScrollView {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 18, alignment: .top)], spacing: 22) {
        ForEach(videos) { item in
          NavigationLink(value: item) { card(item) }
            .buttonStyle(.plain)
            .itemMenu(item, unseen: isUnseen(item), perform: perform)
            .task { await list.loadMore(after: item) }
        }
      }
      .padding(16)
      if list.isLoading && !list.items.isEmpty { ProgressView().padding() }
    }
    #endif
  }

  private func card(_ item: LibraryItem) -> some View {
    VideoCard(item: item, channelName: channelName(item), unseen: isUnseen(item))
  }

  private func isUnseen(_ item: LibraryItem) -> Bool { kind != .saved && list.isUnseen(item) }

  // MARK: Toolbar

  @ViewBuilder
  private var tools: some View {
    if kind != .saved {
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
      } label: {
        Label("Channels", systemImage: "line.3.horizontal.decrease.circle")
      }
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
        ProgressView()
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
  }

  private func loadExtras() async {
    if kind == .saved { savedOrder = await Watch.savedOrder() }
    if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
    if case .channels = kind, collections.isEmpty { collections = (try? await Watch.collections()) ?? [] }
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
