import SwiftUI

/// Home's preview: the article or video in a floating card over Home, with where it's from along
/// the top and what you can do with it along the bottom. Up and down move through the list.
struct PeekCard: View {
  let item: LibraryItem
  let sourceName: String
  /// Where it sits in the list it came from, e.g. "3 of 12".
  var position: String?
  var canGoBack = false
  var canGoForward = false
  var queue: [LibraryItem] = []
  /// In a sheet on iPhone the card fills it, without its own corners and shadow.
  var inSheet = false
  let onClose: () -> Void
  let onMove: (Int) -> Void
  let onExpand: () -> Void
  let perform: (ItemAction, LibraryItem) -> Void

  var body: some View {
    let card = VStack(spacing: 0) {
      header
      Divider()
      ItemDestination(item: item, queue: queue, perform: perform, embedded: true)
        .id(item.id)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      Divider()
      dock
    }
    .background(Color.stashBackground)

    if inSheet {
      card
    } else {
      card
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.stashBorder, lineWidth: 0.5))
        .shadow(color: .black.opacity(0.10), radius: 2, y: 1)
        .shadow(color: .black.opacity(0.22), radius: 48, y: 24)
    }
  }

  // MARK: Header

  private var header: some View {
    HStack(spacing: 10) {
      SiteIcon(url: item.iconURL)
        .scaleEffect(1.3)
        .frame(width: 20, height: 20)
      VStack(alignment: .leading, spacing: 1) {
        Text(sourceName)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(Color.stashInk)
          .lineLimit(1)
        Text(details)
          .font(.stashDetail)
          .foregroundStyle(Color.stashMuted)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      if let position {
        Text(position)
          .font(.stashDetail)
          .foregroundStyle(Color.stashMuted)
          .monospacedDigit()
      }
      HStack(spacing: 2) {
        HeaderButton(systemImage: "chevron.up", help: "Previous (⌘↑)") { onMove(-1) }
          .disabled(!canGoBack)
          .keyboardShortcut(.upArrow, modifiers: .command)
        HeaderButton(systemImage: "chevron.down", help: "Next (⌘↓)") { onMove(1) }
          .disabled(!canGoForward)
          .keyboardShortcut(.downArrow, modifiers: .command)
      }
      HeaderButton(systemImage: "arrow.up.left.and.arrow.down.right", help: "Open full size (⌘E)") { onExpand() }
        .keyboardShortcut("e", modifiers: .command)
      HeaderButton(systemImage: "xmark", help: "Close (Esc)") { onClose() }
        .keyboardShortcut(.cancelAction)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 11)
  }

  private var details: String {
    [shortAge(item.date), readingLabel(item) ?? Watch.duration(item).map(Watch.timecode)]
      .compactMap { $0 }
      .filter { !$0.isEmpty }
      .joined(separator: " · ")
  }

  // MARK: Dock

  /// The main actions for this item: the first swipe on each side, then the rest.
  private var actions: [ItemAction] {
    let swipes = ItemAction.swipes(for: item)
    var seen = Set<ItemAction>()
    return (swipes.leading.prefix(1) + swipes.trailing + swipes.leading.dropFirst())
      .filter { $0 != .openOriginal && seen.insert($0).inserted }
  }

  private var dock: some View {
    HStack(spacing: 8) {
      ForEach(Array(actions.enumerated()), id: \.element) { index, action in
        DockButton(
          title: action.title(for: item),
          systemImage: action.systemImage,
          key: Self.key(for: action),
          prominent: index == 0,
          destructive: action == .delete
        ) { perform(action, item) }
        .modifier(Shortcut(key: Self.shortcut(for: action)))
      }
      Spacer(minLength: 8)
      if let url = item.originalURL {
        ShareLink(item: url) {
          Image(systemName: "square.and.arrow.up")
        }
        .buttonStyle(.borderless)
        .help("Share")
        DockButton(title: "Open original", systemImage: "safari", key: "⌘↩", prominent: false, destructive: false) {
          perform(.openOriginal, item)
        }
        .keyboardShortcut(.return, modifiers: .command)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(.bar)
  }

  private static func key(for action: ItemAction) -> String? {
    switch action {
    case .save: return "⌘S"
    case .archive, .unarchive: return "⌘⌫"
    case .markRead, .markUnread: return "⌘R"
    case .markSeen: return "⌘U"
    default: return nil
    }
  }

  private static func shortcut(for action: ItemAction) -> KeyEquivalent? {
    switch action {
    case .save: return "s"
    case .archive, .unarchive: return .delete
    case .markRead, .markUnread: return "r"
    case .markSeen: return "u"
    default: return nil
    }
  }
}

private struct Shortcut: ViewModifier {
  let key: KeyEquivalent?

  func body(content: Content) -> some View {
    if let key {
      // With ⌘, so typing in the article (a highlight note) never triggers them.
      content.keyboardShortcut(key, modifiers: .command)
    } else {
      content
    }
  }
}

private struct HeaderButton: View {
  let systemImage: String
  let help: String
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 13, weight: .semibold))
        .frame(width: 30, height: 28)
        .background(hovering ? Color.stashSurface : .clear, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(Color.stashMuted)
    .help(help)
    .onHover { hovering = $0 }
  }
}

private struct DockButton: View {
  let title: String
  let systemImage: String
  let key: String?
  let prominent: Bool
  let destructive: Bool
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Image(systemName: systemImage).font(.system(size: 12, weight: .semibold))
        Text(title).font(.callout.weight(.medium))
        #if os(macOS)
        if let key {
          Text(key)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(RoundedRectangle(cornerRadius: 4).strokeBorder(borderColor, lineWidth: 1))
            .opacity(0.7)
        }
        #endif
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .foregroundStyle(foreground)
      .background(background, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
      .overlay {
        if !prominent {
          RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.stashBorder, lineWidth: 1)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .animation(.easeOut(duration: 0.12), value: hovering)
  }

  private var foreground: Color {
    if prominent { return .stashBackground }
    return destructive ? .red : .stashInk
  }

  private var background: Color {
    if prominent { return hovering ? Color.stashInk.opacity(0.85) : .stashInk }
    return hovering ? .stashSurface : .stashBackground
  }

  private var borderColor: Color { prominent ? .stashBackground : .stashMuted }
}
