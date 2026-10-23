import SwiftUI
import AudioToolbox
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Saving, archiving and deleting, made physical, as on the web: the item's row sweeps into
/// its place in the navigation (Saved, Watch Saved, Archive or Trash), which takes it in.
enum MomentKind: Hashable {
  case saved, savedVideo, archived, trashed
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
  /// Goes up each time something lands, so the navigation entry can take it in.
  private(set) var landings: [MomentKind: Int] = [:]

  /// Where each list row is on screen, by item id, kept as rows lay out.
  @ObservationIgnored var rowFrames: [String: CGRect] = [:]
  /// Where the icons of the sidebar's Saved, Watch Saved, Archive and Trash entries are.
  @ObservationIgnored var targets: [MomentKind: CGRect] = [:]

  func saved(_ item: LibraryItem? = nil, title: String? = nil) {
    post(item.map(Watch.isVideo) == true ? .savedVideo : .saved, item: item, title: title)
  }
  func archived(_ item: LibraryItem) { post(.archived, item: item, title: nil) }
  func trashed(_ item: LibraryItem) { post(.trashed, item: item, title: nil) }

  /// The web's timings: a quick lift off the list, then the sweep.
  static let liftTime = 0.09
  static let travelTime = 0.47
  static var flightTime: Double { liftTime + travelTime }

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
      if kind != .saved && kind != .savedVideo { Feedback.landed() }
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

  /// Marks a sidebar entry's icon as where saves, archives or deletes land. A folded group's
  /// entries aren't there to land on, so nothing flies to them.
  func momentTarget(_ kind: MomentKind) -> some View {
    onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
      Moments.shared.targets[kind] = frame
    }
    .onDisappear { Moments.shared.targets[kind] = nil }
  }
}

/// The swoosh: a copy of the row lifts off the list, sweeps along a curve to the navigation
/// entry, tilting, blurring and shrinking to a sliver as it goes, with a fine accent trail
/// behind it, and is drawn into the entry's icon. Reduce Motion fades it in place.
struct MomentFlight: View {
  let moment: Moment
  let target: CGRect
  /// The overlay's own position in window coordinates.
  let origin: CGPoint

  @State private var lift: CGFloat = 0
  @State private var progress: CGFloat = 0
  @State private var faded = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if let source = moment.source {
      let path = FlightPath(
        from: CGPoint(x: source.midX - origin.x, y: source.midY - origin.y),
        to: CGPoint(x: target.midX - origin.x, y: target.midY - origin.y),
        width: min(source.width, 560)
      )
      ZStack {
        if !reduceMotion {
          FlightTrail(flight: path, progress: progress)
            .stroke(Color.stAccent, style: StrokeStyle(lineWidth: 2, lineCap: .round))
            .modifier(TrailFade(progress: progress))
        }
        card(width: path.width)
          .modifier(FlightStep(path: path, lift: lift, progress: reduceMotion ? 0 : progress))
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
          .font(.mono(11, .medium))
          .tracking(0.7)
          .foregroundStyle(moment.kind == .saved || moment.kind == .savedVideo ? Color.stAccentText : Color.stMuted)
          .lineLimit(1)
      }
    }
    .padding(.horizontal, 14)
    .frame(width: width, height: 50, alignment: .leading)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }

  private func fly() {
    if reduceMotion {
      withAnimation(.easeOut(duration: 0.15)) { faded = true }
      return
    }
    withAnimation(.timingCurve(0.2, 0, 0, 1, duration: Moments.liftTime)) { lift = 1 }
    // Slow out of the lift, fast through the middle, drawn in at the end.
    withAnimation(.timingCurve(0.55, 0.05, 0.25, 1, duration: Moments.travelTime).delay(Moments.liftTime)) {
      progress = 1
    }
  }
}

/// The curve from the row to the entry's icon.
struct FlightPath {
  let from: CGPoint
  let to: CGPoint
  let width: CGFloat

  /// It rises before it falls into the entry, more so for long trips, and stays on screen
  /// when the entry is at the top.
  var control: CGPoint {
    let dx = to.x - from.x
    return CGPoint(x: from.x + dx * 0.3, y: max(16, min(from.y, to.y) - 70 - abs(dx) * 0.08))
  }

  /// Leans the way it's going.
  var tilt: Double { to.x < from.x ? -5 : 5 }

  /// Shrinks to about 36pt wide on the icon.
  var endScale: CGFloat { max(0.04, 36 / max(width, 1)) }

  func point(_ t: CGFloat) -> CGPoint {
    let u = 1 - t
    return CGPoint(
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y
    )
  }

  var curve: Path {
    var path = Path()
    path.move(to: from)
    path.addQuadCurve(to: to, control: control)
    return path
  }

  /// Roughly how long the curve is.
  var length: CGFloat {
    var total: CGFloat = 0
    var last = from
    for step in 1...24 {
      let next = point(CGFloat(step) / 24)
      total += hypot(next.x - last.x, next.y - last.y)
      last = next
    }
    return total
  }
}

/// Places the card along its flight as `lift` and then `progress` animate from 0 to 1.
private struct FlightStep: ViewModifier, Animatable {
  let path: FlightPath
  var lift: CGFloat
  var progress: CGFloat

  var animatableData: AnimatablePair<CGFloat, CGFloat> {
    get { AnimatablePair(lift, progress) }
    set { lift = newValue.first; progress = newValue.second }
  }

