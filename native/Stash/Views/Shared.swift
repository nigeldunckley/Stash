import SwiftUI

/// Opens an item: the player for videos, the reader for everything else.
struct ItemDestination: View {
  let item: LibraryItem
  var queue: [LibraryItem] = []
  var actions: [ItemAction]?
  let perform: (ItemAction, LibraryItem) -> Void
  var embedded = false

  var body: some View {
    let actions = actions ?? ItemAction.defaults(for: item)
    if Watch.isVideo(item) {
      PlayerScreen(item: item, queue: queue.isEmpty ? [item] : queue, actions: actions, perform: perform, embedded: embedded)
    } else {
      ReaderScreen(item: item, actions: actions, perform: perform, embedded: embedded)
    }
  }
}

/// A screen's title and toolbar, left off when it's shown inside a card.
struct ScreenChrome<Bar: ToolbarContent>: ViewModifier {
  let embedded: Bool
  let title: String
  let toolbar: () -> Bar

  func body(content: Content) -> some View {
    if embedded {
      content
    } else {
      content
        .navigationTitle(title)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        #endif
        .toolbar { toolbar() }
    }
  }
}

extension ItemAction {
  /// What you can do with an item where it is: save or archive a feed item, archive or delete a save.
  static func defaults(for item: LibraryItem) -> [ItemAction] {
    if item.isFeedItem { return [.save, .archive] }
    if item.isArchived { return [.unarchive, .delete] }
    return [.archive, .delete]
  }
}

/// A short message at the bottom of the screen, such as "Saved".
@MainActor
@Observable
final class Toaster {
  private(set) var message: String?
  private(set) var undo: (() -> Void)?
  private var shown = 0

  /// Shows a message for a moment, or longer with an Undo button.
  func show(_ message: String, undo: (() -> Void)? = nil) {
    shown += 1
    let id = shown
    withAnimation {
      self.message = message
      self.undo = undo
    }
    Task {
      try? await Task.sleep(for: .seconds(undo == nil ? 2 : 5))
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

  func body(content: Content) -> some View {
    content.overlay(alignment: .bottom) {
      if let message = toaster.message {
        HStack(spacing: 14) {
          Text(message)
          if let undo = toaster.undo {
            Button("Undo") {
              toaster.dismiss()
              undo()
            }
            .fontWeight(.semibold)
            .foregroundStyle(Color.stashAccentText)
            .buttonStyle(.plain)
          }
        }
          .font(.callout.weight(.medium))
          .padding(.horizontal, 14)
          .padding(.vertical, 9)
          .background(.regularMaterial, in: Capsule())
          .overlay(Capsule().strokeBorder(Color.stashBorder, lineWidth: 0.5))
          .padding(.bottom, 16)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
  }
}

extension View {
  func toasts(_ toaster: Toaster) -> some View { modifier(ToastOverlay(toaster: toaster)) }
}

/// A small uppercase monospaced label, as used for section kickers on the web.
struct Kicker: View {
  let text: String
  var accent = false

  init(_ text: String, accent: Bool = false) {
    self.text = text
    self.accent = accent
  }

  var body: some View {
    Text(text.uppercased())
      .font(.system(size: 10.5, design: .monospaced))
      .tracking(0.8)
      .foregroundStyle(accent ? Color.stashAccentText : Color.stashMuted)
  }
}

/// A section heading with an optional count beside it.
struct SectionHeading<Trailing: View>: View {
  let title: String
  var detail: String?
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text(title).font(.headline)
      if let detail {
        Text(detail).font(.stashDetail).foregroundStyle(Color.stashMuted)
      }
      Spacer(minLength: 0)
      trailing()
    }
  }
}

extension SectionHeading where Trailing == EmptyView {
  init(title: String, detail: String? = nil) {
    self.init(title: title, detail: detail) { EmptyView() }
  }
}

/// A cover image that fills its frame, with a quiet placeholder while it loads.
struct CoverImage: View {
  let url: URL?

  var body: some View {
    Color.stashSurface
      .overlay {
        AsyncImage(url: url) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          EmptyView()
        }
      }
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
