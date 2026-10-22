import SwiftUI

/// One post on the Wire: unseen dot, 24-hour time, source in caps, headline, length. On iPhone,
/// time and source above the headline. A post that arrives while you watch types itself in
/// behind an orange caret, on a warm tint that fades over a minute.
struct WireRow: View {
  let item: LibraryItem
  var subscriptionName: String?
  var unseen = false
  /// When it turned up while the list was open.
  var arrived: Date?
  var selected = false

  @State private var typed: Int?
  @State private var width: CGFloat = 600
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var source: String { (subscriptionName ?? item.source).uppercased() }
  private var time: String {
    guard let date = item.date else { return "--:--" }
    let parts = Calendar.current.dateComponents([.hour, .minute], from: date)
    return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
  }

  var body: some View {
    Group {
      if let arrived, Date.now.timeIntervalSince(arrived) < 60 {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          content.background(tint(now: context.date))
        }
      } else {
        content
      }
    }
    .background(selected ? Color.stSunken : Color.clear)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
    .contentShape(Rectangle())
    .momentSource(item)
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .task(id: arrived) { await typeIn() }
  }

  @ViewBuilder
  private var content: some View {
    #if os(macOS)
    if width < 520 { stacked } else { wide }
    #else
    stacked
    #endif
  }

  /// Time, source and title in a row, on a wide Mac list.
  private var wide: some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Circle()
        .fill(unseen ? Color.stAccent : Color.clear)
        .frame(width: 6, height: 6)
      Text(time)
        .font(.mono(11.5))
        .monospacedDigit()
        .foregroundStyle(Color.stMuted)
      Text(source)
        .font(.mono(11, .medium))
        .tracking(0.8)
        .foregroundStyle(Color.stMuted)
        .lineLimit(1)
        .frame(width: 150, alignment: .leading)
      headline.frame(maxWidth: .infinity, alignment: .leading)
      if let minutes = item.readingMinutes {
        Text("\(minutes) MIN")
          .font(.mono(11))
          .foregroundStyle(Color.stMuted)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 8)
  }

  /// Time and source above the headline: iPhone, and narrow Mac lists.
  private var stacked: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 8) {
        if unseen { Circle().fill(Color.stAccent).frame(width: 6, height: 6) }
        Text(time).monospacedDigit()
        Text(source).tracking(0.8).lineLimit(1)
        Spacer(minLength: 0)
        if let minutes = item.readingMinutes { Text("\(minutes) MIN") }
      }
      .font(.mono(11, relativeTo: .caption2))
      .foregroundStyle(Color.stMuted)
      headline
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 9)
  }

  private var headline: some View {
    let title = item.title
    let shown = typed.map { String(title.prefix($0)) } ?? title
    return (Text(shown) + Text(typed != nil ? "▍" : "").foregroundColor(Color.stAccent))
      .font(.reading(16, .medium, relativeTo: .body))
      .foregroundStyle(Color.stInk)
      .lineLimit(2)
      .multilineTextAlignment(.leading)
  }

  /// The warm tint behind a new arrival, fading out over 60 seconds.
  private func tint(now: Date) -> Color {
    guard let arrived else { return .clear }
    let left = 1 - now.timeIntervalSince(arrived) / 60
    return left > 0 ? Color.stAccent.opacity(0.08 * left) : .clear
  }

  /// Types the headline in, letter by letter, for something that's just arrived.
  private func typeIn() async {
    guard let arrived, Date.now.timeIntervalSince(arrived) < 5, !reduceMotion else { return }
    let title = item.title
    let step = min(0.035, 1.4 / Double(max(title.count, 1)))
    for count in 0...title.count {
      typed = count
      try? await Task.sleep(for: .seconds(step))
      if Task.isCancelled { break }
    }
    typed = nil
  }
}

/// "15:00" with a 1pt ink rule, starting each hour on the Wire.
struct HourMark: View {
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Rectangle().fill(Color.stInk).frame(height: 1)
      Text(label)
        .font(.mono(11, .medium))
        .tracking(0.8)
        .foregroundStyle(Color.stInk)
        .padding(.horizontal, 14)
        .padding(.bottom, 4)
    }
    .padding(.top, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The Wire's hour labels: "15:00" today, "YESTERDAY 15:00", then "MON 13 OCT 15:00".
func hourMark(_ date: Date?, now: Date = .now) -> String {
  guard let date else { return "EARLIER" }
  let calendar = Calendar.current
  let hour = String(format: "%02d:00", calendar.component(.hour, from: date))
  if calendar.isDateInToday(date) { return hour }
  if calendar.isDateInYesterday(date) { return "YESTERDAY \(hour)" }
  return "\(hourDayFormatter.string(from: date).uppercased()) \(hour)"
}

private let hourDayFormatter: DateFormatter = {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_GB")
  formatter.dateFormat = "EEE d MMM"
  return formatter
}()
