import SwiftUI
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Stash's colours and type, matching the web app: near-black ink, cool greys,
/// fine borders and International Orange.
extension Color {
  static let stashAccent = Color(red: 1, green: 79 / 255, blue: 0)
  /// Orange that's readable as small text on white.
  static let stashAccentText = Color(light: 0xC23A00, dark: 0xFF4F00)
  static let stashInk = Color(light: 0x09090B, dark: 0xFAFAFA)
  static let stashMuted = Color(light: 0x71717A, dark: 0xA1A1AA)
  static let stashBorder = Color(light: 0xE4E4E7, dark: 0x27272A)
  static let stashSurface = Color(light: 0xF4F4F5, dark: 0x18181B)
  static let stashBackground = Color(light: 0xFFFFFF, dark: 0x09090B)

  init(light: UInt32, dark: UInt32) {
    #if os(iOS)
    self.init(uiColor: UIColor { traits in
      UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
    })
    #else
    self.init(nsColor: NSColor(name: nil) { appearance in
      let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
      return NSColor(hex: isDark ? dark : light)
    })
    #endif
  }
}

#if os(iOS)
private extension UIColor {
  convenience init(hex: UInt32) {
    self.init(
      red: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
}
#else
private extension NSColor {
  convenience init(hex: UInt32) {
    self.init(
      srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
      green: CGFloat((hex >> 8) & 0xFF) / 255,
      blue: CGFloat(hex & 0xFF) / 255,
      alpha: 1
    )
  }
}
#endif

extension Font {
  /// Serif headlines, as in the web app's lists and reader.
  static func stashTitle(_ style: Font.TextStyle = .headline) -> Font {
    .system(style, design: .serif).weight(.semibold)
  }

  /// Small monospaced details: sources, times, counts.
  static let stashDetail = Font.system(.caption, design: .monospaced)
}

/// "3h", "2d", "14 Oct": the short ages used across Stash.
func shortAge(_ date: Date?, now: Date = .now) -> String {
  guard let date else { return "" }
  let seconds = now.timeIntervalSince(date)
  if seconds < 60 { return "now" }
  if seconds < 3600 { return "\(Int(seconds / 60))m" }
  if seconds < 86_400 { return "\(Int(seconds / 3600))h" }
  if seconds < 7 * 86_400 { return "\(Int(seconds / 86_400))d" }
  return date.formatted(.dateTime.day().month(.abbreviated))
}
