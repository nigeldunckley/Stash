import SwiftUI

/// One article in a list, as on the web: favicon, a two-line Newsreader title with its source
/// underneath, the age and length in mono, and a 72 × 48 thumbnail when there's an image.
struct ItemRow: View {
  let item: LibraryItem
  var subscriptionName: String?
  var unseen = false
  var selected = false
  /// The 1pt line under the row; off for the last row in a bordered box.
  var divider = true

  var body: some View {
    StashRow(selected: selected, hasThumbnail: item.imageURL != nil, divider: divider) {
      HStack(alignment: .center, spacing: 12) {
        SiteIcon(url: item.iconURL, size: 18)
          .frame(width: 18)

        VStack(alignment: .leading, spacing: 3) {
          Text(item.title)
            .font(.stRowTitle)
            .tracking(Tracking.rowTitle)
            .foregroundStyle(Color.stInk)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          HStack(spacing: 6) {
            Text(subscriptionName ?? item.source)
              .font(.stSmall)
              .lineLimit(1)
            #if os(iOS)
            meta
            #endif
          }
          .foregroundStyle(Color.stMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        #if os(macOS)
        meta
        #endif

        if let imageURL = item.imageURL {
          AsyncImage(url: imageURL) { image in
            image.resizable().scaledToFill()
          } placeholder: {
            Color.stSunken
          }
          .frame(width: 72, height: 48)
          .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
        }
      }
    }
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
