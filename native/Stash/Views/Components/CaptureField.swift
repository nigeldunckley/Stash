import SwiftUI

/// "Paste a link to save, or search": 38pt tall, 6pt corners, with a "/" key hint on Mac.
struct CaptureField: View {
  @Binding var text: String
  var prompt = "Paste a link to save, or search"
  var focus: FocusState<Bool>.Binding?
  var onSubmit: () -> Void = {}

  @FocusState private var ownFocus: Bool

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: text.hasPrefix("http") ? "plus" : "magnifyingglass")
        .font(.ui(13))
        .foregroundStyle(Color.stMuted)
      TextField("", text: $text, prompt: Text(prompt).foregroundStyle(Color.stMuted))
        .textFieldStyle(.plain)
        .font(.ui(14))
        .focused(focus ?? $ownFocus)
        .onSubmit(onSubmit)
        #if os(iOS)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.go)
        #endif
      #if os(macOS)
      if text.isEmpty {
        KeyHint("/")
      }
      #endif
    }
    .padding(.horizontal, 12)
    .frame(height: 38)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}

/// A key drawn as a small outlined cap, e.g. "/" or "⌘S".
struct KeyHint: View {
  let key: String

  init(_ key: String) { self.key = key }

  var body: some View {
    Text(key)
      .font(.mono(11))
      .foregroundStyle(Color.stMuted)
      .padding(.horizontal, 4)
      .frame(minWidth: 18, minHeight: 18)
      .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
  }
}