  func body(content: Content) -> some View {
    let u = progress
    let at = path.point(u)
    // Holds its size through the rise of the curve, then is drawn in.
    let scale = 1 + 0.025 * lift + (path.endScale - 1.025) * pow(u, 1.7)
    let rotation = path.tilt * sin(.pi * min(Double(u) * 1.15, 1))
    let blur = 1.4 * sin(.pi * u)
    let opacity = u < 0.82 ? 1 : 1 - Double((u - 0.82) / 0.18)
    content
      .shadow(color: .black.opacity(0.32 * lift), radius: 20, y: 18 * lift)
      .scaleEffect(scale)
      .rotationEffect(.degrees(rotation))
      .blur(radius: blur)
      .position(x: at.x, y: at.y - 3 * lift * (1 - u))
      .opacity(opacity)
  }
}

/// The comet's tail: a short stretch of the curve just behind the card.
private struct FlightTrail: Shape {
  let flight: FlightPath
  var progress: CGFloat

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func path(in rect: CGRect) -> Path {
    let length = flight.length
    guard length > 1 else { return Path() }
    let tail = min(140, length * 0.4) / length
    let head = progress
    let start = max(0, head - tail)
    guard head > start else { return Path() }
    return flight.curve.trimmedPath(from: start, to: min(1, head))
  }
}

/// The tail fades in to the middle of the trip and out again by the end.
private struct TrailFade: ViewModifier, Animatable {
  var progress: CGFloat

  var animatableData: CGFloat {
    get { progress }
    set { progress = newValue }
  }

  func body(content: Content) -> some View {
    content.opacity(0.7 * Double(1 - abs(progress - 0.5) * 2))
  }
}

/// The row leaving its list: the flying card has taken its place, so it goes at once and the
/// rows below slide up into the gap.
extension AnyTransition {
  static func fold(reduceMotion: Bool) -> AnyTransition {
    reduceMotion ? .opacity : .asymmetric(insertion: .opacity, removal: .opacity.animation(.linear(duration: 0.05)))
  }
}

extension StashMotion {
  /// How the rows below close the gap a row leaves, as on the web.
  static let closeGap = Animation.timingCurve(0.32, 0.72, 0, 1, duration: 0.34)
}

/// How a navigation entry takes an item in: a brief accent wash and a small give.
struct LandingSettle: ViewModifier {
  let kind: MomentKind?
  /// The row's own fill (selected or hovered), under the wash.
  let fill: Color
  let shape: RoundedRectangle

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private struct Value {
    var scale: CGFloat = 1
    var wash: Double = 0
  }

  func body(content: Content) -> some View {
    content.keyframeAnimator(initialValue: Value(), trigger: kind.map { Moments.shared.landings[$0] ?? 0 } ?? 0) { content, value in
      content
        .background(Color.stAccent.opacity(value.wash), in: shape)
        .background(fill, in: shape)
        .scaleEffect(value.scale)
    } keyframes: { _ in
      KeyframeTrack(\.scale) {
        MoveKeyframe(reduceMotion ? 1 : 0.97)
        CubicKeyframe(reduceMotion ? 1 : 1.015, duration: 0.19)
        CubicKeyframe(1, duration: 0.23)
      }
      KeyframeTrack(\.wash) {
        MoveKeyframe(0.14)
        LinearKeyframe(0, duration: 0.42)
      }
    }
  }
}

/// An entry's icon swallowing the item and springing back.
struct LandingSwallow: ViewModifier {
  let kind: MomentKind?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content.keyframeAnimator(initialValue: CGFloat(1), trigger: kind.map { Moments.shared.landings[$0] ?? 0 } ?? 0) { content, scale in
      content.scaleEffect(scale)
    } keyframes: { _ in
      KeyframeTrack {
        MoveKeyframe(CGFloat(1))
        CubicKeyframe(reduceMotion ? 1 : 0.72, duration: 0.1)
        SpringKeyframe(1, duration: 0.4, spring: .bouncy)
      }
    }
  }
}

/// The sidebar's ribbon, which turns orange and dips as a save lands on its row.
struct LandingRibbon: View {
  let kind: MomentKind
  @State private var lit = false
  @State private var dipped = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    RibbonIcon(lit: lit)
      .offset(y: dipped ? 3 : 0)
      .onChange(of: Moments.shared.landings[kind] ?? 0) { _, _ in land() }
  }

  private func land() {
    withAnimation(.easeIn(duration: 0.12)) { lit = true; dipped = !reduceMotion }
    withAnimation(.smooth(duration: 0.2, extraBounce: 0).delay(0.12)) { dipped = false }
    withAnimation(.easeOut(duration: 0.4).delay(1.2)) { lit = false }
  }
}

/// "+1" beside a sidebar row for 1.2 seconds after something lands there.
struct LandingCount: View {
  let kind: MomentKind
  @State private var shown = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Text("+1")
      .font(.mono(11))
      .foregroundStyle(Color.stAccentText)
      .offset(y: shown || reduceMotion ? 0 : 4)
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
    case .archived, .trashed: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    #endif
    // Off unless turned on in Settings. System sounds follow the iPhone's silent switch.
    guard UserDefaults.standard.bool(forKey: "sounds"), let sound = sound(kind) else { return }
    AudioServicesPlaySystemSound(sound)
  }

  #if os(iOS)
  /// An archive or delete landing.
  @MainActor
  static func landed() {
    UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.6)
  }
  #endif

  @MainActor
  private static func sound(_ kind: MomentKind) -> SystemSoundID? {
    if let sound = sounds[kind] { return sound }
    let name = kind == .archived || kind == .trashed ? "archive" : "save"
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return nil }
    var id: SystemSoundID = 0
    guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == noErr else { return nil }
    sounds[kind] = id
    return id
  }
}
