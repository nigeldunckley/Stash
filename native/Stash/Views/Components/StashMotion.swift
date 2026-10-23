import SwiftUI

/// Shared timings for changes that aren't already handled by a system control.
enum StashMotion {
  static let feedback = Animation.easeOut(duration: 0.14)
  static let change = Animation.smooth(duration: 0.2, extraBounce: 0)
  static let layout = Animation.smooth(duration: 0.25, extraBounce: 0)
  static let player = Animation.smooth(duration: 0.3, extraBounce: 0)
  static let fade = Animation.easeOut(duration: 0.15)

  static func layout(reduceMotion: Bool) -> Animation? { reduceMotion ? nil : layout }

  static var systemReduceMotion: Bool {
    #if os(iOS)
    UIAccessibility.isReduceMotionEnabled
    #else
    NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
    #endif
  }
}

private struct AutoHiddenSidebarKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
  var autoHiddenSidebar: Bool {
    get { self[AutoHiddenSidebarKey.self] }
    set { self[AutoHiddenSidebarKey.self] = newValue }
  }
}

extension View {
  /// Numbers that tick over like an odometer when they change: each digit rolls up as a count
  /// grows and down as it shrinks. Reduce Motion cross-fades instead.
  func rolls<Value: Equatable>(_ value: Value) -> some View {
    modifier(RollingNumber(value: value))
  }
}

private struct RollingNumber<Value: Equatable>: ViewModifier {
  let value: Value
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .contentTransition(reduceMotion ? .opacity : .numericText())
      .animation(reduceMotion ? .easeOut(duration: 0.15) : .snappy(duration: 0.4, extraBounce: 0.08), value: value)
  }
}
