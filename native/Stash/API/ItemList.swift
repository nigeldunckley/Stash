import Foundation
import Observation

/// One scrolling list of items (Feeds or Saved), loaded a page at a time.
@MainActor
@Observable
final class ItemList {
  private(set) var items: [LibraryItem] = []
  private(set) var total: Int?
  private(set) var isLoading = false
  private(set) var error: String?
  private var cursor: String?
  private var hasMore = true
  private var loadedQuery: String?

  /// Items you've just saved, archived or deleted, so they leave the list straight away.
  private var removed: Set<String> = []
  /// Items marked seen while this list is open.
  private(set) var seen: Set<String> = []

  var visibleItems: [LibraryItem] { items.filter { !removed.contains($0.id) } }

  func load(_ query: String) async {
    guard query != loadedQuery || items.isEmpty else { return }
    await reload(query)
  }

  func reload(_ query: String) async {
    isLoading = true
    defer { isLoading = false }
    do {
      let page = try await Library.search(query)
      loadedQuery = query
      items = page.items
      total = page.pageInfo.totalCount
      cursor = page.pageInfo.endCursor
      hasMore = page.pageInfo.hasNextPage
      removed = []
      seen = []
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  /// Loads the next page when the last rows come on screen.
  func loadMore(after item: LibraryItem) async {
    guard hasMore, !isLoading, let query = loadedQuery,
          let index = items.firstIndex(of: item), index >= items.count - 5 else { return }
    isLoading = true
    defer { isLoading = false }
    if let page = try? await Library.search(query, after: cursor) {
      let known = Set(items.map(\.id))
      items += page.items.filter { !known.contains($0.id) }
      cursor = page.pageInfo.endCursor
      hasMore = page.pageInfo.hasNextPage
    }
  }

  func remove(_ item: LibraryItem) { removed.insert(item.id) }
  func restore(_ item: LibraryItem) { removed.remove(item.id) }
  func markSeen(_ item: LibraryItem) { seen.insert(item.id) }
  func isUnseen(_ item: LibraryItem) -> Bool { item.seenAt == nil && !seen.contains(item.id) }
}
