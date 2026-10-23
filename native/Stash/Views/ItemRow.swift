import SwiftUI

/// One article in a list, as on the web: favicon, a two-line Newsreader title with its source
/// underneath, up to two lines of summary, the age and length in mono, and a thumbnail when
/// there's an image (88 × 60 beside a summary, 72 × 48 without). In a narrow list (Mac, beside the
/// reader) it goes compact: three lines of title, then the source, age and length on one line,
/// a smaller cover, then the summary, rather than squeezing everything onto one line.
struct ItemRow: View {
  let item: LibraryItem
  var subscriptionName: String?
  var unseen = false
  var selected = false
  /// The 1pt line under the row; off for the last row in a bordered box.
  var divider = true

  @Environment(\.dynamicTypeSize) private var typeSize
  @State private var width: CGFloat = 600

  /// Narrow enough that the side-by-side layout would cut everything off.
  private var compact: Bool {
    #if os(macOS)
    width < 520
    #else
    typeSize.isAccessibilitySize
    #endif
  }

  var body: some View {
    StashRow(selected: selected, hasThumbnail: true, divider: divider) {
      HStack(alignment: .center, spacing: 12) {
        SiteIcon(url: item.iconURL, size: 18)
          .frame(width: 18)

        VStack(alignment: .leading, spacing: 3) {
          Text(item.title)
            .font(.stRowTitle)
            .tracking(Tracking.rowTitle)
            .inkWipe(finished: item.progress >= 0.98)
            .lineLimit(typeSize.isAccessibilitySize ? nil : compact ? 3 : 2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
          if typeSize.isAccessibilitySize {
            Text(subscriptionName ?? item.source).font(.stSmall).foregroundStyle(Color.stMuted)
            meta
          } else {
            HStack(spacing: 6) {
              Text(subscriptionName ?? item.source).font(.stSmall).lineLimit(1).layoutPriority(-1)
              #if os(iOS)
              meta
              #else
              if compact { meta }
              #endif
            }
            .foregroundStyle(Color.stMuted)
          }
          if let summary {
            Text(summary)
              .font(.stExcerpt)
              .lineSpacing(2)
              .foregroundStyle(Color.stMuted)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
              .padding(.top, 2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        #if os(macOS)
        if !compact { meta }
        #endif

        Group {
          if let imageURL = item.imageURL {
            FadeImage(url: imageURL)
          } else {
            TypeCover(item: item)
          }
        }
        .frame(width: compact ? 60 : summary == nil ? 72 : 88, height: compact ? 44 : summary == nil ? 48 : 60)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
        // Your place, on something you're part way through.
        .placeRibbon(item.isPartRead, inset: 6)
      }
    }
    .momentSource(item)
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
  }

  /// The feed's summary of the article, as the web shows under each row; videos have none.
  private var summary: String? {
    guard !Watch.isVideo(item), let text = item.description?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
      return nil
    }
    return text
  }

  /// Age, length, highlights and progress in Geist Mono, with an orange dot while unseen.
  private var meta: some View {
    HStack(spacing: 10) {
      Text(shortAge(item.date))
      if let minutes = item.readingMinutes { Text("\(minutes) min") }
      if let count = item.highlightsCount, count > 0 {
        Label("\(count)", systemImage: "highlighter").labelStyle(.titleAndIcon)
      }
      if item.progress > 0.02 && item.progress < 0.98 {
        ProgressView(value: item.progress)
          .frame(width: 32)
          .tint(Color.stAccent)
      }
      if unseen {
        Circle().fill(Color.stAccent).frame(width: 6, height: 6)
      }
    }
    .font(.stDetail)
    .foregroundStyle(Color.stMuted)
    .fixedSize()
  }
}

struct SiteIcon: View {
  let url: URL?
  var size: CGFloat = 14

  var body: some View {
    AsyncImage(url: url) { image in
      image.resizable().scaledToFit()
    } placeholder: {
      RoundedRectangle(cornerRadius: size > 16 ? 4 : 3).fill(Color.stSunken)
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size > 16 ? 4 : 3))
  }
}
