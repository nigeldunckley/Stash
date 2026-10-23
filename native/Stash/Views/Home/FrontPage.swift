import SwiftUI

#if os(macOS)
/// The pieces of Home's front page on Mac: set like a newspaper rather than a list, with the
/// newest story leading, the morning's stories in a grid, and older ones as a river of headlines.

/// "Home." large, a line on what's new, and search and Add link on the right.
struct FrontMasthead: View {
  let summary: String?
  @Binding var capture: String
  var focus: FocusState<Bool>.Binding
  let onSubmit: () -> Void
  let onAdd: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      Rectangle().fill(Color.stInk).frame(height: 2)
      HStack(alignment: .lastTextBaseline, spacing: 16) {
        (Text("Home") + Text(".").foregroundStyle(Color.stAccent))
          .font(.ui(60, .semibold, relativeTo: .largeTitle))
          .tracking(-2.6)
          .foregroundStyle(Color.stInk)
          .fixedSize()
        if let summary {
          Text(summary)
            .font(.reading(19, .regular, italic: true))
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        Spacer(minLength: 16)
        CaptureField(text: $capture, prompt: "Search Stash", focus: focus, onSubmit: onSubmit)
          .frame(minWidth: 140, maxWidth: 260)
          .alignmentGuide(.lastTextBaseline) { $0[.bottom] - 8 }
        Button(action: onAdd) { Label("Add link", systemImage: "plus") }
          .buttonStyle(.text)
          .alignmentGuide(.lastTextBaseline) { $0[.bottom] - 8 }
      }
      .padding(.top, 14)
      .padding(.bottom, 18)
      Rectangle().fill(Color.stLine).frame(height: 1)
    }
  }
}

/// A mono label: "THE VERGE · 12 MIN AGO", with the source in ink and an orange dot when unseen.
struct StoryKicker: View {
  let source: String
  var detail: String?
  var unseen = false

  var body: some View {
    let tail = detail.map { " · " + $0.uppercased() } ?? ""
    return HStack(spacing: 8) {
      if unseen {
        Circle().fill(Color.stAccent).frame(width: 6, height: 6)
      }
      (Text(source.uppercased()).foregroundStyle(Color.stInk) + Text(tail).foregroundStyle(Color.stMuted))
        .stashLabel()
        .lineLimit(1)
    }
  }
}

/// How old a story is and how long it takes: "41 MIN · 5 MIN READ".
func storyDetail(_ item: LibraryItem) -> String {
  let length = Watch.isVideo(item)
    ? Watch.duration(item).map(Watch.timecode)
    : item.readingMinutes.map { "\($0) min read" }
  return [shortAge(item.date), length].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
}

