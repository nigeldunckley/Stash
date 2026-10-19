import SwiftUI

/// The swallowtail ribbon from the logo's S: Stash's mark for "your place" and "saved".
struct Ribbon: Shape {
  func path(in rect: CGRect) -> Path {
    // Drawn in a 14 × 40 box and scaled to fit.
    let x = rect.width / 14, y = rect.height / 40
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.minX + 14 * x, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.minX + 14 * x, y: rect.minY + 40 * y))
    path.addLine(to: CGPoint(x: rect.minX + 7 * x, y: rect.minY + 34 * y))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + 40 * y))
    path.closeSubpath()
    return path
  }
}

/// The ribbon as a 16pt sidebar glyph, to sit beside 15pt SF Symbols.
struct RibbonIcon: View {
  /// Orange, as a save lands; otherwise the row's own colour.
  var lit = false

  var body: some View {
    RibbonGlyph()
      .fill(lit ? AnyShapeStyle(Color.stAccent) : AnyShapeStyle(ForegroundStyle()))
      .frame(width: 16, height: 16)
      .offset(y: 1)
  }
}

private struct RibbonGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 16
    var path = Path()
    path.move(to: CGPoint(x: 5 * s, y: 1.5 * s))
    path.addLine(to: CGPoint(x: 11 * s, y: 1.5 * s))
    path.addLine(to: CGPoint(x: 11 * s, y: 14.5 * s))
    path.addLine(to: CGPoint(x: 8 * s, y: 11.9 * s))
    path.addLine(to: CGPoint(x: 5 * s, y: 14.5 * s))
    path.closeSubpath()
    return path
  }
}

extension View {
  /// A small ribbon hanging from the top edge, 7 × 15, for something you're part way through.
  func placeRibbon(_ shown: Bool, inset: CGFloat = 14) -> some View {
    overlay(alignment: .topTrailing) {
      if shown {
        Ribbon()
          .fill(Color.stAccent)
          .frame(width: 7, height: 15)
          .padding(.trailing, inset)
          .accessibilityLabel("Part read")
      }
    }
  }
}

extension LibraryItem {
  /// Started but not finished: between 3% and 97%.
  var isPartRead: Bool { progress >= 0.03 && progress <= 0.97 }
}
