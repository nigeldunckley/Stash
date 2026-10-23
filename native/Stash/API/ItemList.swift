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
  private var requestedQuery: String?
  private var generation = 0
  private var needsRefresh = false
  @ObservationIgnored private let search: (String, String?, Int) async throws -> Library.Page

  init(search: @escaping (String, String?, Int) async throws -> Library.Page = {
    try await Library.search($0, after: $1, first: $2)
  }) {
    self.search = search
    LibraryChanges.shared.track(self)
  }

  /// Items you've just saved, archived or deleted, so they leave the list straight away.
  private var removed: Set<String> = []
  /// Where those items were, so Undo can put them back in place.
  private var departed: [String: Int] = [:]
  /// Items marked seen while this list is open.
  private(set) var seen: Set<String> = []
  /// When items that turned up while the list was open arrived, for the Wire's typing-in.
  private(set) var arrivals: [String: Date] = [:]

  var visibleItems: [LibraryItem] { items.filter { !removed.contains($0.id) } }

  func load(_ query: String) async {
    guard query != loadedQuery || items.isEmpty else { return }
    await reload(query)
  }

  func reload(_ query: String, preservingItems: Bool = false) async {
    if let previous = requestedQuery, previous != query {
      items = []
      total = nil
      removed = []
      seen = []
      cursor = nil
      error = nil
    }
    requestedQuery = query
    generation += 1
    let request = generation
    let previousCount = preservingItems && loadedQuery == query ? items.count : 0
    isLoading = true
    needsRefresh = false
    defer {
      if request == generation {
        isLoading = false
        if needsRefresh { invalidate() }
      }
    }
    do {
      var page = try await search(query, nil, 30)
      var refreshed = page.items
      while refreshed.count < previousCount, page.pageInfo.hasNextPage, let cursor = page.pageInfo.endCursor {
        let next = try await search(query, cursor, 30)
        let known = Set(refreshed.map(\.id))
        refreshed += next.items.filter { !known.contains($0.id) }
        guard next.pageInfo.endCursor != cursor else { break }
        page = next
      }
      guard request == generation, !Task.isCancelled else { return }
      loadedQuery = query
      items = refreshed
      total = page.pageInfo.totalCount
      cursor = page.pageInfo.endCursor
      hasMore = page.pageInfo.hasNextPage
      removed.formIntersection(LibraryChanges.shared.pendingRemovals)
      if let count = total { total = max(0, count - refreshed.filter { removed.contains($0.id) }.count) }
      seen = []
      waiting = []
      error = nil
    } catch {
      guard request == generation, !Task.isCancelled else { return }
      self.error = error.localizedDescription
    }
  }

  func invalidate() {
    if isLoading { needsRefresh = true; return }
    guard let query = requestedQuery ?? loadedQuery else { return }
    Task {
      guard query == requestedQuery else { return }
      if isLoading { needsRefresh = true; return }
      await reload(query, preservingItems: true)
    }
  }

  /// Loads the next page when the last rows come on screen.
  func loadMore(after item: LibraryItem) async {
    guard hasMore, !isLoading, let query = loadedQuery,
          let index = items.firstIndex(of: item), index >= items.count - 5 else { return }
    isLoading = true
    let request = generation
    defer {
      if request == generation {
        isLoading = false
        if needsRefresh { invalidate() }
      }
    }
    do {
      let page = try await search(query, cursor, 30)
      guard request == generation, !Task.isCancelled else { return }
      let known = Set(items.map(\.id))
      items += page.items.filter { !known.contains($0.id) }
      cursor = page.pageInfo.endCursor
      hasMore = page.pageInfo.hasNextPage
      total = page.pageInfo.totalCount
      adjustPendingCount()
      error = nil
    } catch {
      guard request == generation, !Task.isCancelled else { return }
      self.error = "Couldn't load more. Try again."
    }
  }

  /// Checks for newer items and adds them to the top, keeping everything already loaded.
  func pullNew(_ query: String) async {
    guard query == loadedQuery, !isLoading else { return }
    let request = generation
    guard let page = try? await search(query, nil, 30), request == generation,
          query == requestedQuery, !Task.isCancelled else { return }
    let known = Set(items.map(\.id))
    let fresh = page.items.filter { !known.contains($0.id) }
    for item in fresh { arrivals[item.id] = .now }
    items = fresh + items
    waiting.removeAll { known.contains($0.id) || fresh.contains($0) }
    total = page.pageInfo.totalCount
    adjustPendingCount()
  }

  /// New items found while you were looking, held back until you ask for them so the list
  /// doesn't shift under you. Shown as "N new" at the top of the list.
  private(set) var waiting: [LibraryItem] = []

  /// Looks for newer items. An empty list takes them straight away; otherwise they wait
  /// behind the "N new" button.
  func checkNew(_ query: String) async {
    guard query == loadedQuery, !isLoading else { return }
    if visibleItems.isEmpty { return await pullNew(query) }
    let request = generation
    guard let page = try? await search(query, nil, 30), request == generation,
          query == requestedQuery, !Task.isCancelled else { return }
    let known = Set(items.map(\.id)).union(waiting.map(\.id))
    let fresh = page.items.filter { !known.contains($0.id) && !removed.contains($0.id) }
    guard !fresh.isEmpty else { return }
    waiting = fresh + waiting
  }

  /// Puts the waiting items at the top of the list, and says how many were actually new.
  @discardableResult
  func showWaiting() -> Int {
    guard !waiting.isEmpty else { return 0 }
    let known = Set(items.map(\.id))
    let fresh = waiting.filter { !known.contains($0.id) }
    for item in fresh { arrivals[item.id] = .now }
    items = fresh + items
    if let count = total { total = count + fresh.count }
    waiting = []
    return fresh.count
  }

  private func adjustPendingCount() {
    let pending = removed.intersection(LibraryChanges.shared.pendingRemovals)
    if let count = total { total = max(0, count - items.filter { pending.contains($0.id) }.count) }
  }

  func remove(_ item: LibraryItem) {
    if let index = items.firstIndex(where: { $0.id == item.id }) { departed[item.id] = index }
    if removed.insert(item.id).inserted, let count = total { total = max(0, count - 1) }
  }

  /// Puts an item back (Undo). A reload since it left may have dropped it from the list
  /// altogether, so it goes back where it was rather than waiting for the server to return it.
  func restore(_ item: LibraryItem) {
    let wasHidden = removed.remove(item.id) != nil
    if let index = departed[item.id], !items.contains(where: { $0.id == item.id }) {
      items.insert(item, at: min(index, items.count))
      if let count = total { total = count + 1 }
    } else if wasHidden, let count = total {
      total = count + 1
    }
    departed[item.id] = nil
  }
  func markSeen(_ item: LibraryItem) { seen.insert(item.id) }
  func isUnseen(_ item: LibraryItem) -> Bool { item.seenAt == nil && !seen.contains(item.id) }
}
