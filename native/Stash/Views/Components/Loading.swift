import ImageIO
import SwiftUI

/// An image that fades in once it loads, over Stash's sunken grey. When `url` can't be loaded
/// (a guessed bigger copy that doesn't exist), `fallback` is tried instead.
struct FadeImage: View {
  let url: URL?
  var fallback: URL?
  var contentMode: ContentMode = .fill

  @State private var image: Image?
  @State private var loaded: URL?

  var body: some View {
    ZStack {
      if let image {
        image.resizable().aspectRatio(contentMode: contentMode).transition(.opacity)
      } else {
        Color.stSunken
      }
    }
    .task(id: url) { await load() }
  }

  /// Pictures are kept on disk between launches, so lists don't fetch them again.
  private static let session: URLSession = {
    let configuration = URLSessionConfiguration.default
    configuration.urlCache = URLCache(memoryCapacity: 64 << 20, diskCapacity: 512 << 20)
    return URLSession(configuration: configuration)
  }()

  private func load() async {
    guard loaded != url || image == nil else { return }
    if loaded != url { image = nil }
    var candidates = [url].compactMap { $0 }
    if let fallback, fallback != url { candidates.append(fallback) }
    for candidate in candidates {
      guard let (data, response) = try? await Self.session.data(from: candidate) else { continue }
      if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { continue }
      guard let picture = await Self.decode(data) else { continue }
      let next = Image(decorative: picture, scale: 1)
      guard !Task.isCancelled else { return }
      withAnimation(.easeOut(duration: 0.25)) { image = next }
      loaded = url
      return
    }
  }

  /// Decodes the picture away from the main thread, scaled down to at most 1,600 pixels across,
  /// so big header images don't stutter lists or fill memory.
  private nonisolated static func decode(_ data: Data) async -> CGImage? {
    await Task.detached(priority: .userInitiated) {
      guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: 1600,
      ]
      return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }.value
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
