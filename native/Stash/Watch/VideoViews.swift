import SwiftUI

/// A video in the grid: a 16:9 thumbnail with its length and progress, then the title and channel.
struct VideoCard: View {
  let item: LibraryItem
  var channelName: String?
  var unseen = false

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      VideoThumbnail(item: item)
      VStack(alignment: .leading, spacing: 6) {
        Text(item.title)
          .font(.stVideoTitle)
          .foregroundStyle(Color.stInk)
          .lineLimit(2, reservesSpace: true)
          .multilineTextAlignment(.leading)
          .padding(.leading, unseen ? 12 : 0)
          .overlay(alignment: .topLeading) {
            if unseen {
              Circle().fill(Color.stAccent).frame(width: 6, height: 6).padding(.top, 6)
            }
          }
        HStack(spacing: 6) {
          SiteIcon(url: item.iconURL, size: 14).clipShape(Circle())
          Text(channelName ?? item.author ?? item.source)
            .foregroundStyle(Color.stInk2)
            .lineLimit(1)
          Text("· \(shortAge(item.publishedAt ?? item.savedAt))")
            .fixedSize()
        }
        .font(.stSmall)
        .foregroundStyle(Color.stMuted)
      }
      .padding(.horizontal, 2)
    }
    .contentShape(Rectangle())
  }
}

struct VideoThumbnail: View {
  let item: LibraryItem

  var body: some View {
    Color.stSunken
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay {
        AsyncImage(url: item.imageURL) { image in
          image.resizable().scaledToFill()
        } placeholder: {
          Image(systemName: "play.rectangle").foregroundStyle(Color.stMuted)
        }
      }
      .clipped()
      .overlay(alignment: .bottomTrailing) {
        if let length = Watch.duration(item) {
          Text(Watch.timecode(length))
            .font(.mono(10.5, .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 4))
            .padding(6)
        }
      }
      .overlay(alignment: .bottom) {
        if item.progress > 0.02 {
          GeometryReader { geometry in
            Rectangle()
              .fill(Color.stAccent)
              .frame(width: geometry.size.width * min(item.progress, 1), height: 3)
              .frame(maxHeight: .infinity, alignment: .bottom)
          }
        }
      }
      .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}

/// A video in a list, laid out like an article row: favicon, title and channel, the age and
/// length in mono, and a 72 × 48 thumbnail.
struct VideoRow: View {
  let item: LibraryItem
  var selected = false
  var divider = true

  var body: some View {
    StashRow(selected: selected, hasThumbnail: true, divider: divider) {
      HStack(alignment: .center, spacing: 12) {
        SiteIcon(url: item.iconURL, size: 18)
          .frame(width: 18)
        VStack(alignment: .leading, spacing: 3) {
          Text(item.title)
            .font(.ui(14.5, .medium, relativeTo: .headline))
            .foregroundStyle(Color.stInk)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
          Text(item.author ?? item.source)
            .font(.stSmall)
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        HStack(spacing: 10) {
          Text(shortAge(item.publishedAt ?? item.savedAt))
          if let length = Watch.duration(item) { Text(Watch.timecode(length)) }
        }
        .font(.stDetail)
        .foregroundStyle(Color.stMuted)
        .fixedSize()
        AsyncImage(url: item.imageURL) { image in
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
