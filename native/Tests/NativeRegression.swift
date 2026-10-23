import Foundation

// Transport replacement for the standalone harness. Production models and list logic are
// compiled directly from Stash/API; no server or personal library is touched.
enum Library {
  struct Page { let items: [LibraryItem]; let pageInfo: PageInfo }
  static func search(_ query: String, after: String? = nil, first: Int = 30) async throws -> Page { throw Failure("Unexpected transport call") }
  static func save(url: String) async throws -> String { throw Failure("Unexpected save") }
}
struct Failure: Error, CustomStringConvertible { let description: String; init(_ value: String) { description = value } }
@MainActor func check(_ value: @autoclosure () -> Bool, _ message: String) throws { if !value() { throw Failure(message) } }
func item(_ id: String) -> LibraryItem {
  try! JSONDecoder().decode(LibraryItem.self, from: Data("{\"id\":\"\(id)\",\"title\":\"Article \(id)\",\"slug\":\"\(id)\",\"url\":\"https://example.com/\(id)\"}".utf8))
}
func page(_ ids: [String], cursor: String? = nil, more: Bool = false, total: Int? = nil) -> Library.Page {
  Library.Page(items: ids.map(item), pageInfo: PageInfo(hasNextPage: more, endCursor: cursor, totalCount: total ?? ids.count))
}
@MainActor final class Transport {
  struct Request { let query: String; let cursor: String?; let reply: CheckedContinuation<Library.Page, Error> }
  var requests: [Request] = []
  func search(_ query: String, _ cursor: String?, _ first: Int) async throws -> Library.Page {
    try await withCheckedThrowingContinuation { requests.append(Request(query: query, cursor: cursor, reply: $0)) }
  }
  func wait(_ count: Int) async throws {
    for _ in 0..<10000 { if requests.count >= count { return }; await Task.yield() }
    throw Failure("Timed out waiting for request \(count)")
  }
}

