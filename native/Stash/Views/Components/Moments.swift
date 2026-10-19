import SwiftUI
import AudioToolbox
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Saving and archiving, made to feel physical: the row lifts off as a card and swooshes along
/// a curve into its place in the sidebar (Saved, Watch's Saved or Archive; on iPhone, its tab),
/// with a soft sound (if turned on) and a tap on iPhone. Everything that saves or archives
/// tells this one place.
enum MomentKind: Hashable {
  case saved, savedVideo, archived
}

struct Moment: Identifiable, Equatable {
  let id = UUID()
  let kind: MomentKind
  let title: String
  /// The source line under the title on the flying card.
  var detail: String = ""
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
  /// Where the sidebar's Saved, Watch Saved and Archive rows are.
  @ObservationIgnored var targets: [MomentKind: CGRect] = [:]

  func saved(_ item: LibraryItem? = nil, title: String? = nil) {
    post(item.map(Watch.isVideo) == true ? .savedVideo : .saved, item: item, title: title)
  }
  func archived(_ item: LibraryItem) { post(.archived, item: item, title: nil) }

  /// How long a flight takes, from lift-off to landing.
  static let flightTime = 0.52

  private static var reduceMotion: Bool {
    #if os(iOS)
    UIAccessibility.isReduceMotionEnabled
    #else
    NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    #endif
  }

  private func post(_ kind: MomentKind, item: LibraryItem?, title: String?) {
    let moment = Moment(
      kind: kind, title: title ?? item?.title ?? "", detail: item?.source ?? "",
      source: item.flatMap { rowFrames[$0.id] }
    )
    current = moment
    Feedback.play(kind)
    let flight = Self.reduceMotion ? 0.15 : Self.flightTime
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
    onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
      Moments.shared.rowFrames[item.id] = frame
    }
  }

  /// Marks a sidebar row as where saves or archives land.
  func momentTarget(_ kind: MomentKind) -> some View {
    onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
      Moments.shared.targets[kind] = frame
    }
  }
}

/// The row, lifted off as a card, swooshing along a curve into its place in the sidebar: it
/// leans into the turn, shrinks as it goes and leaves a short blurred trail, then lands with the
/// ribbon dip and "+1" on the row. With Reduce Motion, it just fades where it was.
struct MomentFlight: View {
  let moment: Moment
  let target: CGRect
  /// The overlay's own position in window coordinates.
  let origin: CGPoint

  @State private var progress: CGFloat = 0
  @State private var faded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if let source = moment.source {
      let path = FlightPath(
        from: CGPoint(x: source.midX - origin.x, y: source.midY - origin.y),
        to: CGPoint(x: target.midX - origin.x, y: target.midY - origin.y),
        width: min(source.width, 380)
      )
      ZStack {
        if !reduceMotion {
          // The trail: fainter, softer copies a moment behind.
          ForEach([3, 2, 1], id: \.self) { step in
            card(width: path.width)
              .modifier(FlightStep(path: path, progress: progress, lag: CGFloat(step) * 0.07))
              .opacity(0.22 - Double(step) * 0.05)
              .blur(radius: CGFloat(step) * 2.5)
          }
        }
        card(width: path.width)
          .shadow(color: .black.opacity(0.16), radius: 18, y: 10)
          .modifier(FlightStep(path: path, progress: reduceMotion ? 0 : progress, lag: 0))
      }
      .opacity(faded ? 0 : 1)
      .allowsHitTesting(false)
      .onAppear(perform: fly)
    }
  }

  /// The row as a card: its title, and the source in mono.
  private func card(width: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(moment.title)
        .font(.reading(14, .medium))
        .foregroundStyle(Color.stInk)
        .lineLimit(1)
      if !moment.detail.isEmpty {
        Text(moment.detail.uppercased())
          .font(.mono(9.5, .medium))
          .tracking(0.7)
          .foregroundStyle(moment.kind == .archived ? Color.stMuted : Color.stAccentText)
          .lineLimit(1)
      }
    }
    .padding(.horizontal, 14)
    .frame(width: width, height: 50, alignment: .leading)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.stLineStrong, lineWidth: 1))
  }

  private func fly() {
    if reduceMotion {
      withAnimation(.easeOut(duration: 0.15)) { faded = true }
      return
    }
    // Quick to leave, slowing into the landing.
    withAnimation(.timingCurve(0.55, 0, 0.15, 1, duration: Moments.flightTime)) { progress = 1 }
  }
}

/// The curve a flight takes: up and over towards the sidebar, like a toss.
struct FlightPath {
  let from: CGPoint
  let to: CGPoint
  let width: CGFloat

  /// Above both ends and a little towards the start, so the card arcs rather than slides.
  var control: CGPoint {
    CGPoint(x: to.x + (from.x - to.x) * 0.35, y: min(from.y, to.y) - max(60, abs(from.y - to.y) * 0.35))
  }

  func point(_ t: CGFloat) -> CGPoint {
    let u = 1 - t
    return CGPoint(
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y
    )
  }
}

/// Places the card along its flight as `progress` animates from 0 to 1.
private struct FlightStep: ViewModifier, Animatable {
  let path: FlightPath
  var progress: CGFloat
  /// How far behind the card this copy runs, for the trail.
  let lag: CGFloat

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func body(content: Content) -> some View {
    let t = lag > 0 ? max(0, (progress - lag) / (1 - lag)) : progress
    // Lifts off (a touch bigger) in the first tenth, then shrinks to a chip on the target.
    let lift = min(1, t / 0.1)
    let scale = t < 0.1 ? 1 + 0.04 * lift : 1.04 - 0.86 * ((t - 0.1) / 0.9)
    // Leans into the curve and straightens as it lands.
    let lean = -9 * sin(Double(t) * .pi)
    let fade = t > 0.82 ? 1 - Double((t - 0.82) / 0.18) : 1
    content
      .scaleEffect(scale)
      .rotationEffect(.degrees(lean))
      .position(path.point(t))
      .opacity(fade)
  }
}

/// The row leaving its list as its card lifts off: a quick fade while the list closes the gap.
extension AnyTransition {
  static func fold(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .asymmetric(insertion: .opacity, removal: .opacity.animation(.easeOut(duration: 0.1)))
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
    case .saved, .savedVideo: UIImpactFeedbackGenerator(style: .light).impactOccurred()
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
    let name = kind == .archived ? "archive" : "save"
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return nil }
    var id: SystemSoundID = 0
    guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == noErr else { return nil }
    sounds[kind] = id
    return id
  }
}
