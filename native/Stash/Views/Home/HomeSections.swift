import SwiftUI

/// Home, with separate controls for searching and saving.
struct HomeHeader: View {
  @Binding var capture: String
  var focus: FocusState<Bool>.Binding
  let onSubmit: () -> Void
  let onAdd: () -> Void

  var body: some View {
    HStack(alignment: .center, spacing: 14) {
      Text("Home")
        .font(.stPageTitle)
        .tracking(Tracking.pageTitle)
        .foregroundStyle(Color.stInk)
      Spacer(minLength: 16)
      CaptureField(text: $capture, prompt: "Search Stash", focus: focus, onSubmit: onSubmit)
        .frame(minWidth: 120, maxWidth: 300)
      Button(action: onAdd) { Label("Add link", systemImage: "plus") }
        .buttonStyle(.text)
    }
    .frame(height: 38)
  }
}

/// "TODAY", "YESTERDAY": the band that starts each day in the feed list.
struct DayBand: View {
  let label: String

  var body: some View {
    Text(label.uppercased())
      .font(.mono(11))
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


/// A real item and its saved position, with one action to continue.
struct ContinuationCard: View {
  let item: LibraryItem
  let watching: Bool
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(alignment: .top, spacing: 16) {
        ItemCover(item: item)
          .frame(width: 96, height: 112)
          .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
        VStack(alignment: .leading, spacing: 8) {
          Text(item.author ?? item.source).font(.stSmall).foregroundStyle(Color.stMuted).lineLimit(1)
          Text(item.title).font(.reading(22, .medium, relativeTo: .title3))
            .foregroundStyle(Color.stInk).lineLimit(3).multilineTextAlignment(.leading)
          Spacer(minLength: 0)
          HStack {
            Text(watching ? "Continue watching" : "Continue reading").font(.ui(12, .medium))
            Spacer(minLength: 4)
            Text(remaining).font(.stDetail).foregroundStyle(Color.stMuted)
          }
        }
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .leading)
      }
      .padding(16)
      .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md))
      .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Color.stLine, lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(watching ? "Continue watching" : "Continue reading"): \(item.title), \(remaining)")
  }

  private var remaining: String {
    if watching, let duration = Watch.duration(item) {
      return "\(Watch.timecode(max(0, duration - Watch.startTime(item)))) left"
    }
    return readingLabel(item) ?? ""
  }
}
