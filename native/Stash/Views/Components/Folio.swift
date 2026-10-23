import SwiftUI

/// What a page's folio says: the date first, then a few facts, with an optional live
/// "checked 2 min ago" and something on the right.
struct FolioContent {
  var items: [String]
  /// Adds when your feeds were last checked, kept up to date as the page sits open.
  var checked = false
  var right: String?

  /// "MONDAY 19 OCTOBER".
  static var today: String { stamp("EEEE d MMMM") }
  /// "MON 19 OCT", for iPhone.
  static var shortToday: String { stamp("EEE d MMM") }

  private static func stamp(_ format: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.dateFormat = format
    return formatter.string(from: .now).uppercased()
  }

  /// "VOL. 1 · DAY 13": Stash went live on 7 October 2026, day 1.
  static var volumeAndDay: String {
    let start = DateComponents(calendar: .current, year: 2026, month: 10, day: 7).date ?? .now
    let days = (Calendar.current.dateComponents([.day], from: start, to: .now).day ?? 0) + 1
    return "VOL. 1 · DAY \(max(1, days))"
  }

  /// "6H 20M OF READING".
  static func readingTime(minutes: Int) -> String {
    let h = minutes / 60, m = minutes % 60
    return (h > 0 ? "\(h)H \(m)M" : "\(m)M") + " OF READING"
  }
}

/// Feed counts and when they were last checked, shared by every page's folio.
@MainActor
@Observable
final class FolioData {
  static let shared = FolioData()

  private(set) var feeds = 0
  private(set) var channels = 0
  private(set) var checked: Date?
  @ObservationIgnored private var loadedAt: Date?

  /// Loads at most every five minutes.
  func load() async {
    if let loadedAt, Date.now.timeIntervalSince(loadedAt) < 300 { return }
    loadedAt = .now
    guard let subscriptions = try? await Library.subscriptions() else { loadedAt = nil; return }
    feeds = subscriptions.filter { !$0.isYouTube }.count
    channels = subscriptions.filter(\.isYouTube).count
    checked = subscriptions.compactMap(\.lastFetchedAt).max()
  }
}

/// The mono line above a page title, like the folio line on a printed page, over a double rule.
struct FolioView: View {
  let content: FolioContent

  private var data: FolioData { FolioData.shared }

  var body: some View {
    TimelineView(.periodic(from: .now, by: 30)) { context in
      VStack(alignment: .leading, spacing: 10) {
        // As much as fits: everything, then without the right-hand count, then fewer details.
        ViewThatFits(in: .horizontal) {
          ForEach(variants, id: \.self) { variant in
            HStack(spacing: 0) {
              line(now: context.date, parts: Array(parts.prefix(variant.parts)), checked: variant.checked)
              Spacer(minLength: 12)
              #if os(macOS)
              if variant.right, let right = content.right {
                Text(right).foregroundStyle(Color.stMuted).rolls(right)
              }
              #endif
            }
          }
        }
        .font(.mono(11, .medium))
        .tracking(0.9)
        .lineLimit(1)
        .monospacedDigit()

        VStack(spacing: 1) {
          Rectangle().fill(Color.stInk).frame(height: 1)
          Rectangle().fill(Color.stLine).frame(height: 1)
        }
      }
    }
    .accessibilityElement(children: .combine)
    .task { await data.load() }
  }

  private var parts: [String] {
    #if os(macOS)
    return content.items
    #else
    // iPhone has room for the short date and one live detail.
    let detail = content.checked ? nil : content.items.dropFirst().first
    return [FolioContent.shortToday] + (detail.map { [$0] } ?? [])
    #endif
  }

  private struct Variant: Hashable {
    let parts: Int
    let checked: Bool
    let right: Bool
  }

  /// From the full line down to just the date.
  private var variants: [Variant] {
    var result = [Variant(parts: parts.count, checked: true, right: true),
                  Variant(parts: parts.count, checked: true, right: false)]
    for count in stride(from: parts.count, through: 1, by: -1) {
      result.append(Variant(parts: count, checked: false, right: false))
    }
    return result
  }

  private func line(now: Date, parts: [String], checked showChecked: Bool) -> some View {
    HStack(spacing: 0) {
      ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
        Text(index == 0 ? part : " · \(part)")
          .foregroundStyle(index == 0 ? Color.stInk : Color.stMuted)
          .fixedSize()
          .rolls(part)
      }
      if showChecked, content.checked, let checked = data.checked {
        Text(" · \(checkedText(checked, now: now))").foregroundStyle(Color.stMuted).fixedSize()
        if now.timeIntervalSince(checked) < 600 {
          Circle().fill(Color.stAccent).frame(width: 6, height: 6).padding(.leading, 6)
        }
      }
    }
  }

  private func checkedText(_ date: Date, now: Date) -> String {
    let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
    #if os(macOS)
    if minutes < 1 { return "CHECKED JUST NOW" }
    if minutes < 60 { return "CHECKED \(minutes) MIN AGO" }
    return "CHECKED \(minutes / 60)H AGO"
    #else
    if minutes < 1 { return "CHECKED NOW" }
    if minutes < 60 { return "CHECKED \(minutes)M AGO" }
    return "CHECKED \(minutes / 60)H AGO"
    #endif
  }
}
