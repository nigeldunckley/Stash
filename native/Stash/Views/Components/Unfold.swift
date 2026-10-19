import SwiftUI

/// The Unfold: opening an item grows its row into the Reader, and going back folds it home.
/// On iPhone this is the system zoom from the row (interactive under the back swipe; it fades
/// when the row has gone); on Mac the reader rises into place (97%, 14pt lower, faded in).
/// Reduce Motion turns both into a short crossfade.
enum Unfold {
  /// The web's cubic-bezier(0.32, 0.72, 0, 1) over 420ms, as a spring.
  static let spring = Animation.spring(response: 0.42, dampingFraction: 0.86)
  static let fade = Animation.easeInOut(duration: 0.2)

  static func animation(reduceMotion: Bool) -> Animation { reduceMotion ? fade : spring }
}

extension View {
  /// Marks a row as where its item unfolds from.
  func unfoldSource(_ item: LibraryItem, in namespace: Namespace.ID) -> some View {
    #if os(iOS)
    matchedTransitionSource(id: item.id, in: namespace) { source in
      source.clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
    #else
    self
    #endif
  }

  /// Unfolds a pushed screen out of the row with the same item (on Mac, rises into place).
  func unfoldDestination(_ item: LibraryItem, in namespace: Namespace.ID) -> some View {
    modifier(UnfoldDestination(id: item.id, namespace: namespace))
  }
}

private struct UnfoldDestination: ViewModifier {
  let id: String
  let namespace: Namespace.ID
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    #if os(iOS)
    if reduceMotion {
      content
    } else {
      content.navigationTransition(.zoom(sourceID: id, in: namespace))
    }
    #else
    content.modifier(UnfoldIn())
    #endif
  }
}

/// Mac: the screen rises into place (from 97%, 14pt lower, faded) as it arrives.
struct UnfoldIn: ViewModifier {
  @State private var shown = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .scaleEffect(shown || reduceMotion ? 1 : 0.97, anchor: .top)
      .offset(y: shown || reduceMotion ? 0 : 14)
      .opacity(shown ? 1 : 0)
      .onAppear {
        withAnimation(Unfold.animation(reduceMotion: reduceMotion)) { shown = true }
      }
  }
}
