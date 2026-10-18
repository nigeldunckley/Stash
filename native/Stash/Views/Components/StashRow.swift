import SwiftUI

/// The frame every list row sits in: 10/12 padding, at least 56pt tall (68 with a thumbnail),
/// grey on hover, and grey with an orange bar on the left when selected. A 1pt line underneath
/// stands in for the system separator.
struct StashRow<Content: View>: View {
  var selected = false
  var hasThumbnail = false
  var divider = true
  @ViewBuilder var content: () -> Content

  @State private var hovering = false

  var body: some View {
    content()
      .padding(.vertical, 10)
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: hasThumbnail ? 68 : 56, alignment: .leading)
      .background(selected || hovering ? Color.stSunken : Color.clear)
      .overlay(alignment: .leading) {
        if selected {
          RoundedRectangle(cornerRadius: 1)
            .fill(Color.stAccent)
            .frame(width: 2)
            .padding(.vertical, 8)
        }
      }
      .overlay(alignment: .bottom) {
        if divider {
          Rectangle().fill(Color.stLine).frame(height: 1)
        }
      }
      .contentShape(Rectangle())
      #if os(macOS)
      .onHover { hovering = $0 }
      #endif
  }
}

extension View {
  /// Lets a row draw edge to edge in a List, with no system separator or background.
  func stashListRow() -> some View {
    listRowInsets(EdgeInsets())
      .listRowSeparator(.hidden)
      .listRowBackground(Color.clear)
  }

  /// A List on Stash's page colour, with the system background and separators hidden.
  func stashList() -> some View {
    listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(Color.stPage)
  }
}
