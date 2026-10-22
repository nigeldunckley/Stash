import SwiftUI

/// "New from your feeds  186 unseen": a 16pt heading with an optional mono count, and
/// controls pushed to the right.
struct SectionHeading<Trailing: View>: View {
  let title: String
  var detail: String?
  var accentDetail = false
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Text(title)
        .font(.stSection)
        .tracking(Tracking.section)
        .foregroundStyle(Color.stInk)
        .lineLimit(1)
      if let detail {
        Text(detail)
          .font(.mono(12))
          .monospacedDigit()
          .foregroundStyle(accentDetail ? Color.stAccentText : Color.stMuted)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      HStack(spacing: 8) { trailing() }
    }
    .frame(minHeight: 32)
  }
}

extension SectionHeading where Trailing == EmptyView {
  init(title: String, detail: String? = nil, accentDetail: Bool = false) {
    self.init(title: title, detail: detail, accentDetail: accentDetail) { EmptyView() }
  }
}

/// A small caps label in Geist Mono, as the web uses for "TODAY" and section kickers.
struct Kicker: View {
  let text: String
  var accent = false

  init(_ text: String, accent: Bool = false) {
    self.text = text
    self.accent = accent
  }

  var body: some View {
    Text(text.uppercased())
      .stashLabel()
      .foregroundStyle(accent ? Color.stAccentText : Color.stMuted)
  }
}
