import SwiftUI

extension View {
  /// Liquid Glass behind a floating control (the mini player, a toast, "N new") on iPhone and
  /// iPad with iOS 26, when built with Xcode 26. Earlier systems, older Xcodes and the Mac keep
  /// Stash's own solid card: `fallback` fill, a fine border and a soft shadow.
  @ViewBuilder
  func stashGlass<S: InsettableShape>(
    in shape: S, tint: Color? = nil, interactive: Bool = false,
    fallback: Color = .stPanel, border: Bool = true, shadow: CGFloat = 12
  ) -> some View {
    #if os(iOS) && compiler(>=6.2)
    if #available(iOS 26.0, *) {
      glassEffect(
        interactive ? Glass.regular.tint(tint).interactive() : Glass.regular.tint(tint),
        in: shape
      )
    } else {
      solidCard(in: shape, fallback: fallback, border: border, shadow: shadow)
    }
    #else
    solidCard(in: shape, fallback: fallback, border: border, shadow: shadow)
    #endif
  }

  private func solidCard<S: InsettableShape>(in shape: S, fallback: Color, border: Bool, shadow: CGFloat) -> some View {
    background(fallback, in: shape)
      .overlay(shape.strokeBorder(border ? Color.stLine : .clear, lineWidth: 1))
      .shadow(color: .black.opacity(0.14), radius: shadow, y: shadow / 2)
  }
}
