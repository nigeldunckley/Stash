import SwiftUI
import AudioToolbox
#if os(iOS)
import UIKit
#endif

/// Saving and archiving, made to feel physical: a card flies to Saved, a hairline to Archive,
/// with a soft sound (if turned on) and a tap on iPhone. Everything that saves or archives
/// tells this one place.
enum MomentKind: Hashable {
  case saved, archived
}

struct Moment: Identifiable, Equatable {
  let id = UUID()
  let kind: MomentKind
  let title: String
  /// Where it starts, in window coordinates, if the item is on screen.
  let source: CGRect?
}

@MainActor
@Observable
final class Moments {
  static let shared = Moments()

  /// The one moment flying now.
  private(set) var current: Moment?
  /// Goes up each time something lands, so the sidebar row can dip and show "+1".
  private(set) var landings: [MomentKind: Int] = [:]

  /// Where each list row is on screen, by item id, kept as rows lay out.
  @ObservationIgnored var rowFrames: [String: CGRect] = [:]
  /// Where the sidebar's Saved and Archive rows are.
  @ObservationIgnored var targets: [MomentKind: CGRect] = [:]

  func saved(_ item: LibraryItem? = nil, title: String? = nil) { post(.saved, item: item, title: title) }
  func archived(_ item: LibraryItem) { post(.archived, item: item, title: nil) }

  private func post(_ kind: MomentKind, item: LibraryItem?, title: String?) {
    let moment = Moment(kind: kind, title: title ?? item?.title ?? "", source: item.flatMap { rowFrames[$0.id] })
    current = moment
    Feedback.play(kind)
    let flight: Double = kind == .saved ? 0.36 : 0.38
    Task {
      try? await Task.sleep(for: .seconds(flight))
      landings[kind, default: 0] += 1
      #if os(iOS)
      if kind == .archived { Feedback.landed() }
      #endif
      try? await Task.sleep(for: .seconds(0.05))
      if current?.id == moment.id { current = nil }
    }
  }
}

extension View {
  /// Keeps the item's row position, so a save or archive can fly from it.
  func momentSource(_ item: LibraryItem) -> some View {
    #if os(macOS)
    onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
      Moments.shared.rowFrames[item.id] = frame
    }
    #else
    self
    #endif
  }

  /// Marks a sidebar row as where saves or archives land.
  func momentTarget(_ kind: MomentKind) -> some View {
    onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
      Moments.shared.targets[kind] = frame
    }
  }
}

/// The card or hairline in flight, drawn over the whole window.
struct MomentFlight: View {
  let moment: Moment
  let target: CGRect
  /// The overlay's own position in window coordinates.
  let origin: CGPoint

  @State private var flown = false
  @State private var faded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if let source = moment.source {
      let from = CGPoint(x: source.midX - origin.x, y: source.midY - origin.y)
      let to = CGPoint(x: target.midX - origin.x, y: target.midY - origin.y)
      Group {
        switch moment.kind {
        case .saved:
          Text(moment.title)
            .font(.reading(13, .medium))
            .foregroundStyle(Color.stInk)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(width: min(source.width, 360), height: 32, alignment: .leading)
            .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.stLineStrong, lineWidth: 1))
            .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
            .scaleEffect(flown ? 0.35 : 1)
        case .archived:
          Rectangle()
            .fill(Color.stInk)
            .frame(width: flown ? 40 : source.width, height: 1)
        }
      }
      .position(reduceMotion ? from : (flown ? to : from))
      .opacity(faded ? 0 : 1)
      .allowsHitTesting(false)
      .onAppear(perform: fly)
    }
  }

  private func fly() {
    if reduceMotion {
      withAnimation(.easeOut(duration: 0.15)) { faded = true }
      return
    }
    switch moment.kind {
    case .saved:
      withAnimation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.36)) { flown = true }
      withAnimation(.linear(duration: 0.12).delay(0.24)) { faded = true }
    case .archived:
      // The row folds to a hairline first, then the hairline goes to Archive.
      withAnimation(.timingCurve(0.32, 0.72, 0, 1, duration: 0.22).delay(0.16)) { flown = true }
      withAnimation(.linear(duration: 0.1).delay(0.3)) { faded = true }
    }
  }
}

/// A row folding to a 1pt ink hairline as it's archived.
struct FoldModifier: ViewModifier {
  let folded: Bool

  func body(content: Content) -> some View {
    content
      .opacity(folded ? 0 : 1)
      .scaleEffect(x: 1, y: folded ? 0.02 : 1, anchor: .center)
      .overlay {
        if folded { Rectangle().fill(Color.stInk).frame(height: 1) }
      }
  }
}

extension AnyTransition {
  /// Archiving: the row folds to a hairline. With Reduce Motion, a plain fade.
  static func fold(reduceMotion: Bool) -> AnyTransition {
    reduceMotion
      ? .opacity
      : .asymmetric(
        insertion: .opacity,
        removal: .modifier(active: FoldModifier(folded: true), identity: FoldModifier(folded: false))
      )
  }
}

/// The sidebar's ribbon, which turns orange and dips as a save lands on its row.
struct LandingRibbon: View {
  let kind: MomentKind
  @State private var lit = false
  @State private var dipped = false

  var body: some View {
    RibbonIcon(lit: lit)
      .offset(y: dipped ? 3 : 0)
      .onChange(of: Moments.shared.landings[kind] ?? 0) { _, _ in land() }
  }

  private func land() {
    withAnimation(.easeIn(duration: 0.12)) { lit = true; dipped = true }
    withAnimation(.spring(duration: 0.2).delay(0.12)) { dipped = false }
    withAnimation(.easeOut(duration: 0.4).delay(1.2)) { lit = false }
  }
}

/// "+1" beside a sidebar row for 1.2 seconds after something lands there.
struct LandingCount: View {
  let kind: MomentKind
  @State private var shown = false

  var body: some View {
    Text("+1")
      .font(.mono(11))
      .foregroundStyle(Color.stAccentText)
      .offset(y: shown ? 0 : 8)
      .opacity(shown ? 1 : 0)
      .onChange(of: Moments.shared.landings[kind] ?? 0) { _, _ in
        withAnimation(.snappy(duration: 0.24)) { shown = true }
        withAnimation(.easeOut(duration: 0.4).delay(1.2)) { shown = false }
      }
      .accessibilityHidden(true)
  }
}

/// The two sounds and the iPhone's taps.
enum Feedback {
  @MainActor private static var sounds: [MomentKind: SystemSoundID] = [:]

  @MainActor
  static func play(_ kind: MomentKind) {
    #if os(iOS)
    switch kind {
    case .saved: UIImpactFeedbackGenerator(style: .light).impactOccurred()
    case .archived: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    #endif
    // Off unless turned on in Settings. System sounds follow the iPhone's silent switch.
    guard UserDefaults.standard.bool(forKey: "sounds"), let sound = sound(kind) else { return }
    AudioServicesPlaySystemSound(sound)
  }

  #if os(iOS)
  /// The archive landing.
  @MainActor
  static func landed() {
    UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.6)
  }
  #endif

  @MainActor
  private static func sound(_ kind: MomentKind) -> SystemSoundID? {
    if let sound = sounds[kind] { return sound }
    let name = kind == .saved ? "save" : "archive"
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return nil }
    var id: SystemSoundID = 0
    guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == noErr else { return nil }
    sounds[kind] = id
    return id
  }
}
