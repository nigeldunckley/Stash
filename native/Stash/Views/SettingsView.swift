import SwiftUI

struct SettingsView: View {
  @Environment(Session.self) private var session
  @Environment(EditionModel.self) private var edition
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

        Section {
          Picker("New issue on", selection: setting("day", edition.state?.day ?? 6)) {
            ForEach(0..<7) { Text(EditionSchedule.dayNames[$0]).tag($0) }
          }
          Picker("At", selection: setting("hour", edition.state?.hour ?? 7)) {
            ForEach(5..<13) { Text(String(format: "%02d:00", $0)).tag($0) }
          }
          Toggle("Show it on Home", isOn: setting("showOnHome", edition.state?.showOnHome ?? true))
          Picker("Up next on Home", selection: setting("upNext", edition.state?.upNext ?? 5)) {
            ForEach(3...5, id: \.self) { Text("\($0) saves").tag($0) }
          }
        } header: {
          Text("The Edition")
        } footer: {
          Text("A weekly issue of what you missed. It shows in the sidebar while it's out, until you mark it read.")
        }
        .disabled(edition.state == nil)

        Section("On the web") {
          Link(destination: StashConfig.server) {
            Label("Open Stash in Safari", systemImage: "safari")
          }
        }

        Section {
          LabeledContent("Version", value: Self.version)
        }
      }
      .formStyle(.grouped)
      .scrollContentBackground(.hidden)
      .background(Color.stPage)
      .navigationTitle("Settings")
      .confirmationDialog("Sign out of Stash?", isPresented: $confirmSignOut) {
        Button("Sign out", role: .destructive) { session.signOut() }
      }
    }
  }

  /// A setting kept with The Edition on your account, shared with the web app.
  private func setting<Value>(_ key: String, _ value: Value) -> Binding<Value> {
    Binding(get: { value }, set: { newValue in Task { await edition.set(key, newValue) } })
  }

  private static var version: String {
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
    let build = info?["CFBundleVersion"] as? String ?? "1"
    return "\(version) (\(build))"
  }
}
