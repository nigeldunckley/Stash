import Foundation

enum QueueOrder {
  /// A queue ends at its final item; it never wraps back to a video already played.
  static func remaining<Item: Identifiable>(_ items: [Item], after current: Item.ID?) -> [Item] {
    guard let current, let index = items.firstIndex(where: { $0.id == current }) else { return items }
    return Array(items.dropFirst(index + 1))
  }
}
