import SwiftUI

struct SettingsView: View {
  @Environment(Session.self) private var session
  @AppStorage("readerFontSize") private var fontSize = 20
  @AppStorage("readerFont") private var fontFamily = "Newsreader"
  @State private var confirmSignOut = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Account") {
          LabeledContent("Name", value: session.viewer?.name ?? "…")
          LabeledContent("Email", value: session.viewer?.email ?? "…")
          LabeledContent("Server", value: StashConfig.server.host() ?? "")
          Button("Sign out", role: .destructive) { confirmSignOut = true }
        }

        Section("Reading") {
          Picker("Font", selection: $fontFamily) {
            ForEach(["Newsreader", "Literata", "Geist"], id: \.self) { Text($0).tag($0) }
          }
          Stepper("Text size: \(fontSize)", value: $fontSize, in: 12...40, step: 2)
        }

        Section("On the web") {
          Link(destination: StashConfig.server) {
            Label("Open Stash in Safari", systemImage: "safari")
          }
          Text("Discover, Highlights and The Edition are on the web for now and are coming to the app next.")
            .font(.footnote)
            .foregroundStyle(Color.stashMuted)
        }

        Section {
          LabeledContent("Version", value: Self.version)
        }
      }
      .formStyle(.grouped)
      .navigationTitle("Settings")
      .confirmationDialog("Sign out of Stash?", isPresented: $confirmSignOut) {
        Button("Sign out", role: .destructive) { session.signOut() }
      }
    }
  }

  private static var version: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
    let build = info?["CFBundleVersion"] as? String ?? "1"
    return "\(version) (\(build))"
  }
}
