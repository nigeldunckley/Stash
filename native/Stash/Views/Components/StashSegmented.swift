import SwiftUI

/// The web's quiet segmented control: a 1pt outline with a 2pt inset, and the chosen option
/// filled grey rather than orange. Options can carry a count.
struct StashSegmented<Value: Hashable>: View {
  @Binding var selection: Value
  let options: [Option]

  struct Option {
    let value: Value
    let title: String
    var count: Int?

    init(_ title: String, _ value: Value, count: Int? = nil) {
      self.title = title
      self.value = value
      self.count = count
    }
  }

  init(selection: Binding<Value>, _ options: [Option]) {
    _selection = selection
    self.options = options
  }

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options.indices, id: \.self) { index in
        let option = options[index]
        let chosen = option.value == selection
        Button {
          withAnimation(.snappy(duration: 0.15)) { selection = option.value }
        } label: {
          HStack(spacing: 5) {
            Text(option.title)
              .font(.ui(12, chosen ? .medium : .regular, relativeTo: .footnote))
            if let count = option.count, count > 0 {
              Text("\(count)")
                .font(.mono(11))
                .monospacedDigit()
            }
          }
          .foregroundStyle(chosen ? Color.stInk : Color.stMuted)
          .padding(.horizontal, 10)
          .frame(minHeight: 22)
          .background(chosen ? Color.stSelected : Color.clear, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? .isSelected : [])
      }
    }
    .padding(2)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .fixedSize()
  }
}
