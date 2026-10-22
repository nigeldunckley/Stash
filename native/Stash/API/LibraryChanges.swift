import Foundation
import Observation

/// Keeps open pages up to date without replacing their navigation or scroll state.
@MainActor
@Observable
final class LibraryChanges {
  static let shared = LibraryChanges()
  private(set) var revision = 0
  private(set) var pendingRemovals: Set<String> = []
  @ObservationIgnored private var lists: [WeakList] = []
  @ObservationIgnored private var pending: Task<Void, Never>?
  @ObservationIgnored private var progressUpdate: Task<Void, Never>?

  func beginRemoval(_ id: String) -> Bool { pendingRemovals.insert(id).inserted }
  func endRemoval(_ id: String) { pendingRemovals.remove(id) }

  func publishProgress() {
    guard progressUpdate == nil else { return }
    progressUpdate = Task {
      try? await Task.sleep(for: .seconds(10))
      guard !Task.isCancelled else { return }
      progressUpdate = nil
      publish()
    }
  }

  private struct WeakList { weak var value: ItemList? }

  func track(_ list: ItemList) {
    lists.removeAll { $0.value == nil }
    lists.append(WeakList(value: list))
  }

  func publish() {
    pending?.cancel()
    pending = Task {
      try? await Task.sleep(for: .milliseconds(250))
      guard !Task.isCancelled else { return }
      revision += 1
      lists.removeAll { $0.value == nil }
      for list in lists { list.value?.invalidate() }
    }
  }
}
