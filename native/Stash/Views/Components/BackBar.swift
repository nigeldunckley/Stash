import SwiftUI

/// The way out of a page you've drilled into, on Mac: "‹ LATEST / MKBHD" in mono above the
/// page's title, where the crumbs are the pages above this one and clicking goes up one.
/// ⌘[ (Go › Back) and Esc do the same; clicking the page's sidebar item goes all the way up.
/// iPhone has its own back button, so there this changes nothing.
struct PageBack {
  /// The pages above this one, outermost first; the last is where Back goes.
  let crumbs: [String]
  let action: () -> Void
}

struct BackBar: View {
  let back: PageBack
  @State private var hovering = false

  var body: some View {
    Button(action: back.action) {
      HStack(spacing: 6) {
        Image(systemName: "chevron.left")
          .font(.system(size: 9, weight: .bold))
        ForEach(Array(back.crumbs.enumerated()), id: \.offset) { index, crumb in
          if index > 0 { Text("/").foregroundStyle(Color.stMuted.opacity(0.6)) }
          Text(crumb.uppercased())
            .foregroundStyle(index == back.crumbs.count - 1 || hovering ? Color.stInk : Color.stMuted)
            .lineLimit(1)
        }
      }
      .font(.mono(11, .medium))
      .tracking(0.66)
      .foregroundStyle(hovering ? Color.stInk : Color.stMuted)
      .padding(.vertical, 3)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    #if os(macOS)
    .pointerStyle(.link)
    #endif
    .help("Back to \(back.crumbs.last ?? "the last page") (⌘[)")
    .accessibilityLabel("Back to \(back.crumbs.last ?? "the last page")")
  }
}

private struct PageBackKey: EnvironmentKey {
  static let defaultValue: PageBack? = nil
}

extension EnvironmentValues {
  /// The way out of the page in front, drawn by its header (or the reader's and player's bar).
  var pageBack: PageBack? {
    get { self[PageBackKey.self] }
    set { self[PageBackKey.self] = newValue }
  }
}

extension View {
  /// Gives a drilled-in page its way back on Mac. With no action, Back pops this pushed screen.
  /// `escape` gives the bar its own Esc key, for screens in a sheet the window's keys don't reach.
  func pageBack(_ crumbs: [String], enabled: Bool = true, escape: Bool = false, action: (() -> Void)? = nil) -> some View {
    modifier(PageBackModifier(crumbs: crumbs, enabled: enabled, escape: escape, action: action))
  }
}

private struct PageBackModifier: ViewModifier {
  let crumbs: [String]
  let enabled: Bool
  let escape: Bool
  let action: (() -> Void)?

  #if os(macOS)
  @Environment(\.dismiss) private var dismiss
  @Environment(Navigator.self) private var navigator: Navigator?
  @Environment(\.pageSection) private var page
  @State private var id = UUID()
  @State private var onScreen = false
  #endif

  func body(content: Content) -> some View {
    #if os(macOS)
    content
      .environment(\.pageBack, enabled ? PageBack(crumbs: crumbs, action: goBack) : nil)
      // Our own back replaces the window's, which is easy to miss.
      .navigationBarBackButtonHidden(action == nil)
      .background {
        if escape && enabled {
          Button("Back", action: goBack)
            .keyboardShortcut(.cancelAction)
            .opacity(0)
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
        }
      }
      .onAppear { onScreen = true; sync() }
      .onDisappear { onScreen = false; sync() }
      .onChange(of: enabled) { _, _ in sync() }
    #else
    content
    #endif
  }

  #if os(macOS)
  private func goBack() {
    if let action { action() } else { dismiss() }
  }

  /// Tells the window this page has somewhere to go back to, for ⌘[ and Esc.
  private func sync() {
    guard let navigator, let page else { return }
    if onScreen && enabled {
      navigator.register(id, page: page, action: goBack)
    } else {
      navigator.remove(id)
    }
  }
  #endif
}

#if os(macOS)
/// The window's Back and Forward. Each page tells it where its Back goes; when a page is
/// already at the top, Back returns to the sidebar page you were on before.
@MainActor
@Observable
final class Navigator {
  private struct Exit {
    let id: UUID
    let page: AppSection
    var action: () -> Void
  }

