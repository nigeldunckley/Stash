import SwiftUI

/// A number in Geist Mono 11: muted, orange text for "new", or a solid orange badge as on the
/// web's Channels item.
struct Count: View {
  enum Style { case plain, accent, badge }

  let value: Int
  var style: Style = .plain

  init(_ value: Int, style: Style = .plain) {
    self.value = value
    self.style = style
  }

  var body: some View {
    let text = Text("\(value)").font(.mono(11, style == .badge ? .medium : .regular)).monospacedDigit()
    switch style {
    case .plain:
      text.foregroundStyle(Color.stMuted)
    case .accent:
      text.foregroundStyle(Color.stAccentText)
    case .badge:
      text
        .foregroundStyle(Color.stOnAccent)
        .padding(.horizontal, 6)
        .frame(minHeight: 18)
        .background(Color.stAccent, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
    }
  }
}
