import SwiftUI

/// One article in a list: source, serif title, a line of summary, then age and length.
struct ItemRow: View {
  let item: LibraryItem
  var subscriptionName: String?
  var unseen = false

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 6) {
          if unseen {
            Circle().fill(Color.stashAccent).frame(width: 6, height: 6)
          }
          SiteIcon(url: item.iconURL)
          Text(subscriptionName ?? item.source)
            .lineLimit(1)
        }
        .font(.stashDetail)
        .foregroundStyle(Color.stashMuted)

        Text(item.title)
          .font(.stashTitle())
          .foregroundStyle(Color.stashInk)
          .lineLimit(2)
          .multilineTextAlignment(.leading)

        if let description = item.description, !description.isEmpty {
          Text(description)
            .font(.subheadline)
            .foregroundStyle(Color.stashMuted)
            .lineLimit(2)
        }

        HStack(spacing: 8) {
          Text(shortAge(item.date))
          if let minutes = item.readingMinutes { Text("\(minutes) min") }
          if let count = item.highlightsCount, count > 0 {
            Label("\(count)", systemImage: "highlighter").labelStyle(.titleAndIcon)
          }
          if item.progress > 0.02 && item.progress < 0.98 {
            ProgressView(value: item.progress)
              .frame(width: 36)
              .tint(Color.stashAccent)
          }
        }
        .font(.stashDetail)
        .foregroundStyle(Color.stashMuted)
      }
      Spacer(minLength: 0)
      if let imageURL = item.imageURL {
        AsyncImage(url: imageURL) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          Color.stashSurface
        }
        .frame(width: 68, height: 68)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.stashBorder, lineWidth: 0.5))
      }
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
  }
}

struct SiteIcon: View {
  let url: URL?

  var body: some View {
    AsyncImage(url: url) { image in
      image.resizable().scaledToFit()
    } placeholder: {
      RoundedRectangle(cornerRadius: 3).fill(Color.stashSurface)
    }
    .frame(width: 14, height: 14)
    .clipShape(RoundedRectangle(cornerRadius: 3))
  }
}
