import SwiftUI

/// A video in the grid: a 16:9 thumbnail with its length and progress, then the title and channel.
struct VideoCard: View {
  let item: LibraryItem
  var channelName: String?
  var unseen = false

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      VideoThumbnail(item: item)
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.stVideoTitle)
          .foregroundStyle(Color.stInk)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        HStack(spacing: 6) {
          if unseen { Circle().fill(Color.stAccent).frame(width: 6, height: 6) }
          Text(channelName ?? item.author ?? item.source).font(.stSmall).lineLimit(1)
          Text(shortAge(item.publishedAt ?? item.savedAt)).font(.stDetail)
        }
        .foregroundStyle(Color.stMuted)
      }
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

/// A compact row, for Up next.
struct VideoRow: View {
  let item: LibraryItem
  var selected = false

  var body: some View {
    StashRow(selected: selected, hasThumbnail: true) {
    HStack(alignment: .top, spacing: 10) {
      VideoThumbnail(item: item).frame(width: 128)
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.stVideoTitle)
          .foregroundStyle(Color.stInk)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Text(item.author ?? item.source)
          .font(.stSmall)
          .foregroundStyle(Color.stMuted)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    }
  }
}
