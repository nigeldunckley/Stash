import SwiftUI

/// An empty state: a short line of muted text, with an optional action, inside a dashed box
/// as on the web. `boxed: false` drops the box, for a whole screen with nothing to show.
struct EmptyBox<Actions: View>: View {
  var title: String?
  let message: String
  var systemImage: String?
  var boxed = true
  @ViewBuilder var actions: () -> Actions

  var body: some View {
    VStack(spacing: 10) {
      if let systemImage {
        Image(systemName: systemImage)
          .font(.ui(22, .regular, relativeTo: .title2))
          .foregroundStyle(Color.stMuted)
          .padding(.bottom, 2)
      }
      if let title {
        Text(title)
          .font(.ui(15, .semibold, relativeTo: .headline))
          .foregroundStyle(Color.stInk)
      }
      Text(message)
        .font(.ui(14))
        .foregroundStyle(Color.stMuted)
        .lineSpacing(3)
      HStack(spacing: 8) { actions() }
        .buttonStyle(.text)
        .padding(.top, 4)
    }
    .multilineTextAlignment(.center)
    .frame(maxWidth: boxed ? .infinity : 380)
    .padding(.vertical, 32)
    .padding(.horizontal, 16)
    .overlay {
      if boxed {
        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
          .strokeBorder(Color.stLine, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
      }
    }
  }
}

extension EmptyBox where Actions == EmptyView {
  init(title: String? = nil, message: String, systemImage: String? = nil, boxed: Bool = true) {
    self.init(title: title, message: message, systemImage: systemImage, boxed: boxed) { EmptyView() }
  }
}