/// The newest story, set large: its picture, the source, a serif headline and the feed's summary.
struct LeadStory: View {
  let item: LibraryItem
  let source: String
  let unseen: Bool
  let open: () -> Void
  let perform: (ItemAction, LibraryItem) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Button(action: open) {
        VStack(alignment: .leading, spacing: 14) {
          if let url = item.imageURL {
            Color.stSunken
              .aspectRatio(16 / 9, contentMode: .fit)
              .overlay { FadeImage(url: item.largeImageURL, fallback: url) }
              .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
          }
          StoryKicker(source: source, detail: storyDetail(item), unseen: unseen)
          Text(item.title)
            .font(.reading(item.imageURL == nil ? 50 : 42, .medium, relativeTo: .largeTitle))
            .tracking(-0.6)
            .lineSpacing(-2)
            .foregroundStyle(Color.stInk)
            .multilineTextAlignment(.leading)
            .lineLimit(4)
          if let summary = item.description, !summary.isEmpty {
            Text(summary)
              .font(.reading(20, .regular))
              .lineSpacing(5)
              .foregroundStyle(Color.stInk.opacity(0.78))
              .multilineTextAlignment(.leading)
              .lineLimit(item.imageURL == nil ? 6 : 3)
              .frame(maxWidth: 680, alignment: .leading)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      HStack(spacing: 18) {
        Button("Read", action: open).buttonStyle(.textProminent)
        Button("Save") { perform(.save, item) }.buttonStyle(.text)
        Button("Archive") { perform(.archive, item) }.buttonStyle(.text)
      }
    }
    .itemMenu(item, unseen: unseen, perform: perform)
  }
}

/// One story in the grid: picture, source, headline, summary. A story with no picture is set
/// as type under a heavy rule instead, with more of its summary, so it never leaves a gap.
struct StoryCard: View {
  let item: LibraryItem
  let source: String
  let unseen: Bool
  let open: () -> Void
  let perform: (ItemAction, LibraryItem) -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 10) {
        if let url = item.imageURL {
          Color.stSunken
            .aspectRatio(3 / 2, contentMode: .fit)
            .overlay { FadeImage(url: item.largeImageURL, fallback: url) }
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
            .opacity(hovering ? 0.92 : 1)
        } else {
          Rectangle().fill(Color.stInk).frame(height: 2).padding(.bottom, 4)
        }
        StoryKicker(source: source, detail: storyDetail(item), unseen: unseen)
        Text(item.title)
          .font(.reading(item.imageURL == nil ? 25 : 21, .medium, relativeTo: .title2))
          .foregroundStyle(Color.stInk)
          .underline(hovering, color: Color.stLine)
          .multilineTextAlignment(.leading)
          .lineLimit(item.imageURL == nil ? 4 : 3)
        if let summary = item.description, !summary.isEmpty {
          Text(summary)
            .font(item.imageURL == nil ? .reading(17, .regular) : .ui(13.5))
            .lineSpacing(3)
            .foregroundStyle(Color.stMuted)
            .multilineTextAlignment(.leading)
            .lineLimit(item.imageURL == nil ? 7 : 3)
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .itemMenu(item, unseen: unseen, perform: perform)
  }
}

/// A headline on its own, for older stories and for the column beside an open story.
struct HeadlineRow: View {
  let item: LibraryItem
  let source: String
  var unseen = false
  var selected = false
  var read = false
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 5) {
        StoryKicker(source: source, detail: shortAge(item.date), unseen: unseen && !read)
        Text(item.title)
          .font(.reading(17, selected ? .semibold : .medium, relativeTo: .headline))
          .foregroundStyle(read && !selected ? Color.stMuted : Color.stInk)
          .multilineTextAlignment(.leading)
          .lineLimit(3)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 12)
      .padding(.horizontal, selected ? 10 : 0)
      .background {
        if selected {
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(Color.stSurface)
            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
        }
      }
      .padding(.horizontal, selected ? -10 : 0)
      .overlay(alignment: .bottom) {
        if !selected { Rectangle().fill(Color.stLine).frame(height: 1) }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// A day's heading in the river: "Yesterday" in serif italic over a heavy rule.
struct RiverHeading<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title)
        .font(.reading(20, .regular, italic: true))
        .foregroundStyle(Color.stInk)
      Spacer(minLength: 8)
      trailing()
    }
    .padding(.bottom, 8)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stInk).frame(height: 1) }
  }
}

/// A side-column section's heading: a mono label over a 1pt ink rule, with an optional link.
struct ColumnHeading: View {
  let title: String
  var link: String?
  var action: () -> Void = {}

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title.uppercased())
        .stashLabel()
        .foregroundStyle(Color.stInk)
      Spacer(minLength: 8)
      if let link {
        Button(link, action: action).buttonStyle(.text)
      }
    }
    .padding(.bottom, 8)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stInk).frame(height: 1) }
  }
}

