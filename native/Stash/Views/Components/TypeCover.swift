import SwiftUI

/// A cover set from an item's words, for anything without a picture, so a list never shows a
/// grey box. The same title always gets the same cover. All type is sized from the cover's own
/// width and height, so one view serves a 56pt thumbnail and a full-width card.
struct TypeCover: View {
  let item: LibraryItem
  /// A line you highlighted (30 to 200 characters), for the quote cover.
  var quote: String?

  var body: some View {
    GeometryReader { geometry in
      let size = geometry.size
      let style = TypeCoverStyle.pick(for: item, quote: quote, large: size.width > 150)
      cover(style, size)
        .frame(width: size.width, height: size.height)
        .clipped()
    }
    .accessibilityHidden(true)
  }

  // MARK: Words

  private var title: String { item.title.trimmingCharacters(in: .whitespacesAndNewlines) }
  private var source: String { item.source.uppercased() }
  private var length: String? { item.readingMinutes.map { "\($0) MIN" } }
  private var words: [Substring] { title.split(separator: " ") }

  private func serif(_ size: CGFloat, italic: Bool = false) -> Font {
    .custom(StashFace.newsreader(.medium, italic: italic), fixedSize: size)
  }
  private func geist(_ size: CGFloat) -> Font { .custom(StashFace.geist(.semibold), fixedSize: size) }
  private func mono(_ size: CGFloat) -> Font { .custom(StashFace.geistMono(.medium), fixedSize: size) }

  // MARK: Covers