  private var exits: [Exit] = []
  /// How each page goes straight back to its top, for a click on its sidebar item.
  private var tops: [AppSection: () -> Void] = [:]
  private var history: [AppSection] = []
  private var position = -1
  /// Set while Back or Forward changes the page, so the change isn't recorded as a new visit.
  private var travelling = false

  func register(_ id: UUID, page: AppSection, action: @escaping () -> Void) {
    if let index = exits.firstIndex(where: { $0.id == id }) {
      exits[index].action = action
    } else {
      exits.append(Exit(id: id, page: page, action: action))
    }
  }

  func remove(_ id: UUID) { exits.removeAll { $0.id == id } }

  /// Whether the page has drilled in anywhere.
  func canGoUp(in page: AppSection) -> Bool { exits.contains { $0.page == page } }

  /// Goes up one level in the page, if it has drilled in.
  @discardableResult
  func goUp(in page: AppSection) -> Bool {
    guard let exit = exits.last(where: { $0.page == page }) else { return false }
    exit.action()
    return true
  }

  func setTop(_ page: AppSection, action: @escaping () -> Void) { tops[page] = action }

  /// Goes all the way back to the page's top: by the page's own way if it has one, otherwise
  /// out of each level, deepest first.
  func goToTop(in page: AppSection) {
    if let top = tops[page] {
      top()
    } else {
      for exit in exits.filter({ $0.page == page }).reversed() { exit.action() }
    }
  }

  /// Drops pages that no longer exist (a deleted collection) from Back and Forward.
  func forget(where gone: (AppSection) -> Bool) {
    let before = history.prefix(max(position, 0) + 1).filter(gone).count
    history.removeAll(where: gone)
    tops = tops.filter { !gone($0.key) }
    position = min(max(position - before, history.isEmpty ? -1 : 0), history.count - 1)
  }

  func record(_ page: AppSection) {
    if travelling {
      travelling = false
      return
    }
    history = Array(history.prefix(position + 1))
    if history.last != page { history.append(page) }
    if history.count > 50 { history.removeFirst(history.count - 50) }
    position = history.count - 1
  }

  /// The sidebar page before this one, or after it when you've gone back.
  func travel(_ step: Int, from current: AppSection) -> AppSection? {
    let target = position + step
    guard history.indices.contains(target), history[target] != current else { return nil }
    position = target
    travelling = true
    return history[target]
  }
}
#endif

extension View {
  /// How a page goes straight back to its top when you click its sidebar item again.
  func pageTop(_ action: @escaping () -> Void) -> some View {
    #if os(macOS)
    modifier(PageTopModifier(action: action))
    #else
    self
    #endif
  }
}

#if os(macOS)
private struct PageTopModifier: ViewModifier {
  let action: () -> Void
  @Environment(Navigator.self) private var navigator: Navigator?
  @Environment(\.pageSection) private var page

  func body(content: Content) -> some View {
    content.onAppear {
      if let navigator, let page { navigator.setTop(page, action: action) }
    }
  }
}
#endif

private struct InSheetKey: EnvironmentKey {
  static let defaultValue = false
}

extension EnvironmentValues {
  /// Shown in a sheet, away from the window's buttons.
  var inSheet: Bool {
    get { self[InSheetKey.self] }
    set { self[InSheetKey.self] = newValue }
  }
}

private struct PageSectionKey: EnvironmentKey {
  static let defaultValue: AppSection? = nil
}

extension EnvironmentValues {
  /// Which sidebar page a view is part of, on Mac.
  var pageSection: AppSection? {
    get { self[PageSectionKey.self] }
    set { self[PageSectionKey.self] = newValue }
  }
}

extension Notification.Name {
  /// Go › Back (⌘[) and Go › Forward (⌘]).
  static let stashBack = Notification.Name("stashBack")
  static let stashForward = Notification.Name("stashForward")
  /// Clicking the sidebar item you're already on: back to that page's top.
  static let stashPageTop = Notification.Name("stashPageTop")
}
