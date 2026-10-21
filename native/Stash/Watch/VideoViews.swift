import SwiftUI

/// A video in the grid: a 16:9 thumbnail with its length and progress, then the title and channel.
struct VideoCard: View {
  let item: LibraryItem
  var channelName: String?
  var unseen = false
  /// "11 min left", in place of the age, for Continue watching.
  var timeLeft: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      VideoThumbnail(item: item)
        .placeRibbon(item.isPartRead, inset: 6)
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
          if let timeLeft {
            Spacer(minLength: 4)
            Text(timeLeft)
              .font(.mono(11))
              .foregroundStyle(Color.stAccentText)
              .fixedSize()
          } else {
            Text("· \(shortAge(item.publishedAt ?? item.savedAt))")
              .fixedSize()
          }
        }
        .font(.stSmall)
        .foregroundStyle(Color.stMuted)
      }
      .padding(.horizontal, 2)
    }
    .contentShape(Rectangle())
    .momentSource(item)
  }
}

struct VideoThumbnail: View {
  let item: LibraryItem

  var body: some View {
    Color.stSunken
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay {
        FadeImage(url: item.imageURL)
      }
      .clipped()
      .overlay(alignment: .bottomTrailing) {
        if let length = Watch.duration(item) {
          Text(Watch.timecode(length))
            .font(.mono(11, .medium))
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
        FadeImage(url: item.imageURL)
        .frame(width: 72, height: 48)
        .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
      }
    }
  }
}

/// One video in the player's Up next, sized for its narrow side column: a drag handle and its
/// place in line, a 16:9 thumbnail with the length on it, then the title over up to three
/// lines and the channel and age underneath, with a small menu to move it.
struct QueueRow: View {
  let item: LibraryItem
  let position: Int
  let onPlay: () -> Void
  /// Moves it up (-1) or down (1); nil when there's nowhere to go.
  var onMove: ((Int) -> Void)?
  var canMoveUp = true
  var canMoveDown = true

  @State private var hovering = false

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      VStack(spacing: 6) {
        Text("\(position)")
          .font(.mono(11))
          .monospacedDigit()
          .foregroundStyle(Color.stMuted)
        Image(systemName: "line.3.horizontal")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(Color.stMuted)
          .opacity(hovering ? 1 : 0.35)
          .help("Drag to change the order")
      }
      .frame(width: 18)
      .padding(.top, 4)

      Button(action: onPlay) {
        HStack(alignment: .top, spacing: 10) {
          thumbnail
          VStack(alignment: .leading, spacing: 4) {
            Text(item.title)
              .font(.ui(13, .medium))
              .foregroundStyle(Color.stInk)
              .lineLimit(3)
              .multilineTextAlignment(.leading)
              .fixedSize(horizontal: false, vertical: true)
            Text([item.author ?? item.source, shortAge(item.publishedAt ?? item.savedAt)]
              .filter { !$0.isEmpty }
              .joined(separator: " · "))
              .font(.mono(10.5))
              .foregroundStyle(Color.stMuted)
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      if let onMove {
        Menu {
          Button("Play now", action: onPlay)
          Divider()
          Button("Move up") { onMove(-1) }.disabled(!canMoveUp)
          Button("Move down") { onMove(1) }.disabled(!canMoveDown)
        } label: {
          Image(systemName: "ellipsis")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color.stMuted)
            .frame(width: 22, height: 22)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .fixedSize()
        .opacity(hovering ? 1 : 0.7)
        .accessibilityLabel("More for \(item.title)")
      }
    }
    .padding(.vertical, 8)
    .padding(.horizontal, 6)
    .background(hovering ? Color.stSunken : Color.clear, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    .onHover { hovering = $0 }
  }

  private var thumbnail: some View {
    FadeImage(url: item.imageURL)
      .frame(width: 96, height: 54)
      .background(Color.stSunken)
      .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
      .overlay(alignment: .bottomTrailing) {
        if let length = Watch.duration(item) {
          Text(Watch.timecode(length))
            .font(.mono(9.5, .medium))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 3, style: .continuous))
            .padding(4)
        }
      }
  }
}
