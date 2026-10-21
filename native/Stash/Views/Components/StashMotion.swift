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
