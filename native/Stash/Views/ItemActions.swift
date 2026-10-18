import SwiftUI

/// Something you can do to an item, from a swipe, a menu, a key or the reader's toolbar.
enum ItemAction: Hashable {
  case save, archive, unarchive, delete
  case markRead, markUnread, markSeen
  case openOriginal

  var title: String {
    switch self {
    case .save: return "Save"
    case .archive: return "Archive"
    case .unarchive: return "Move to Saved"
    case .delete: return "Delete"
    case .markRead: return "Mark read"
    case .markUnread: return "Mark unread"
    case .markSeen: return "Mark seen"
    case .openOriginal: return "Open original"
    }
  }

  /// The words for this item: videos are watched and saved for later.
  func title(for item: LibraryItem) -> String {
    guard Watch.isVideo(item) else { return title }
    switch self {
    case .save: return "Save for later"
    case .markRead: return "Mark watched"
    case .markUnread: return "Mark unwatched"
    default: return title
    }
  }

  var systemImage: String {
    switch self {
    case .save: return "bookmark"
    case .archive: return "archivebox"
    case .unarchive: return "tray.and.arrow.up"
    case .delete: return "trash"
    case .markRead: return "checkmark.circle"
    case .markUnread: return "circle"
    case .markSeen: return "eye"
    case .openOriginal: return "safari"
    }
  }

  var tint: Color {
    switch self {
    case .save: return .stashAccent
    case .archive, .unarchive: return .gray
    case .delete: return .red
    case .markRead, .markUnread: return .blue
    case .markSeen: return .indigo
    case .openOriginal: return .teal
    }
  }

  var doneMessage: String {
    switch self {
    case .save: return "Saved"
    case .archive: return "Archived"
    case .unarchive: return "Moved to Saved"
    case .delete: return "Deleted"
    case .markRead: return "Marked read"
    case .markUnread: return "Marked unread"
    case .markSeen: return "Marked seen"
    case .openOriginal: return ""
    }
  }

  func doneMessage(for item: LibraryItem) -> String {
    guard Watch.isVideo(item) else { return doneMessage }
    switch self {
    case .save: return item.isFeedItem ? "Saved for later" : doneMessage
    case .markRead: return "Marked watched"
    case .markUnread: return "Marked unwatched"
    default: return doneMessage
    }
  }

  /// Whether the item leaves the list it's in.
  var removesItem: Bool {
    switch self {
    case .save, .archive, .unarchive, .delete: return true
    case .markRead, .markUnread, .markSeen, .openOriginal: return false
    }
  }

  var canUndo: Bool { self != .openOriginal && self != .markSeen }

  func run(on item: LibraryItem) async throws {
    switch self {
    case .save: try await Library.move(item.id, to: "inbox")
    case .archive: try await Library.setArchived(item.id, true)
    case .unarchive: try await Library.setArchived(item.id, false)
    case .delete: try await Library.delete(item.id)
    case .markRead: try await Library.setProgress(item.id, percent: 100)
    case .markUnread: try await Library.setProgress(item.id, percent: 0)
    case .markSeen: try await Library.markSeen([item.id])
    case .openOriginal: await Self.open(item)
    }
  }

  /// Puts things back as they were before `run`.
  func undo(on item: LibraryItem) async throws {
    switch self {
    case .save: try await Library.move(item.id, to: "following")
    case .archive: try await Library.setArchived(item.id, false)
    case .unarchive: try await Library.setArchived(item.id, true)
    case .delete: try await Library.restore(item.id)
    case .markRead, .markUnread:
      try await Library.setProgress(
        item.id, percent: item.readingProgressPercent ?? 0, anchor: item.readingProgressAnchorIndex ?? 0)
    case .markSeen, .openOriginal: break
    }
  }

  @MainActor
  private static func open(_ item: LibraryItem) {
    guard let url = item.originalURL else { return }
    if item.isFeedItem && item.seenAt == nil { Task { try? await Library.markSeen([item.id]) } }
    #if os(iOS)
    UIApplication.shared.open(url)
    #else
    NSWorkspace.shared.open(url)
    #endif
  }

  // MARK: Swipes

  /// The swipes for an item where it is. The first on each edge is the full swipe.
  static func swipes(for item: LibraryItem, unseen: Bool = false) -> (leading: [ItemAction], trailing: [ItemAction]) {
    let read: ItemAction = item.progress >= 0.9 ? .markUnread : .markRead
    if item.isArchived {
      return ([.unarchive, read], [.delete])
    }
    if item.isFeedItem {
      if Watch.isVideo(item) {
        return ([.save, unseen ? .markSeen : read], [.archive, .openOriginal])
      }
      return ([.save] + (unseen ? [.markSeen] : []), [.archive, .openOriginal])
    }
    return ([read, .openOriginal], [.archive, .delete])
  }
}

extension View {
  /// Adds the item's swipe actions: right to save or mark read, left to archive or delete.
  func itemSwipes(_ item: LibraryItem, unseen: Bool = false, perform: @escaping (ItemAction, LibraryItem) -> Void) -> some View {
    let swipes = ItemAction.swipes(for: item, unseen: unseen)
    return self
      .swipeActions(edge: .leading, allowsFullSwipe: true) {
        ForEach(swipes.leading, id: \.self) { action in
          Button { perform(action, item) } label: {
            Label(action.title(for: item), systemImage: action.systemImage)
          }
          .tint(action.tint)
        }
      }
      .swipeActions(edge: .trailing, allowsFullSwipe: true) {
        ForEach(swipes.trailing, id: \.self) { action in
          Button(role: action == .delete ? .destructive : nil) { perform(action, item) } label: {
            Label(action.title(for: item), systemImage: action.systemImage)
          }
          .tint(action.tint)
        }
      }
  }

  /// The same actions as the swipes, for a right-click or long-press.
  func itemMenu(_ item: LibraryItem, unseen: Bool = false, perform: @escaping (ItemAction, LibraryItem) -> Void) -> some View {
    let swipes = ItemAction.swipes(for: item, unseen: unseen)
    return contextMenu {
      ForEach(swipes.leading + swipes.trailing, id: \.self) { action in
        Button(role: action == .delete ? .destructive : nil) { perform(action, item) } label: {
          Label(action.title(for: item), systemImage: action.systemImage)
        }
      }
      if let url = item.originalURL {
        Divider()
        ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
        Button { copyLink(url) } label: { Label("Copy link", systemImage: "link") }
      }
    }
  }
}

@MainActor
func copyLink(_ url: URL) {
  #if os(iOS)
  UIPasteboard.general.url = url
  #else
  NSPasteboard.general.clearContents()
  NSPasteboard.general.setString(url.absoluteString, forType: .string)
  #endif
}

/// Runs an action with the item leaving the list straight away, then offers Undo.
@MainActor
func runItemAction(
  _ action: ItemAction,
  _ item: LibraryItem,
  toaster: Toaster,
  remove: @escaping () -> Void,
  restore: @escaping () -> Void,
  refresh: @escaping () async -> Void = {}
) {
  if action.removesItem { withAnimation { remove() } }
  Task {
    do {
      try await action.run(on: item)
      if !action.removesItem { await refresh() }
      guard action != .openOriginal else { return }
      toaster.show(action.doneMessage(for: item), undo: action.canUndo ? {
        Task {
          do {
            try await action.undo(on: item)
            withAnimation { restore() }
            await refresh()
          } catch {
            toaster.show(error.localizedDescription)
          }
        }
      } : nil)
    } catch {
      withAnimation { restore() }
      toaster.show(error.localizedDescription)
    }
  }
}
