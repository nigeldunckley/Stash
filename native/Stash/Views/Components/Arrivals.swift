import SwiftUI

/// New stories dropping in from the top, one after another, when they're put at the top of a
/// list (as they arrive on Home, the "N new" pill, or the Wire), rather than all appearing at
/// once. The list opens the gap first; then each row falls in from above, overshoots a touch and
/// settles, with a fine accent edge that holds for a moment and fades. Reduce Motion fades.
struct ArrivalDrop: ViewModifier {
  /// Where the item sits among the new ones, so each lands just after the one above it.
  let order: Int

  @State private var landed: Bool
  @State private var marked: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// How long after the gap starts opening the first row begins to fall.
  static let gapTime = 0.17
  /// Between one row and the next.
  static let stagger = 0.06

  init(arrived: Date?, order: Int) {
    self.order = order
    // Only items that have only just arrived drop in; ones scrolled to later are simply there.
    let fresh = arrived.map { Date.now.timeIntervalSince($0) <= 1.5 } ?? false
    _landed = State(initialValue: !fresh)
    _marked = State(initialValue: fresh)
  }

  func body(content: Content) -> some View {
    content
      .overlay(alignment: .leading) {
        Rectangle()
          .fill(Color.stAccent)
          .frame(width: 2)
          .opacity(marked && landed ? 1 : 0)
          .allowsHitTesting(false)
      }
      .opacity(landed ? 1 : 0)
      .offset(y: landed || reduceMotion ? 0 : -26)
      .onAppear {
        guard !landed else { return }
        let delay = reduceMotion ? 0 : Self.gapTime + Double(min(order, 8)) * Self.stagger
        withAnimation((reduceMotion ? StashMotion.fade : .spring(duration: 0.56, bounce: 0.2)).delay(delay)) {
          landed = true
        }
        // The accent edge holds for a second after landing, then fades slowly. Set later, not
        // with a delayed animation, so the edge is actually there to see first.
        Task {
          try? await Task.sleep(for: .seconds(delay + 0.56 + 1))
          withAnimation(.easeOut(duration: 1.6)) { marked = false }
        }
      }
  }
}

extension View {
  func arrival(_ arrived: Date?, order: Int) -> some View {
    modifier(ArrivalDrop(arrived: arrived, order: order))
  }

  /// A front page story: drops in when it's new, and slides to its new place when a newer
  /// story pushes it along (the old lead into the grid, say).
  func arriving(_ item: LibraryItem, feeds: ItemList, order: Int, in space: Namespace.ID) -> some View {
    arrival(feeds.arrivals[item.id], order: order)
      .matchedGeometryEffect(id: item.id, in: space)
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
    // One style throughout, so the title keeps its identity as the wipe starts and ends. The
    // edge runs a little past both ends so the wipe starts and finishes cleanly.
    let edge = progress * 1.2 - 0.1
    let start = min(0.998, max(0, edge - 0.08))
    let end = min(1, max(start + 0.001, edge + 0.02))
    content.foregroundStyle(LinearGradient(
      stops: [
        .init(color: progress <= 0 ? ink : dried, location: start),
        .init(color: progress >= 1 ? dried : ink, location: end),
      ],
      startPoint: .leading, endPoint: .trailing
    ))
  }
}

extension View {
  func inkWipe(finished: Bool) -> some View {
    modifier(InkWipe(finished: finished))
  }
}

/// A new issue of The Edition being delivered: the first time you see this week's issue, it
/// drops in from above with a slight tilt and settles like a paper landing on the mat, and its
/// "New" is stamped on. It plays once per issue.
enum EditionDelivery {
  private static let key = "editionDelivered"

  /// Whether this issue hasn't been delivered on this device yet.
  static func isPending(_ date: String?) -> Bool {
    guard let date else { return false }
    return UserDefaults.standard.string(forKey: key) != date
  }

  static func markDelivered(_ date: String?) {
    guard let date else { return }
    UserDefaults.standard.set(date, forKey: key)
  }
}

private struct PaperDrop: ViewModifier {
  let date: String?
  let fresh: Bool
  @State private var pending: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(date: String?, fresh: Bool) {
    self.date = date
    self.fresh = fresh
    _pending = State(initialValue: fresh && EditionDelivery.isPending(date))
  }

  func body(content: Content) -> some View {
    content
      .opacity(pending ? 0 : 1)
      .rotationEffect(.degrees(pending && !reduceMotion ? -6 : 0), anchor: .topLeading)
      .offset(y: pending && !reduceMotion ? -30 : 0)
      .onAppear(perform: deliver)
      // An issue that comes out while this is already on screen.
      .onChange(of: fresh) { _, now in
        guard now, EditionDelivery.isPending(date) else { return }
        var still = Transaction()
        still.disablesAnimations = true
        withTransaction(still) { pending = true }
        Task {
          try? await Task.sleep(for: .milliseconds(50))
          deliver()
        }
      }
  }

  private func deliver() {
    guard pending else { return }
    EditionDelivery.markDelivered(date)
    withAnimation((reduceMotion ? StashMotion.fade : .spring(duration: 0.65, bounce: 0.38)).delay(0.3)) {
      pending = false
    }
    #if os(iOS)
    if !reduceMotion {
      Task {
        try? await Task.sleep(for: .seconds(0.55))
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
      }
    }
    #endif
  }
}

private struct StampIn: ViewModifier {
  @State private var pending: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(date: String?) {
    _pending = State(initialValue: EditionDelivery.isPending(date))
  }

  func body(content: Content) -> some View {
    content
      .opacity(pending ? 0 : 1)
      .scaleEffect(pending && !reduceMotion ? 2.2 : 1)
      .rotationEffect(.degrees(pending && !reduceMotion ? -10 : 0))
      .onAppear {
        guard pending else { return }
        withAnimation((reduceMotion ? StashMotion.fade : .spring(duration: 0.4, bounce: 0.3)).delay(0.75)) {
          pending = false
        }
      }
  }
}

extension View {
  /// Drops a new Edition in the first time this week's issue is seen.
  func editionDelivery(date: String?, fresh: Bool) -> some View {
    modifier(PaperDrop(date: date, fresh: fresh))
  }

  /// Stamps a label on just after the issue lands.
  func editionStamp(date: String?) -> some View {
    modifier(StampIn(date: date))
  }
}
