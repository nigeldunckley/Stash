import SwiftUI

/// New posts from the feeds you follow, newest first.
struct FeedsView: View {
  @State private var list = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var source: Subscription?
  @AppStorage("feedsShowAll") private var showAll = false

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
      groupsByDay: true
    ) {
      StashSegmented(selection: $showAll, [.init("Unseen", false), .init("All", true)])
      Button { markAllSeen() } label: { Label("Mark all seen", systemImage: "checkmark") }
        .buttonStyle(.text)

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
    }
    .task { subscriptions = (try? await Library.subscriptions()) ?? subscriptions }
  }

  private func name(for item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func markAllSeen() {
    let query = "\(scope) -is:seen"
    Task {
      try? await Library.markSeen(query: query)
      await list.reload(self.query)
    }
  }
}
