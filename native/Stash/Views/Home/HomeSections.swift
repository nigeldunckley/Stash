import SwiftUI

/// "Home  SUNDAY 18 OCTOBER" with the capture field on the right, as the web's page header.
struct HomeHeader: View {
  @Binding var capture: String
  var focus: FocusState<Bool>.Binding
  let onSubmit: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      Text("Home")
        .font(.stPageTitle)
        .tracking(Tracking.pageTitle)
        .foregroundStyle(Color.stInk)
      Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased())
        .font(.mono(11))
        .tracking(0.66)
        .foregroundStyle(Color.stMuted)
        .padding(.top, 6)
        .lineLimit(1)
      Spacer(minLength: 16)
      CaptureField(text: $capture, focus: focus, onSubmit: onSubmit)
        .frame(width: 360)
    }
    .frame(height: 38)
  }
}

/// New videos from your channels: 16:9 cards in a row that scrolls sideways, four across on Mac.
struct NewVideosStrip: View {
  let videos: [LibraryItem]
  let total: Int?
  let channelName: (LibraryItem) -> String?
  let open: (LibraryItem) -> Void
  let openWatch: () -> Void
  let perform: (ItemAction, LibraryItem) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text("New videos")
          .font(.ui(15, .semibold, relativeTo: .headline))
          .tracking(-0.15)
          .foregroundStyle(Color.stInk)
        if let total, total > 0 {
          Text("\(total) new").font(.mono(11)).monospacedDigit().foregroundStyle(Color.stAccentText)
        }
        Spacer(minLength: 0)
        Button(action: openWatch) {
          HStack(spacing: 5) {
            Text("Open Watch")
            Image(systemName: "arrow.right").imageScale(.small)
          }
          .font(.stSmall)
          .foregroundStyle(Color.stMuted)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: cardSpacing) {
          ForEach(videos) { item in
            Button { open(item) } label: {
              VideoCard(item: item, channelName: channelName(item), unseen: true)
            }
            .buttonStyle(.plain)
            .itemMenu(item, unseen: true, perform: perform)
            #if os(macOS)
            .containerRelativeFrame(.horizontal, count: 4, spacing: cardSpacing)
            #else
            .containerRelativeFrame(.horizontal) { width, _ in width * 0.7 }
            #endif
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.viewAligned)
      .scrollClipDisabled()
    }
  }

  private var cardSpacing: CGFloat {
    #if os(macOS)
    18
    #else
    14
    #endif
  }
}

/// Up next on Mac: the first save with its cover and progress, then the rest as rows with
/// small thumbnails, as on the web.
struct UpNextColumn: View {
  let items: [LibraryItem]
  let loading: Bool
  let unreadTotal: Int?
  let open: (LibraryItem) -> Void
  let openSaved: () -> Void
  let perform: (ItemAction, LibraryItem) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionHeading(title: "Up next", detail: loading ? nil : "\(items.count) to read")
      if let first = items.first {
        Button { open(first) } label: { featured(first) }
          .buttonStyle(.plain)
          .itemMenu(first, perform: perform)
        if items.count > 1 {
          VStack(spacing: 0) {
            ForEach(items.dropFirst()) { item in
              Button { open(item) } label: { rest(item) }
                .buttonStyle(.plain)
                .itemMenu(item, perform: perform)
            }
          }
          .overlay(alignment: .top) { Rectangle().fill(Color.stLine).frame(height: 1) }
          .padding(.top, 6)
        }
      } else if loading {
        ProgressView().controlSize(.small).frame(maxWidth: .infinity).padding(.vertical, 24)
      } else {
        EmptyBox(message: "Nothing waiting. Save an article and it shows up here.")
      }
      if let unreadTotal, unreadTotal > items.count {
        Button(action: openSaved) {
          Label("All \(unreadTotal) in Saved", systemImage: "arrow.right")
        }
        .buttonStyle(.text)
        .padding(.top, 4)
      }
    }
  }

  private func featured(_ item: LibraryItem) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Group {
        if item.imageURL != nil {
          CoverImage(url: item.imageURL)
        } else {
          Color.stSunken.overlay { SiteIcon(url: item.iconURL, size: 36) }
        }
      }
      .aspectRatio(16 / 10, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
      .padding(.bottom, 4)

      HStack(spacing: 6) {
        SiteIcon(url: item.iconURL)
        Text(item.source.uppercased()).lineLimit(1)
        if item.progress >= 0.02 {
          Text("· PICK UP AGAIN").font(.mono(10.5, .medium)).foregroundStyle(Color.stAccentText)
        }
      }
      .font(.mono(10.5))
      .tracking(0.5)
      .foregroundStyle(Color.stMuted)

      Text(item.title)
        .font(.reading(23, .medium, relativeTo: .title2))
        .tracking(-0.23)
        .foregroundStyle(Color.stInk)
        .lineLimit(3)
        .multilineTextAlignment(.leading)

      if let label = readingLabel(item) {
        HStack(spacing: 10) {
          if item.progress >= 0.02 {
            GeometryReader { geometry in
              ZStack(alignment: .leading) {
                Capsule().fill(Color.stLine)
                Capsule().fill(Color.stAccent).frame(width: geometry.size.width * min(item.progress, 1))
              }
            }
            .frame(height: 2)
          }
          Text(label.uppercased())
            .font(.mono(11))
            .foregroundStyle(Color.stMuted)
            .fixedSize()
          if item.progress < 0.02 { Spacer(minLength: 0) }
        }
      }
    }
    .contentShape(Rectangle())
  }

  private func rest(_ item: LibraryItem) -> some View {
    HStack(alignment: .center, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.reading(16.5, .medium, relativeTo: .subheadline))
          .foregroundStyle(Color.stInk)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
        Text("\(item.source) · \(savedLabel(item.savedAt))".uppercased())
          .font(.mono(10.5))
          .tracking(0.3)
          .foregroundStyle(Color.stMuted)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Group {
        if item.imageURL != nil {
          CoverImage(url: item.imageURL)
        } else {
          Color.stSunken.overlay { SiteIcon(url: item.iconURL, size: 22) }
        }
      }
      .frame(width: 56, height: 56)
      .clipShape(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }
    .padding(.vertical, 12)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
    .contentShape(Rectangle())
  }
}

/// "Saved 2h ago", "Saved just now", or "Saved 14 Oct" once it's older than a week.
private func savedLabel(_ date: Date?) -> String {
  let age = shortAge(date)
  if age.isEmpty { return "Saved" }
  if age == "now" { return "Saved just now" }
  if let last = age.last, "mhd".contains(last), age.dropLast().allSatisfy(\.isNumber) { return "Saved \(age) ago" }
  return "Saved \(age)"
}

/// "TODAY", "YESTERDAY": the band that starts each day in the feed list.
struct DayBand: View {
  let label: String

  var body: some View {
    Text(label.uppercased())
      .font(.mono(10.5))
      .tracking(0.84)
      .foregroundStyle(Color.stMuted)
      .padding(.leading, 42)
      .padding(.trailing, 14)
      .padding(.top, 9)
      .padding(.bottom, 7)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.stGroup)
  }
}

extension Color {
  /// The faint band behind day labels and the "more" row in lists.
  static let stGroup = Color(light: 0xFAFAFA, dark: 0x09090B)
}