  @ViewBuilder
  private func cover(_ style: TypeCoverStyle, _ size: CGSize) -> some View {
    let w = size.width, h = size.height
    switch style {
    case .bleed(let small):
      // The title huge, running off the right edge.
      ZStack(alignment: .topLeading) {
        Color.stSurface
        Text(small ? words.prefix(2).joined(separator: " ") : title)
          .font(serif(small ? h * 0.42 : h * 0.3))
          .tracking(-0.02 * h * 0.3)
          .lineSpacing(-h * 0.04)
          .foregroundStyle(Color.stInk)
          .fixedSize(horizontal: small, vertical: false)
          .frame(width: small ? nil : w * 1.35, alignment: .leading)
          .padding(.leading, w * 0.06)
          .padding(.top, h * (small ? 0.18 : 0.06))
          // Runs off the right edge without widening the cover.
          .frame(width: w, height: h, alignment: .topLeading)
        if !small {
          sourceStrip(w, h)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
          Rectangle()
            .fill(Color.stAccent)
            .frame(width: w * 0.03, height: w * 0.03)
            .padding(w * 0.05)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
      }

    case .ink(let small):
      // A near-black ground, the initial huge and faint, the title at the foot.
      ZStack(alignment: .bottomLeading) {
        Color(light: 0x09090B, dark: 0x18181B)
        Text(String(title.prefix(1)).uppercased())
          .font(serif(h * (small ? 0.9 : 1.1)))
          .foregroundStyle(.white.opacity(small ? 0.9 : 0.1))
          .frame(width: w, height: h, alignment: small ? .center : .topTrailing)
          .offset(x: small ? 0 : w * 0.04, y: small ? 0 : -h * 0.18)
        if !small {
          VStack(alignment: .leading, spacing: h * 0.04) {
            Text(title)
              .font(serif(w * 0.09))
              .foregroundStyle(.white)
              .lineLimit(3)
            Text([source, length].compactMap { $0 }.joined(separator: " · "))
              .font(mono(max(7, w * 0.032)))
              .tracking(0.6)
              .foregroundStyle(.white.opacity(0.6))
              .lineLimit(1)
          }
          .padding(w * 0.06)
        }
      }

    case .split:
      // The first word in Geist, the rest in Newsreader italic.
      ZStack(alignment: .bottomLeading) {
        Color.stSurface
        VStack(alignment: .leading, spacing: 0) {
          Text(words.first.map(String.init) ?? title)
            .font(geist(w * 0.12))
            .tracking(-w * 0.004)
            .foregroundStyle(Color.stInk)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
          Text(words.dropFirst().joined(separator: " "))
            .font(serif(w * 0.075, italic: true))
            .foregroundStyle(Color.stInk)
            .lineLimit(3)
          Spacer(minLength: 0)
          Text(source)
            .font(mono(max(7, w * 0.03)))
            .tracking(0.6)
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        .padding(w * 0.06)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }

    case .spine:
      // Source and length up a left hairline, the title at bottom right.
      ZStack {
        Color.stSurface
        HStack(spacing: 0) {
          Text([source, length].compactMap { $0 }.joined(separator: " · "))
            .font(mono(max(7, w * 0.03)))
            .tracking(0.8)
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
            .fixedSize()
            .rotationEffect(.degrees(-90))
            .frame(width: w * 0.08, height: h * 0.8)
          Rectangle().fill(Color.stInk).frame(width: 1).padding(.vertical, h * 0.08)
          Text(title)
            .font(serif(w * 0.075))
            .foregroundStyle(Color.stInk)
            .multilineTextAlignment(.trailing)
            .lineLimit(4)
            .padding(w * 0.06)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
      }

    case .number(let number, let small):
      // The number huge, in mono, on grey.
      ZStack(alignment: .bottomLeading) {
        Color.stSunken
        Text(number)
          .font(mono(h * (small ? 0.55 : 0.6)))
          .tracking(-h * 0.02)
          .foregroundStyle(Color.stInk)
          .lineLimit(1)
          .minimumScaleFactor(0.3)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: small ? .center : .topLeading)
          .padding(w * 0.06)
        if !small {
          Text(title)
            .font(serif(w * 0.05))
            .foregroundStyle(Color.stInk)
            .lineLimit(2)
            .padding(w * 0.06)
        }
      }

    case .quote(let line):
      // Your highlight under a double rule, the title small at the foot.
      ZStack(alignment: .topLeading) {
        Color.stSurface
        VStack(alignment: .leading, spacing: h * 0.05) {
          VStack(spacing: 2) {
            Rectangle().fill(Color.stInk).frame(height: 1)
            Rectangle().fill(Color.stInk).frame(height: 1)
          }
          Text("“\(line)”")
            .font(serif(w * 0.06, italic: true))
            .foregroundStyle(Color.stInk)
            .lineLimit(5)
          Spacer(minLength: 0)
          Text(title)
            .font(mono(max(7, w * 0.03)))
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        .padding(w * 0.06)
      }

    case .accent:
      // Newsletters: International Orange.
      ZStack(alignment: .bottomLeading) {
        Color.stAccent
        VStack(alignment: .leading, spacing: h * 0.04) {
          Text(source)
            .font(mono(max(7, w * 0.032)))
            .tracking(0.8)
            .lineLimit(1)
          Text(title)
            .font(serif(w * 0.08))
            .lineLimit(4)
        }
        .foregroundStyle(Color.stOnAccent)
        .padding(w * 0.06)
      }
    }
  }

  /// The source in mono on a white strip at the bottom left.
  private func sourceStrip(_ w: CGFloat, _ h: CGFloat) -> some View {
    Text(source)
      .font(mono(max(7, w * 0.03)))
      .tracking(0.8)
      .foregroundStyle(Color.stInk)
      .lineLimit(1)
      .padding(.horizontal, w * 0.03)
      .padding(.vertical, h * 0.025)
      .background(Color.stSurface)
      .padding(w * 0.05)
  }
}

/// Which cover a title gets.
enum TypeCoverStyle: Equatable {
  case bleed(small: Bool), ink(small: Bool), split, spine
  case number(String, small: Bool)
  case quote(String)
  case accent

  static func pick(for item: LibraryItem, quote: String?, large: Bool) -> TypeCoverStyle {
    let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
    let hash = titleHash(title)
    let number = title.firstMatch(of: #/\d+/#).map { String($0.output) }

    guard large else {
      // Narrow capitals look lost as a lone initial.
      if let first = title.first, "IJLijlft1".contains(first) { return .bleed(small: true) }
      if let number, hash % 3 == 0 { return .number(number, small: true) }
      return hash % 2 == 0 ? .bleed(small: true) : .ink(small: true)
    }
    if item.isNewsletter { return .accent }
    if let quote, (30...200).contains(quote.count) { return .quote(quote) }
    if let number, hash % 3 == 0 { return .number(number, small: false) }
    let choices: [TypeCoverStyle] = [.bleed(small: false), .ink(small: false), .split, .spine]
    return choices[hash % choices.count]
  }

  /// The web's hash: h = h * 31 + each UTF-16 unit, kept to 32 bits, made positive.
  static func titleHash(_ title: String) -> Int {
    var h: Int32 = 0
    for unit in title.utf16 { h = h &* 31 &+ Int32(unit) }
    return Int(h.magnitude)
  }
}

extension LibraryItem {
  /// From an email newsletter: RSS items keep their feed's address in `subscription`;
  /// newsletters keep a name.
  var isNewsletter: Bool {
    guard let subscription, !subscription.isEmpty else { return false }
    return !subscription.hasPrefix("http") && !Watch.isVideo(self)
  }
}

/// The item's picture when it has one, otherwise its type cover.
struct ItemCover: View {
  let item: LibraryItem

  var body: some View {
    if let url = item.imageURL {
      CoverImage(url: url)
    } else {
      TypeCover(item: item)
    }
  }
}
