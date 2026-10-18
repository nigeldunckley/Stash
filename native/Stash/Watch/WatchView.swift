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
  @State private var toast: String?
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
      ScrollView {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 18, alignment: .top)], spacing: 22) {
          ForEach(videos) { item in
            NavigationLink(value: item) {
              VideoCard(item: item, channelName: channelName(item), unseen: kind != .saved && list.isUnseen(item))
            }
            .buttonStyle(.plain)
            .contextMenu { menu(for: item) }
            .task { await list.loadMore(after: item) }
          }
        }
        .padding(16)
        if list.isLoading && !list.items.isEmpty { ProgressView().padding() }
      }
      .overlay { emptyState }
      .overlay(alignment: .bottom) { toastView }
      .background(Color.stashBackground)
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

  // MARK: Toolbar

  @ViewBuilder
  private var tools: some View {
    if kind != .saved {
      Picker("Show", selection: $showAll) {
        Text("New").tag(false)
        Text("All").tag(true)
      }
      .pickerStyle(.segmented)
      .fixedSize()

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

  @ViewBuilder
  private func menu(for item: LibraryItem) -> some View {
    if let url = item.originalURL {
      Link(destination: url) { Label("Open on YouTube", systemImage: "play.rectangle") }
      ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
      Divider()
    }
    Button {
      Task {
        try? await Watch.markWatched(item.id, item.progress < 0.9)
        await list.reload(query)
      }
    } label: {
      Label(item.progress < 0.9 ? "Mark as watched" : "Mark as not watched", systemImage: "checkmark.circle")
    }
    ForEach(actions, id: \.self) { action in
      Button(role: action == .delete ? .destructive : nil) { perform(action, item) } label: {
        Label(kind != .saved && action == .save ? "Save for later" : action.title, systemImage: action.systemImage)
      }
    }
  }

  // MARK: States

  @ViewBuilder
  private var emptyState: some View {
    if list.visibleItems.isEmpty {
      if let error = list.error {
        ContentUnavailableView {
          Label("Couldn't load", systemImage: "wifi.exclamationmark")
        } description: {
          Text(error)
        } actions: {
          Button("Try again") { Task { await reload() } }
        }
      } else if list.isLoading {
        ProgressView()
      } else if kind == .saved {
        ContentUnavailableView("No saved videos", systemImage: "play.rectangle.on.rectangle",
                               description: Text("Save videos from your channels to watch them later."))
      } else {
        ContentUnavailableView(showAll ? "No videos" : "All caught up", systemImage: "play.rectangle",
                               description: Text(showAll ? "Videos from the channels you follow appear here." : "Nothing new from your channels."))
      }
    }
  }

  @ViewBuilder
  private var toastView: some View {
    if let toast {
      Text(toast)
        .font(.callout.weight(.medium))
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.stashBorder, lineWidth: 0.5))
        .padding(.bottom, 16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
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
    withAnimation { list.remove(item) }
    Task {
      do {
        try await action.run(on: item)
        show(kind != .saved && action == .save ? "Saved for later" : action.doneMessage)
      } catch {
        withAnimation { list.restore(item) }
        show(error.localizedDescription)
      }
    }
  }

  private func show(_ message: String) {
    withAnimation { toast = message }
    Task {
      try? await Task.sleep(for: .seconds(2))
      withAnimation { if toast == message { toast = nil } }
    }
  }
}
