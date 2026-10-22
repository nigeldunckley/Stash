import SwiftUI
import CoreText
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Stash's colours, copied from the web app's stitches.config.ts so the two can be checked
/// against each other: near-black ink, cool greys, 1pt lines and International Orange.
extension Color {
  /// The window and page background.
  static let stPage = Color(light: 0xFFFFFF, dark: 0x09090B)
  /// The sidebar panel.
  static let stPanel = Color(light: 0xFFFFFF, dark: 0x18181B)
  /// Lists, fields and buttons.
  static let stSurface = Color(light: 0xFFFFFF, dark: 0x111113)
  /// Hover, the selected row and image placeholders.
  static let stSunken = Color(light: 0xF4F4F5, dark: 0x18181B)
  /// The selected sidebar item and segmented option.
  static let stSelected = Color(light: 0xF4F4F5, dark: 0x27272A)
  /// Every 1pt border and divider.
  static let stLine = Color(light: 0xE4E4E7, dark: 0x27272A)
  static let stLineStrong = Color(light: 0xD4D4D8, dark: 0x3F3F46)
  /// Titles and selected text.
  static let stInk = Color(light: 0x09090B, dark: 0xFAFAFA)
  /// Labels and reading text.
  static let stInk2 = Color(light: 0x3F3F46, dark: 0xD4D4D8)
  /// Sources, counts and dates.
  static let stMuted = Color(light: 0x71717A, dark: 0xA1A1AA)
  /// Dots, badges, progress and the selection bar.
  static let stAccent = Color(light: 0xFF4F00, dark: 0xFF5A14)
  /// Orange that's readable as small text.
  static let stAccentText = Color(light: 0xC23A00, dark: 0xFF8A50)
  /// Text on an orange fill.
  static let stOnAccent = Color(hex: 0x09090B)

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

  init(hex: UInt32) {
    self.init(light: hex, dark: hex)
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

/// Corner radii: buttons, fields and thumbnails; sidebar items; lists, cards and video
/// thumbnails; the sidebar panel.
enum Radius {
  static let sm: CGFloat = 6
  static let item: CGFloat = 8
  static let md: CGFloat = 10
  static let lg: CGFloat = 14
}

// MARK: Type

/// Stash's three typefaces, bundled in Fonts/: Geist for the interface, Geist Mono for details
/// and Newsreader for titles and reading. On iPhone they grow with Dynamic Type.
extension Font {
  /// Interface text: buttons, labels, sources.
  static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
    stash(StashFace.geist(weight), size, style)
  }

  /// Ages, counts, lengths and caps labels.
  static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .caption) -> Font {
    stash(StashFace.geistMono(weight), size, style)
  }

  /// Titles and reading text.
  static func reading(_ size: CGFloat, _ weight: Font.Weight = .medium, italic: Bool = false, relativeTo style: Font.TextStyle = .body) -> Font {
    stash(StashFace.newsreader(weight, italic: italic), size, style)
  }

  private static func stash(_ name: String, _ size: CGFloat, _ style: Font.TextStyle) -> Font {
    #if os(iOS)
    return Font.custom(name, size: size, relativeTo: style)
    #else
    return Font.custom(name, fixedSize: size)
    #endif
  }

  // The type scale from the plan, shared by every screen.

  /// "Home", "Feeds": 26 / 600.
  static let stPageTitle = Font.ui(26, .semibold, relativeTo: .largeTitle)
  /// "New from your feeds", "Up next": 16 / 600.
  static let stSection = Font.ui(16, .semibold, relativeTo: .headline)
  /// The default for interface text.
  static let stBody = Font.ui(14, relativeTo: .body)
  /// Sources, buttons, segmented controls: 12.
  static let stSmall = Font.ui(12, relativeTo: .footnote)
  /// Ages, counts and lengths: mono 11.
  static let stDetail = Font.mono(11)
  /// The summary under a row's title: 12, as the web's caption.
  static let stExcerpt = Font.ui(12, relativeTo: .footnote)
  /// Caps labels such as "TODAY": mono 10.5 / 500, tracked +0.9.
  static let stLabel = Font.mono(11, .medium)
  /// Article titles in lists: Newsreader 17 / 500.
  static let stRowTitle = Font.reading(17, relativeTo: .headline)
  /// Video titles: 13.5 / 500.
  static let stVideoTitle = Font.ui(13.5, .medium, relativeTo: .subheadline)
}

/// Tracking for each step of the type scale, in points.
enum Tracking {
  static let pageTitle: CGFloat = -0.73
  static let section: CGFloat = -0.16
  static let rowTitle: CGFloat = -0.1
  static let label: CGFloat = 0.9
}

/// The PostScript names of the bundled faces. Each weight is its own file, so text never
/// falls back to a synthesised bold.
enum StashFace {
  static func geist(_ weight: Font.Weight) -> String {
    switch weight {
    case .bold, .heavy, .black: return "Geist-Bold"
    case .semibold: return "Geist-SemiBold"
    case .medium: return "Geist-Medium"
    default: return "Geist-Regular"
    }
  }

  static func geistMono(_ weight: Font.Weight) -> String {
    switch weight {
    case .medium, .semibold, .bold, .heavy, .black: return "GeistMono-Medium"
    default: return "GeistMono-Regular"
    }
  }

  static func newsreader(_ weight: Font.Weight, italic: Bool) -> String {
    if italic {
      return [.medium, .semibold, .bold].contains(weight) ? "Newsreader-MediumItalic" : "Newsreader-Italic"
    }
    if [.semibold, .bold, .heavy, .black].contains(weight) { return "Newsreader-SemiBold" }
    return weight == .medium ? "Newsreader-Medium" : "Newsreader-Regular"
  }
}

enum StashFonts {
  /// Registers the fonts in the app bundle. Called once at launch, before any text is drawn.
  static func register() {
    guard let root = Bundle.main.resourceURL,
          let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
    else { return }
    for case let url as URL in files where url.pathExtension == "ttf" {
      let name = url.lastPathComponent
      guard name.hasPrefix("Geist") || name.hasPrefix("Newsreader") else { continue }
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
    #if os(iOS)
    styleSystemBars()
    #endif
  }

  #if os(iOS)
  /// Navigation titles and tab labels are drawn by UIKit, so they're given Geist here.
  private static func styleSystemBars() {
    func geist(_ name: String, _ size: CGFloat, _ style: UIFont.TextStyle) -> UIFont? {
      UIFont(name: name, size: size).map { UIFontMetrics(forTextStyle: style).scaledFont(for: $0) }
    }
    let bar = UINavigationBar.appearance()
    if let title = geist("Geist-SemiBold", 17, .headline) {
      bar.titleTextAttributes = [.font: title]
    }
    if let large = geist("Geist-SemiBold", 32, .largeTitle) {
      bar.largeTitleTextAttributes = [.font: large, .kern: -0.9]
    }
    if let tab = geist("Geist-Medium", 10, .caption2) {
      UITabBarItem.appearance().setTitleTextAttributes([.font: tab], for: .normal)
    }
    if let segment = geist("Geist-Medium", 13, .subheadline) {
      UISegmentedControl.appearance().setTitleTextAttributes([.font: segment], for: .normal)
    }
  }
  #endif
}

extension Text {
  /// A caps label in Geist Mono, as the web uses for "TODAY" and "READ".
  func stashLabel() -> Text {
    font(.stLabel).tracking(Tracking.label)
  }
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
