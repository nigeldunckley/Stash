import SwiftUI

struct LinkCaptureView: View {
  let done: () -> Void
  @State private var capture = LinkCapture()
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Save a link").font(.stSection)
      TextField("Website address", text: $capture.text)
        .textFieldStyle(.plain)
        .font(.stBody)
        .focused($focused)
        .padding(12)
        .background(Color.stSunken, in: RoundedRectangle(cornerRadius: Radius.sm))
        .disabled(capture.busy || capture.accepted)
        .onSubmit(submit)
        .accessibilityLabel("Website address")
        #if os(iOS)
        .keyboardType(.URL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        #endif
      if let message = capture.message {
        HStack(alignment: .top, spacing: 8) {
          if capture.busy { ProgressView().controlSize(.small) }
          Text(message).font(.stSmall).foregroundStyle(Color.stInk2)
            .accessibilityAddTraits(.updatesFrequently)
        }
      }
      HStack {
        Spacer()
        Button(capture.accepted ? "Done" : "Cancel", action: done).buttonStyle(.text)
          .keyboardShortcut(.cancelAction)
        if !capture.accepted {
          Button(capture.phase == .failed ? "Try again" : "Save", action: submit)
            .buttonStyle(.textProminent)
            .disabled(capture.busy || capture.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .keyboardShortcut(.defaultAction)
        }
      }
    }
    .padding(20)
    .background(Color.stPanel)
    .onAppear { focused = true }
  }

  private func submit() { Task { await capture.submit() } }
}

extension View {
  func linkCapture(isPresented: Binding<Bool>) -> some View {
    #if os(macOS)
    popover(isPresented: isPresented, arrowEdge: .bottom) {
      LinkCaptureView { isPresented.wrappedValue = false }.frame(width: 380)
    }
    #else
    sheet(isPresented: isPresented) {
      LinkCaptureView { isPresented.wrappedValue = false }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
    #endif
  }
}