@main struct NativeRegression {
  @MainActor static func main() async throws {
    try queue()
    try validation()
    try await capture()
    try await race()
    try await wireRace()
    try await pendingRemoval()
    try await undoAfterReload()
    try await initialInvalidation()
    try await pagination()
    try await paginationInvalidation()
    try await refreshFailure()
    print("PASS: native queue, capture validation/retry, request races, pending rollback, invalidation, pagination and refresh recovery")
  }
  @MainActor static func queue() throws {
    let items = [item("a"), item("b"), item("c")]
    try check(QueueOrder.remaining(items, after: "a").map(\.id) == ["b", "c"], "Queue must advance from A")
    try check(QueueOrder.remaining(items, after: "b").map(\.id) == ["c"], "Queue must not cycle to A")
    try check(QueueOrder.remaining(items, after: "c").isEmpty, "Queue must stop at C")
    try check(QueueOrder.remaining(items, after: "missing").count == 3, "Unknown current item must retain queue")
  }
  @MainActor static func validation() throws {
    let normalized = try LinkValidation.url(" example.com/story ").absoluteString
    try check(normalized == "https://example.com/story", "Normalize website address")
    for input in ["", "hello world", "javascript:alert(1)", "file:///private/test", "https://name:secret@example.com", "https://"] {
      do { _ = try LinkValidation.url(input); throw Failure("Accepted invalid address: \(input)") }
      catch is LinkValidation.ValidationError { }
    }
  }
  @MainActor static func capture() async throws {
    var saves = 0
    let model = LinkCapture(save: { url in saves += 1; if saves == 1 { throw Failure("Connection failed") }; return url }, find: { _ in true }, pause: { _ in })
    model.text = "example.com/story"
    await model.submit()
    try check(model.phase == .failed && model.text == "example.com/story", "Failed capture must keep input")
    await model.submit()
    try check(model.phase == .saved && saves == 2, "Retry must succeed")
    await model.submit()
    try check(saves == 2, "Accepted capture must not resubmit")
    let slow = LinkCapture(save: { $0 }, find: { _ in false }, pause: { _ in })
    slow.text = "example.com/slow"
    await slow.submit()
    try check(slow.phase == .queued && !slow.busy && slow.accepted, "Slow preparation needs non-busy accepted state")
  }
  @MainActor static func race() async throws {
    let transport = Transport(); let list = ItemList(search: transport.search)
    let a = Task { await list.reload("A") }; try await transport.wait(1)
    let b = Task { await list.reload("B") }; try await transport.wait(2)
    transport.requests[1].reply.resume(returning: page(["b"]))
    await b.value
    transport.requests[0].reply.resume(returning: page(["a"]))
    await a.value
    try check(list.items.map(\.id) == ["b"] && !list.isLoading, "Old response replaced current query")
  }
  @MainActor static func wireRace() async throws {
    let transport = Transport(); let list = ItemList(search: transport.search)
    let initial = Task { await list.reload("A") }; try await transport.wait(1)
    transport.requests[0].reply.resume(returning: page(["a"])); await initial.value
    let old = Task { await list.pullNew("A") }; try await transport.wait(2)
    let current = Task { await list.reload("B") }; try await transport.wait(3)
    transport.requests[2].reply.resume(returning: page(["b"])); await current.value
    transport.requests[1].reply.resume(returning: page(["a", "old-arrival"])); await old.value
    try check(list.items.map(\.id) == ["b"], "Obsolete Wire response contaminated current query")
  }
  @MainActor static func pendingRemoval() async throws {
    let list = ItemList(search: { _,_,_ in page(["a", "b"], total: 2) })
    await list.load("A")
    _ = LibraryChanges.shared.beginRemoval("b")
    list.remove(item("b")); list.remove(item("b"))
    try check(list.total == 1, "Repeated removal decremented twice")
    await list.reload("A", preservingItems: true)
    try check(list.visibleItems.map(\.id) == ["a"] && list.total == 1, "Refresh resurrected pending removal")
    LibraryChanges.shared.endRemoval("b"); list.restore(item("b")); list.restore(item("b"))
    try check(list.visibleItems.count == 2 && list.total == 2, "Rollback failed to restore count/item")
  }
  @MainActor static func undoAfterReload() async throws {
    var ids = ["a", "b", "c"]
    let list = ItemList(search: { _,_,_ in page(ids, total: ids.count) })
    await list.load("A")
    _ = LibraryChanges.shared.beginRemoval("b")
    list.remove(item("b"))
    LibraryChanges.shared.endRemoval("b")
    ids = ["a", "c"]
    await list.reload("A", preservingItems: true)
    list.restore(item("b"))
    try check(list.visibleItems.map(\.id) == ["a", "b", "c"] && list.total == 3, "Undo after a refresh didn't put the item back in place")
  }
  @MainActor static func initialInvalidation() async throws {
    let transport = Transport(); let list = ItemList(search: transport.search)
    let initial = Task { await list.load("A") }; try await transport.wait(1)
    list.invalidate()
    transport.requests[0].reply.resume(returning: page(["a"]))
    await initial.value
    try await transport.wait(2)
    transport.requests[1].reply.resume(returning: page(["a", "b"]))
    for _ in 0..<10000 { if !list.isLoading && list.items.count == 2 { break }; await Task.yield() }
    try check(list.items.count == 2, "Invalidation during first load was lost")
  }
  @MainActor static func pagination() async throws {
    var calls = 0
    let list = ItemList(search: { _,cursor,_ in
      calls += 1
      return cursor == nil ? page(["a","b"], cursor:"two", more:true,total:4) : page(["b","c","d"],cursor:"end",total:4)
    })
    await list.load("A"); await list.loadMore(after: item("b"))
    try check(list.items.map(\.id) == ["a","b","c","d"], "Pagination must deduplicate")
    await list.reload("A", preservingItems: true)
    try check(list.items.count == 4 && calls == 4, "Refresh discarded loaded depth")
  }
  @MainActor static func refreshFailure() async throws {
    var fail = false
    let list = ItemList(search: { _,_,_ in if fail { throw Failure("Connection failed") }; return page(["a"]) })
    await list.load("A"); fail = true; await list.reload("A")
    try check(list.items.count == 1 && list.error != nil && !list.isLoading, "Failed refresh discarded content")
    fail = false; await list.reload("A")
    try check(list.error == nil, "Successful retry didn't clear error")
  }

  @MainActor static func paginationInvalidation() async throws {
    let transport = Transport(); let list = ItemList(search: transport.search)
    let initial = Task { await list.load("A") }; try await transport.wait(1)
    transport.requests[0].reply.resume(returning: page(["a","b"], cursor: "two", more: true, total: 4))
    await initial.value
    _ = LibraryChanges.shared.beginRemoval("b"); list.remove(item("b"))
    // Queue a refresh, then start pagination before that refresh's task can run.
    list.invalidate()
    async let more: Void = list.loadMore(after: item("b"))
    try await transport.wait(2)
    // Whichever task starts first, the second refresh must still be honoured.
    if transport.requests[1].cursor == "two" {
      transport.requests[1].reply.resume(returning: page(["c","d"], cursor: "end", total: 4))
      await more
      try check(list.total == 3, "Pagination restored the count of a pending removal")
      try await transport.wait(3)
      transport.requests[2].reply.resume(returning: page(["a","b","c","d","e"], total: 5))
    } else {
      transport.requests[1].reply.resume(returning: page(["a","b","c","d","e"], total: 5))
      await more
    }
    for _ in 0..<10000 { if !list.isLoading { break }; await Task.yield() }
    try check(list.total == 4 && list.items.contains(where: { $0.id == "e" }), "Refresh queued beside pagination was lost")
    let expectedRequests = transport.requests.count + 1
    let wire = Task { await list.pullNew("A") }
    try await transport.wait(expectedRequests)
    transport.requests[expectedRequests - 1].reply.resume(returning: page(["a","b","c","d","e"], total: 5))
    await wire.value
    try check(list.total == 4, "Wire restored the count of a pending removal")
    LibraryChanges.shared.endRemoval("b")
  }
}
