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
  case saved, savedVideo, archived, archivedVideo, trashed
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
  /// Videos aren't in the article Archive, so they don't fly there on Mac (on iPhone they go
  /// to the Watch tab).
  func archived(_ item: LibraryItem) { post(Watch.isVideo(item) ? .archivedVideo : .archived, item: item, title: nil) }
  func trashed(_ item: LibraryItem) { post(.trashed, item: item, title: nil) }
  /// Archived from the reader or The Sort, where the row isn't on screen: it lands without a flight.
  func archivedOffList(_ item: LibraryItem) {
    post(Watch.isVideo(item) ? .archivedVideo : .archived, item: item, title: nil, flies: false)
  }

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

  private func post(_ kind: MomentKind, item: LibraryItem?, title: String?, flies: Bool = true) {
    let moment = Moment(
      kind: kind, title: title ?? item?.title ?? "", detail: item?.source ?? "",
      source: flies ? item.flatMap { rowFrames[$0.id] } : nil
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
    modifier(MomentSource(item: item))
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

/// Only rows on the page you're looking at count, so a card never starts from a page kept
/// hidden underneath, and a row that's gone is forgotten.
private struct MomentSource: ViewModifier {
  let item: LibraryItem
  @Environment(\.isActivePage) private var isActivePage
  @State private var frame: CGRect?

  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { value in
        frame = value
        if isActivePage { Moments.shared.rowFrames[item.id] = value }
      }
      .onChange(of: isActivePage) { _, active in
        if !active { forget() } else if let frame { Moments.shared.rowFrames[item.id] = frame }
      }
      .onDisappear(perform: forget)
  }

  /// Forgets this row's place, unless another copy of the item (on the page in front) has
  /// since recorded its own.
  private func forget() {
    if Moments.shared.rowFrames[item.id] == frame { Moments.shared.rowFrames[item.id] = nil }
  }
}

/// The swoosh: a copy of the row lifts off the list, sweeps along a curve to the navigation
/// entry, tilting and shrinking to a sliver as it goes, with a fine accent trail behind it,
/// and is drawn into the entry's icon. Reduce Motion fades it in place.
///
/// It runs in Core Animation rather than SwiftUI, so it plays at the screen's full rate
/// (120fps on ProMotion) even while the list is busy closing the gap behind it.
struct MomentFlight: View {
  let moment: Moment?
  /// Where it lands, in window coordinates.
  let target: CGRect?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.displayScale) private var displayScale
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.self) private var environment

  var body: some View {
    GeometryReader { geometry in
      FlightCanvas(momentID: moment?.id, plan: plan(origin: geometry.frame(in: .global).origin))
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private func plan(origin: CGPoint) -> FlightPlan? {
    guard let moment, let target, let source = moment.source else { return nil }
    let path = FlightPath(
      from: CGPoint(x: source.midX - origin.x, y: source.midY - origin.y),
      to: CGPoint(x: target.midX - origin.x, y: target.midY - origin.y),
      width: min(source.width, 560)
    )
    let size = CGSize(width: path.width, height: min(max(source.height, 50), 120))
    let card = card(moment, size: size).environment(\.colorScheme, colorScheme)
    let scale = displayScale
    return FlightPlan(
      id: moment.id, path: path, size: size, scale: scale,
      accent: Color.stAccent.resolve(in: environment).cgColor,
      reduceMotion: reduceMotion,
      image: {
        // Drawn once, at the screen's own resolution, so the card stays crisp as it moves.
        let renderer = ImageRenderer(content: card)
        renderer.scale = scale
        return renderer.cgImage
      }
    )
  }

  /// The row as a card: its title, and the source in mono.
  private func card(_ moment: Moment, size: CGSize) -> some View {
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
    .frame(width: size.width, height: size.height, alignment: .leading)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}

/// Everything one flight needs, worked out in SwiftUI and handed to Core Animation.
struct FlightPlan {
  let id: UUID
  let path: FlightPath
  let size: CGSize
  let scale: CGFloat
  let accent: CGColor
  let reduceMotion: Bool
  let image: @MainActor () -> CGImage?
}

/// A CSS-style cubic-bezier easing curve.
struct Easing {
  let x1: Double, y1: Double, x2: Double, y2: Double

  /// Quick to lift, settling at the top.
  static let lift = Easing(x1: 0.2, y1: 0, x2: 0, y2: 1)
  /// Slow out of the lift, fast through the middle, drawn in at the end.
  static let sweep = Easing(x1: 0.55, y1: 0.05, x2: 0.25, y2: 1)

  private func bezier(_ s: Double, _ a: Double, _ b: Double) -> Double {
    let u = 1 - s
    return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s
  }

  func callAsFunction(_ t: Double) -> Double {
    guard t > 0 else { return 0 }
    guard t < 1 else { return 1 }
    var low = 0.0, high = 1.0, s = t
    for _ in 0..<32 {
      s = (low + high) / 2
      if bezier(s, x1, x2) < t { low = s } else { high = s }
    }
    return bezier(s, y1, y2)
  }
}

/// Hosts the flight's layers over the window.
private struct FlightCanvas {
  let momentID: UUID?
  let plan: FlightPlan?

  final class Coordinator {
    var lastID: UUID?
  }

  func makeCoordinator() -> Coordinator { Coordinator() }

  @MainActor
  fileprivate func start(in host: CALayer, coordinator: Coordinator) {
    // Each moment gets one chance: one whose row or entry isn't on screen lands without a
    // flight, rather than flying late once something turns up.
    guard let momentID, momentID != coordinator.lastID else { return }
    coordinator.lastID = momentID
    guard let plan else { return }
    // Drawn just after this update, not in the middle of it.
    Task { @MainActor in
      guard let image = plan.image() else { return }
      FlightAnimator.run(plan, image: image, in: host)
    }
  }
}

#if os(macOS)
/// Top-down like SwiftUI, and never in the way of a click.
final class FlightHostView: NSView {
  override init(frame: NSRect) {
    super.init(frame: frame)
    wantsLayer = true
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    wantsLayer = true
  }

  override var isFlipped: Bool { true }
  override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

extension FlightCanvas: NSViewRepresentable {
  func makeNSView(context: Context) -> FlightHostView { FlightHostView() }
  func updateNSView(_ view: FlightHostView, context: Context) {
    guard let layer = view.layer else { return }
    start(in: layer, coordinator: context.coordinator)
  }
}
#else
extension FlightCanvas: UIViewRepresentable {
  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.isUserInteractionEnabled = false
    view.backgroundColor = .clear
    return view
  }
  func updateUIView(_ view: UIView, context: Context) {
    start(in: view.layer, coordinator: context.coordinator)
  }
}
#endif

/// The flight as Core Animation keyframes, sampled from the web's curves at about 150 points a
/// second so the render server can play it at whatever rate the screen runs.
@MainActor
enum FlightAnimator {
  static func run(_ plan: FlightPlan, image: CGImage, in host: CALayer) {
    let path = plan.path
    let ghost = CALayer()
    ghost.contents = image
    ghost.contentsScale = plan.scale
    ghost.contentsGravity = .resize
    ghost.bounds = CGRect(origin: .zero, size: plan.size)
    ghost.position = path.from
    ghost.shadowPath = CGPath(roundedRect: ghost.bounds, cornerWidth: 10, cornerHeight: 10, transform: nil)
    ghost.shadowColor = CGColor(gray: 0.04, alpha: 1)
    ghost.shadowRadius = 16
    ghost.shadowOffset = CGSize(width: 0, height: 14)
    ghost.shadowOpacity = 0
    ghost.opacity = 0
    ghost.allowsEdgeAntialiasing = true

    let trail = CAShapeLayer()
    trail.path = path.curve.cgPath
    trail.fillColor = nil
    trail.strokeColor = plan.accent
    trail.lineWidth = 2
    trail.lineCap = .round
    trail.strokeStart = 0
    trail.strokeEnd = 0
    trail.opacity = 0
    trail.contentsScale = plan.scale

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    host.addSublayer(trail)
    host.addSublayer(ghost)
    CATransaction.setCompletionBlock {
      ghost.removeFromSuperlayer()
      trail.removeFromSuperlayer()
    }

    if plan.reduceMotion {
      ghost.add(keyframes("opacity", [1, 0], times: [0, 1], duration: 0.15), forKey: "fade")
      CATransaction.commit()
      return
    }

    let lift = Moments.liftTime, travel = Moments.travelTime, total = lift + travel
    let steps = Int((total * 150).rounded())
    let tail = Double(min(140, path.length * 0.4) / max(path.length, 1))
    var times: [Double] = []
    var positions: [CGPoint] = [], scales: [Double] = [], rotations: [Double] = []
    var opacities: [Double] = [], shadows: [Double] = []
    var heads: [Double] = [], tails: [Double] = [], glows: [Double] = []
    for step in 0...steps {
      let time = total * Double(step) / Double(steps)
      let raised = time < lift ? Easing.lift(time / lift) : 1
      let u = time < lift ? 0 : Easing.sweep((time - lift) / travel)
      let at = path.point(CGFloat(u))
      times.append(Double(step) / Double(steps))
      positions.append(CGPoint(x: at.x, y: at.y - 3 * CGFloat(raised * (1 - u))))
      // Holds its size through the rise of the curve, then is drawn in.
      scales.append(1 + 0.025 * raised + (Double(path.endScale) - 1.025) * pow(u, 1.7))
      rotations.append(path.tilt * .pi / 180 * sin(.pi * min(u * 1.15, 1)))
      opacities.append(u < 0.82 ? 1 : 1 - (u - 0.82) / 0.18)
      shadows.append(0.3 * raised)
      heads.append(u)
      tails.append(max(0, u - tail))
      glows.append(time < lift ? 0 : 0.7 * (1 - abs(u - 0.5) * 2))
    }

    #if os(macOS)
    let points = positions.map { NSValue(point: $0) }
    #else
    let points = positions.map { NSValue(cgPoint: $0) }
    #endif
    ghost.add(keyframes("position", points, times: times, duration: total), forKey: "position")
    ghost.add(keyframes("transform.scale", scales, times: times, duration: total), forKey: "scale")
    ghost.add(keyframes("transform.rotation.z", rotations, times: times, duration: total), forKey: "tilt")
    ghost.add(keyframes("opacity", opacities, times: times, duration: total), forKey: "opacity")
    ghost.add(keyframes("shadowOpacity", shadows, times: times, duration: total), forKey: "shadow")
    trail.add(keyframes("strokeEnd", heads, times: times, duration: total), forKey: "head")
    trail.add(keyframes("strokeStart", tails, times: times, duration: total), forKey: "tail")
    trail.add(keyframes("opacity", glows, times: times, duration: total), forKey: "glow")
    CATransaction.commit()
  }

  private static func keyframes(_ keyPath: String, _ values: [Any], times: [Double], duration: Double) -> CAKeyframeAnimation {
    let animation = CAKeyframeAnimation(keyPath: keyPath)
    animation.values = values
    animation.keyTimes = times.map { NSNumber(value: $0) }
    animation.duration = duration
    animation.calculationMode = .linear
    animation.fillMode = .forwards
    animation.isRemovedOnCompletion = false
    animation.preferredFrameRateRange = CAFrameRateRange(minimum: 80, maximum: 120, preferred: 120)
    return animation
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
    case .archived, .archivedVideo, .trashed: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
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
    let name = kind == .saved || kind == .savedVideo ? "save" : "archive"
    guard let url = Bundle.main.url(forResource: name, withExtension: "wav") else { return nil }
    var id: SystemSoundID = 0
    guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == noErr else { return nil }
    sounds[kind] = id
    return id
  }
}
