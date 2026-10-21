import SwiftUI

/// New posts from the feeds you follow, newest first.
struct FeedsView: View {
  @State private var list = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var source: Subscription?
  @AppStorage("feedsShowAll") private var showAll = false
  @State private var sorting = false
  @State private var markTask: Task<Void, Never>?
  @State private var toaster = Toaster()
  /// Cards (the usual rows) or the Wire.
  @AppStorage("feedsWire") private var wire = false

  private var scope: String {
    [
      "in:following use:folders -type:video",
      source.map { "subscription:\(searchValue($0.searchKey))" } ?? "",
    ]
    .filter { !$0.isEmpty }
    .joined(separator: " ")
  }

  private var query: String {
    [scope, showAll ? "" : "-is:seen", "sort:published-desc"]
      .filter { !$0.isEmpty }
      .joined(separator: " ")
  }

  var body: some View {
    ItemListView(
      title: source?.name ?? "Feeds",
      list: list,
      query: query,
      leading: .save,
      trailing: [.archive],
      showsUnseen: true,
      subscriptionName: name(for:),
      onOpen: { item in Task { try? await Library.markSeen([item.id]) } },
      emptyTitle: showAll ? "No posts" : "All caught up",
      emptyMessage: showAll ? "Posts from the feeds you follow appear here." : "Nothing new from your feeds.",
      countLabel: showAll ? "posts" : "unseen",
      groupsByDay: true,
      wire: wire,
      live: true,
      folio: FolioContent(
        items: [FolioContent.today, "\(FolioData.shared.feeds) \(FolioData.shared.feeds == 1 ? "FEED" : "FEEDS")"],
        checked: true,
        right: showAll ? nil : list.total.map { "\($0) UNSEEN" }
      )
    ) {
      StashSegmented(selection: $showAll, [.init("Unseen", false), .init("All", true)])

      Menu {
        Picker("Source", selection: $source) {
          Text("All feeds").tag(Subscription?.none)
          ForEach(subscriptions.filter { !$0.isYouTube }) { subscription in
            Text(subscription.name).tag(Optional(subscription))
          }
        }
        .pickerStyle(.inline)
      } label: {
        Label(source?.name ?? "All feeds", systemImage: "line.3.horizontal.decrease")
      }
      .menuStyle(.button)
      .buttonStyle(.text)
      .fixedSize()
      .help("Choose a feed")
      Menu {
        Picker("Layout", selection: $wire) {
          Text("Cards").tag(false)
          Text("Wire").tag(true)
        }
        if !showAll, (list.total ?? 0) >= 3 {
          Button("Sort through feeds", systemImage: "rectangle.stack") { sorting = true }
        }
        Button("Mark all seen", systemImage: "checkmark") { markAllSeen() }
          .disabled(markTask != nil || list.visibleItems.isEmpty)
      } label: { Label("More", systemImage: "ellipsis") }
      .buttonStyle(.text)
      .help("Change the layout or act on this feed")
    }
    .toasts(toaster)
    .pageBack(["Feeds"], enabled: source != nil) { source = nil }
    .task { subscriptions = (try? await Library.subscriptions()) ?? subscriptions }
    .sortSheet(isPresented: $sorting, scope: scope) { Task { await list.reload(query) } }
  }

  private func name(for item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func markAllSeen() {
    markTask?.cancel()
    let snapshot = "\(scope) -is:seen"
    let count = showAll ? nil : list.total
    markTask = SeenActions.stage(query: snapshot, count: count, toaster: toaster) {
      markTask = nil
    }
  }
}
