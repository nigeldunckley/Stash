import SwiftUI

/// New stories dropping in from the top, one after another, when they're put at the top of a
/// list (the "N new" pill, or the Wire), rather than all appearing at once.
struct ArrivalDrop: ViewModifier {
  /// Where the item sits among the new ones, so each lands just after the one above it.
  let order: Int

  @State private var landed: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(arrived: Date?, order: Int) {
    self.order = order
    // Only items that have only just arrived drop in; ones scrolled to later are simply there.
    _landed = State(initialValue: arrived.map { Date.now.timeIntervalSince($0) > 1.5 } ?? true)
  }

  func body(content: Content) -> some View {
    content
      .opacity(landed ? 1 : 0)
      .offset(y: landed || reduceMotion ? 0 : -18)
      .onAppear {
        guard !landed else { return }
        let delay = reduceMotion ? 0 : Double(min(order, 8)) * 0.055
        withAnimation((reduceMotion ? StashMotion.fade : .smooth(duration: 0.5, extraBounce: 0.12)).delay(delay)) {
          landed = true
        }
      }
  }
}

extension View {
  func arrival(_ arrived: Date?, order: Int) -> some View {
    modifier(ArrivalDrop(arrived: arrived, order: order))
  }
}

/// A title that dims when you finish it, with the grey wiping across it from left to right
/// like ink drying, rather than just switching colour.
struct InkWipe: ViewModifier {
  let finished: Bool
  var ink: Color = .stInk
  var dried: Color = .stMuted

  @State private var progress: CGFloat
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(finished: Bool, ink: Color = .stInk, dried: Color = .stMuted) {
    self.finished = finished
    self.ink = ink
    self.dried = dried
    _progress = State(initialValue: finished ? 1 : 0)
  }

  func body(content: Content) -> some View {
    content
      .modifier(InkStep(progress: progress, ink: ink, dried: dried))
      .onChange(of: finished) { _, done in
        if done {
          withAnimation(reduceMotion ? StashMotion.fade : .easeInOut(duration: 0.7)) { progress = 1 }
        } else {
          var still = Transaction()
          still.disablesAnimations = true
          withTransaction(still) { progress = 0 }
        }
      }
  }
}

/// The wipe at one moment: dried to the left of the edge, wet ink to the right, with a soft edge.
private struct InkStep: ViewModifier, Animatable {
  var progress: CGFloat
  let ink: Color
  let dried: Color

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func body(content: Content) -> some View {
    if progress <= 0 {
      content.foregroundStyle(ink)
    } else if progress >= 1 {
      content.foregroundStyle(dried)
    } else {
      // The edge runs a little past both ends so the wipe starts and finishes cleanly.
      let edge = progress * 1.2 - 0.1
      let start = min(0.998, max(0, edge - 0.08))
      let end = min(1, max(start + 0.001, edge + 0.02))
      content.foregroundStyle(LinearGradient(
        stops: [.init(color: dried, location: start), .init(color: ink, location: end)],
        startPoint: .leading, endPoint: .trailing
      ))
    }
  }
}

extension View {
  func inkWipe(finished: Bool) -> some View {
    modifier(InkWipe(finished: finished))
  }
}
