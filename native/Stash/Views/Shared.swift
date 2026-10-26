import SwiftUI

/// Opens an item: the player for videos, the reader for everything else.
struct ItemDestination: View {
  let item: LibraryItem
  var queue: [LibraryItem] = []
  var actions: [ItemAction]?
  let perform: (ItemAction, LibraryItem) -> Void
  var embedded = false
  var resumePlayback = true
  var onClose: (() -> Void)?

  var body: some View {
    let actions = actions ?? ItemAction.defaults(for: item)
    if Watch.isVideo(item) {
      PlayerScreen(item: item, queue: queue.isEmpty ? [item] : queue, actions: actions, perform: perform, embedded: embedded, resumePlayback: resumePlayback, onMini: onClose)
    } else {
      ReaderScreen(item: item, actions: actions, perform: perform, embedded: embedded, onBack: onClose)
    }
  }
}

/// A screen's title and toolbar, left off when it's shown inside a card.
struct ScreenChrome<Bar: ToolbarContent>: ViewModifier {
  let embedded: Bool
  let title: String
  let toolbar: () -> Bar

  /// Pages kept alive behind the current one on Mac leave the toolbar to it.
  @Environment(\.isActivePage) private var isActive
  @Environment(\.pageBack) private var back
  @Environment(\.inSheet) private var inSheet
  #if os(macOS)
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  @Environment(\.autoHiddenSidebar) private var autoHiddenSidebar
  #endif

  func body(content: Content) -> some View {
    if embedded {
      content
    } else {
      content
        #if os(macOS)
        // On Mac the way back sits over the screen, as it does over every other page.
        .safeAreaInset(edge: .top, spacing: 0) {
          if let back {
            BackBar(back: back)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, PageLayout.gutter)
              .padding(.leading, (sidebarHidden || autoHiddenSidebar) && !inSheet ? PageLayout.windowButtons : 0)
              .frame(height: 34)
              .background(Color.stPage)
              .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
          }
        }
        #endif
        .navigationTitle(title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        #endif
        .toolbar {
          if isActive { toolbar() }
        }
    }
  }
}

extension ItemAction {
  /// What you can do with an item where it is: save or archive a feed item, archive or delete a save.
  static func defaults(for item: LibraryItem) -> [ItemAction] {
    if item.isDeleted { return [.restore] }
    if item.isFeedItem { return [.save, .archive] }
    if item.isArchived { return [.unarchive, .delete] }
    return [.archive, .delete]
  }
}

/// A short message at the bottom of the screen, such as "Saved".
@MainActor
@Observable
final class Toaster {
  static let shared = Toaster()
  private(set) var message: String?
  private(set) var undo: (() -> Void)?
  private var shown = 0

  /// Shows a message for a moment, or longer with an Undo button.
  func show(_ message: String, undo: (() -> Void)? = nil) {
    shown += 1
    #if os(iOS)
    UIAccessibility.post(notification: .announcement, argument: message)
    #endif
    let id = shown
    withAnimation {
      self.message = message
      self.undo = undo
    }
    Task {
      #if os(iOS)
      if UIAccessibility.isVoiceOverRunning { return }
      #else
      if NSWorkspace.shared.isVoiceOverEnabled { return }
      #endif
      try? await Task.sleep(for: .seconds(undo == nil ? 4 : 8))
      if shown == id { dismiss() }
    }
  }

  func dismiss() {
    withAnimation {
      message = nil
      undo = nil
    }
  }
}

struct ToastOverlay: ViewModifier {
  let toaster: Toaster
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content.overlay(alignment: .bottom) {
      if let message = toaster.message {
        HStack(spacing: 14) {
          Text(message)
          if let undo = toaster.undo {
            Button {
              toaster.dismiss()
              undo()
            } label: {
              Text("Undo")
                #if os(iOS)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
                #endif
            }
            .font(.ui(13, .semibold))
            .foregroundStyle(Color.stAccentText)
            .buttonStyle(.plain)
          }
        }
          .font(.ui(13, .medium))
          .padding(.horizontal, 14)
          .padding(.vertical, 9)
          .foregroundStyle(Color.stInk)
          .stashGlass(in: RoundedRectangle(cornerRadius: Radius.item, style: .continuous), shadow: 16)
          .padding(.bottom, 16)
          .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
      }
    }
  }
}

extension View {
  func toasts(_ toaster: Toaster) -> some View { modifier(ToastOverlay(toaster: toaster)) }
}

/// A cover image that fills its frame, with a quiet placeholder while it loads.
struct CoverImage: View {
  let url: URL?

  var body: some View {
    Color.stSunken
      .overlay { FadeImage(url: url) }
      .clipped()
  }
}

/// "Today", "Yesterday", "This week", then the month: how feed items are grouped.
func dayGroup(_ date: Date?, now: Date = .now) -> String {
  guard let date else { return "Earlier" }
  let calendar = Calendar.current
  let today = calendar.startOfDay(for: now)
  if date >= today { return "Today" }
  if date >= today.addingTimeInterval(-86_400) { return "Yesterday" }
  if date >= today.addingTimeInterval(-6 * 86_400) { return "This week" }
  let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
  return sameYear ? date.formatted(.dateTime.month(.wide)) : date.formatted(.dateTime.month(.wide).year())
}

/// Minutes left in an article you've started, or its length if you haven't.
func readingLabel(_ item: LibraryItem) -> String? {
  guard let minutes = item.readingMinutes else { return nil }
  if item.progress >= 0.02 {
    let left = max(1, Int((Double(minutes) * (1 - item.progress)).rounded()))
    return "\(left) min left"
  }
  return "\(minutes) min"
}


@MainActor
enum SeenActions {
  /// Give a bulk action a short Undo window before committing it.
  static func stage(query: String, count: Int?, toaster: Toaster, finished: @escaping () -> Void) -> Task<Void, Never> {
    let task = Task {
      defer { finished() }
      do {
        try await Task.sleep(for: .seconds(5))
        try Task.checkCancellation()
        try await Library.markSeen(query: query, expectedCount: count)
        toaster.show("Marked all seen")
      } catch is CancellationError {
        return
      } catch {
        toaster.show("Couldn't mark these posts as seen. Try again.")
      }
    }
    toaster.show("Marking posts as seen…", undo: { task.cancel(); toaster.show("Cancelled") })
    return task
  }
}
