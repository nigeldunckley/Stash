import SwiftUI

/// An image that fades in once it loads, over Stash's sunken grey.
struct FadeImage: View {
  let url: URL?
  var contentMode: ContentMode = .fill

  var body: some View {
    AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
      if let image = phase.image {
        image.resizable().aspectRatio(contentMode: contentMode).transition(.opacity)
      } else {
        Color.stSunken
      }
    }
  }
}

/// Grey placeholder rows while a list loads, in place of a spinner, as on the web.
struct SkeletonRows: View {
  var count = 6

  @State private var pulse = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isActivePage) private var isActivePage

  var body: some View {
    VStack(spacing: 0) {
      ForEach(0..<count, id: \.self) { index in
        HStack(spacing: 12) {
          RoundedRectangle(cornerRadius: 4).frame(width: 18, height: 18)
          VStack(alignment: .leading, spacing: 7) {
            RoundedRectangle(cornerRadius: 3).frame(height: 12).frame(maxWidth: index.isMultiple(of: 2) ? 420 : 320)
            RoundedRectangle(cornerRadius: 3).frame(width: 110, height: 9)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          RoundedRectangle(cornerRadius: Radius.sm).frame(width: 72, height: 48)
        }
        .foregroundStyle(Color.stSunken)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .frame(minHeight: 68)
        .overlay(alignment: .bottom) {
          if index < count - 1 { Rectangle().fill(Color.stLine).frame(height: 1) }
        }
      }
    }
    .opacity(pulse ? 0.55 : 1)
    .animation(reduceMotion || !isActivePage ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
    .onAppear { pulse = !reduceMotion && isActivePage }
    .onChange(of: reduceMotion) { _, value in pulse = !value && isActivePage }
    .onChange(of: isActivePage) { _, active in pulse = active && !reduceMotion }
    .onDisappear { pulse = false }
    .accessibilityLabel("Loading")
  }
}

/// A bordered box with rounded corners, as the web draws its lists.
struct ListBox<Content: View>: View {
  @ViewBuilder var content: () -> Content

  var body: some View {
    LazyVStack(spacing: 0) { content() }
      .background(Color.stSurface)
      .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}

/// Grey placeholder cards while a grid loads.
struct SkeletonCards: View {
  var count = 6
  var minWidth: CGFloat = 300
  var height: CGFloat = 170

  @State private var pulse = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.isActivePage) private var isActivePage

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: minWidth), spacing: 18, alignment: .top)], spacing: 18) {
      ForEach(0..<count, id: \.self) { _ in
        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
          .fill(Color.stSunken)
          .frame(height: height)
      }
    }
    .opacity(pulse ? 0.55 : 1)
    .animation(reduceMotion || !isActivePage ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
    .onAppear { pulse = !reduceMotion && isActivePage }
    .onChange(of: reduceMotion) { _, value in pulse = !value && isActivePage }
    .onChange(of: isActivePage) { _, active in pulse = active && !reduceMotion }
    .onDisappear { pulse = false }
    .accessibilityLabel("Loading")
  }
}