/// Something you've started: a small cover or thumbnail, the title, and a thin orange progress line.
struct PickUpRow: View {
  let item: LibraryItem
  let watching: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .top, spacing: 14) {
        // The same width for an article and a video, so their titles line up.
        Group {
          if watching {
            Color.stSunken
              .overlay { FadeImage(url: item.largeImageURL, fallback: item.imageURL) }
              .frame(width: 120, height: 68)
          } else if item.imageURL != nil {
            Color.stSunken
              .overlay { FadeImage(url: item.imageURL) }
              .frame(width: 120, height: 80)
          } else {
            ItemCover(item: item).frame(width: 120, height: 80)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
        VStack(alignment: .leading, spacing: 6) {
          Text("\(item.source) · \(watching ? "Watching" : "Reading")".uppercased())
            .stashLabel()
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
          Text(item.title)
            .font(.reading(watching ? 17 : 19, .medium, relativeTo: .headline))
            .foregroundStyle(Color.stInk)
            .multilineTextAlignment(.leading)
            .lineLimit(3)
          HStack(spacing: 8) {
            GeometryReader { geometry in
              ZStack(alignment: .leading) {
                Rectangle().fill(Color.stLine)
                Rectangle().fill(Color.stAccent).frame(width: geometry.size.width * min(max(watching ? watchedFraction : item.progress, 0), 1))
              }
            }
            .frame(height: 2)
            Text(remaining)
              .font(.mono(11))
              .foregroundStyle(Color.stMuted)
              .fixedSize()
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(watching ? "Continue watching" : "Continue reading"): \(item.title), \(remaining)")
  }

  private var watchedFraction: Double {
    guard let duration = Watch.duration(item), duration > 0 else { return item.progress }
    return Watch.startTime(item) / duration
  }

  private var remaining: String {
    if watching, let duration = Watch.duration(item) {
      return "\(Watch.timecode(max(0, duration - Watch.startTime(item)))) left"
    }
    return readingLabel(item) ?? ""
  }
}

/// A numbered save in the side column: "1  Title / SOURCE · 14 MIN".
struct NumberedRow: View {
  let number: Int
  let item: LibraryItem
  let divider: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .firstTextBaseline, spacing: 14) {
        Text("\(number)")
          .font(.reading(26, .regular))
          .foregroundStyle(Color.stMuted.opacity(0.7))
          .frame(width: 18, alignment: .leading)
        VStack(alignment: .leading, spacing: 4) {
          Text(item.title)
            .font(.reading(17, .medium, relativeTo: .headline))
            .foregroundStyle(Color.stInk)
            .multilineTextAlignment(.leading)
            .lineLimit(3)
          Text([item.source, readingLabel(item)].compactMap { $0 }.joined(separator: " · "))
            .font(.mono(11))
            .foregroundStyle(Color.stMuted)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.vertical, 12)
      .overlay(alignment: .bottom) {
        if divider { Rectangle().fill(Color.stLine).frame(height: 1) }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// A new video, set with the same weight as a story: a large picture with its length, the
/// channel, and a serif title.
struct VideoTile: View {
  let item: LibraryItem
  let open: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 10) {
        Color.stSunken
          .aspectRatio(16 / 9, contentMode: .fit)
          .overlay { FadeImage(url: item.largeImageURL, fallback: item.imageURL) }
          .overlay(alignment: .bottomTrailing) {
            if let duration = Watch.duration(item) {
              Text(Watch.timecode(duration))
                .font(.mono(11, .medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 3))
                .padding(6)
            }
          }
          .overlay {
            Image(systemName: "play.fill")
              .font(.system(size: 16))
              .foregroundStyle(.white)
              .frame(width: 44, height: 44)
              .background(Color.black.opacity(0.55), in: Circle())
              .opacity(hovering ? 1 : 0)
          }
          .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
        StoryKicker(source: item.source, detail: shortAge(item.date))
        Text(item.title)
          .font(.reading(21, .medium, relativeTo: .title2))
          .foregroundStyle(Color.stInk)
          .underline(hovering, color: Color.stLine)
          .multilineTextAlignment(.leading)
          .lineLimit(3)
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/// A story beside the lead: source, headline and a line of summary, with a small picture.
struct SecondaryStory: View {
  let item: LibraryItem
  let source: String
  let unseen: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .top, spacing: 14) {
        VStack(alignment: .leading, spacing: 6) {
          StoryKicker(source: source, detail: shortAge(item.date), unseen: unseen)
          Text(item.title)
            .font(.reading(19, .medium, relativeTo: .headline))
            .foregroundStyle(Color.stInk)
            .multilineTextAlignment(.leading)
            .lineLimit(3)
          if let summary = item.description, !summary.isEmpty {
            Text(summary)
              .font(.ui(13))
              .foregroundStyle(Color.stMuted)
              .multilineTextAlignment(.leading)
              .lineLimit(2)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if let url = item.imageURL {
          Color.stSunken
            .overlay { FadeImage(url: url) }
            .frame(width: 84, height: 84)
            .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}
#endif
