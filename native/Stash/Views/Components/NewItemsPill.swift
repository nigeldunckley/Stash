import SwiftUI

/// "↑ 3 new" floating at the top of a list when new items have arrived while you were looking,
/// as on the web. Clicking it puts them at the top; until then the list stays where it is.
struct NewItemsPill: View {
  let count: Int
  let action: () -> Void

  var body: some View {
    if count > 0 {
      Button(action: action) {
        HStack(spacing: 6) {
          Image(systemName: "arrow.up")
            .font(.system(size: 10, weight: .bold))
          Text("\(count) new")
            .font(.mono(11, .medium))
            .tracking(0.4)
            .monospacedDigit()
            .rolls(count)
        }
        .foregroundStyle(Color.stOnAccent)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.stAccent, in: Capsule())
        .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .padding(.top, 10)
      .transition(.move(edge: .top).combined(with: .opacity))
      .help("Show the new posts")
      .accessibilityLabel("Show \(count) new")
    }
  }
}
