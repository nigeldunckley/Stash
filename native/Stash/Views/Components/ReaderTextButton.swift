import SwiftUI

struct ReaderTextButton: View {
  var verticalLabel = false
  @AppStorage("readerFontSize") private var size = 20
  @AppStorage("readerFont") private var font = "Newsreader"
  @AppStorage("readerWidth") private var width = 640
  @State private var showing = false

  var body: some View {
    Button { showing.toggle() } label: {
      if verticalLabel {
        VStack(spacing: 4) {
          Image(systemName: "textformat.size").font(.ui(19))
          Text("Text").font(.ui(11))
        }
        .frame(minWidth: 52, minHeight: 48)
      } else {
        Label("Text", systemImage: "textformat.size")
      }
    }
      .help("Reading appearance")
      .popover(isPresented: $showing) {
        VStack(alignment: .leading, spacing: 18) {
          Text("Reading appearance").font(.stSection)
          Picker("Font", selection: $font) {
            ForEach(["Newsreader", "Literata", "Geist"], id: \.self) { Text($0).tag($0) }
          }
          .pickerStyle(.menu)
          HStack {
            Text("Text size")
            Spacer()
            Button { size = max(12, size - 2) } label: { Image(systemName: "minus") }
              .disabled(size <= 12).accessibilityLabel("Smaller text")
            Text("\(size)").font(.stDetail).monospacedDigit().frame(minWidth: 28)
            Button { size = min(40, size + 2) } label: { Image(systemName: "plus") }
              .disabled(size >= 40).accessibilityLabel("Larger text")
          }
          Picker("Line width", selection: $width) {
            Text("Narrow").tag(560)
            Text("Standard").tag(640)
            Text("Wide").tag(720)
          }
          .pickerStyle(.menu)
          #if os(iOS)
          Button("Done") { showing = false }.frame(maxWidth: .infinity).buttonStyle(.text)
          #endif
        }
        .font(.stBody)
        .buttonStyle(.text)
        .padding(20)
        .frame(minWidth: 300)
        .background(Color.stPanel)
        .presentationCompactAdaptation(.popover)
      }
  }
}
