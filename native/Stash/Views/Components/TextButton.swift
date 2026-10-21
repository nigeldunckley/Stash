import SwiftUI

/// The web's small outlined button: 28pt tall, 12pt text, a 1pt line and 6pt corners.
/// `prominent` fills it with ink, for the one main action in a group.
struct TextButtonStyle: ButtonStyle {
  var prominent = false
  @Environment(\.isEnabled) private var isEnabled

  private var controlHeight: CGFloat {
    #if os(iOS)
    44
    #else
    28
    #endif
  }

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.ui(12, .medium, relativeTo: .footnote))
      .labelStyle(TextButtonLabelStyle())
      .foregroundStyle(prominent ? Color.stPage : Color.stInk)
      .padding(.horizontal, 10)
      .frame(minHeight: controlHeight)
      .background(background(configuration.isPressed), in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: Radius.sm, style: .continuous)
          .strokeBorder(prominent ? Color.stInk : Color.stLine, lineWidth: 1)
      )
      .opacity(isEnabled ? 1 : 0.45)
      .contentShape(Rectangle())
  }

  private func background(_ pressed: Bool) -> Color {
    if prominent { return Color.stInk.opacity(pressed ? 0.85 : 1) }
    return pressed ? Color.stSunken : Color.stSurface
  }
}

/// Icons in text buttons sit a little smaller than the text, 6pt from it.
private struct TextButtonLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon.imageScale(.small)
      configuration.title
    }
  }
}

extension ButtonStyle where Self == TextButtonStyle {
  static var text: TextButtonStyle { TextButtonStyle() }
  static var textProminent: TextButtonStyle { TextButtonStyle(prominent: true) }
}
