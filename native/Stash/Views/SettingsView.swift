import SwiftUI

struct SettingsView: View {
  @Environment(Session.self) private var session
  @Environment(EditionModel.self) private var edition
  @AppStorage("readerFontSize") private var fontSize = 20
  @AppStorage("readerFont") private var fontFamily = "Newsreader"
  @State private var confirmSignOut = false
  @AppStorage("sounds") private var sounds = false
  @AppStorage("watchOnLeave") private var onLeave = "mini"
  @AppStorage("watchOnSwitch") private var onSwitch = "float"
  @Environment(\.openURL) private var openURL

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          SettingsGroup("Account") {
            SettingsRow("Name") { value(session.viewer?.name ?? "…") }
            SettingsRow("Email") { value(session.viewer?.email ?? "…") }
            SettingsRow("Server") { value(StashConfig.server.host() ?? "") }
            SettingsRow("Signed in", divider: false) {
              Button("Sign out", role: .destructive) { confirmSignOut = true }
                .buttonStyle(.text)
            }
          }

          SettingsGroup("Reading") {
            SettingsRow("Font") {
              Picker("Font", selection: $fontFamily) {
                ForEach(["Newsreader", "Literata", "Geist"], id: \.self) { Text($0).tag($0) }
              }
              .settingsPicker()
            }
            SettingsRow("Text size", divider: false) {
              HStack(spacing: 6) {
                Button { fontSize = max(12, fontSize - 2) } label: { Image(systemName: "minus") }
                  .disabled(fontSize <= 12)
                  .accessibilityLabel("Smaller text")
                Text("\(fontSize)")
                  .font(.mono(12))
                  .monospacedDigit()
                  .foregroundStyle(Color.stInk)
                  .frame(minWidth: 26)
                Button { fontSize = min(40, fontSize + 2) } label: { Image(systemName: "plus") }
                  .disabled(fontSize >= 40)
                  .accessibilityLabel("Larger text")
              }
              .buttonStyle(.text)
            }
          }

          SettingsGroup("This device", footer: "A soft paper slip when you save and a drawer closing when you archive.") {
            SettingsRow("Sounds", divider: false) {
              Toggle("Sounds", isOn: $sounds)
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(Color.stAccent)
                .controlSize(.small)
            }
          }

          SettingsGroup("Watch: when you leave a playing video") {
            SettingsChoice("Keep playing in the mini player", detail: "It sits in the corner until you close it.", value: "mini", selection: $onLeave)
            SettingsChoice("Pause", detail: "Your place is saved for next time.", value: "pause", selection: $onLeave, divider: false)
          }

          #if os(macOS)
          SettingsGroup("Watch: when you switch to another app") {
            SettingsChoice("Float the video on top", detail: "It pops out by itself and comes back when you return.", value: "float", selection: $onSwitch)
            SettingsChoice("Only when I ask", detail: "Use ⌥⌘P or the float button on the video.", value: "ask", selection: $onSwitch)
            SettingsChoice("Keep playing sound only", detail: "Good for talks and podcasts.", value: "sound", selection: $onSwitch, divider: false)
          }
          #endif

          SettingsGroup(
            "The Edition",
            footer: "A weekly issue of what you missed. It shows in the sidebar while it's out, until you mark it read."
          ) {
            SettingsRow("New issue on") {
              Picker("New issue on", selection: setting("day", edition.state?.day ?? 6)) {
                ForEach(0..<7) { Text(EditionSchedule.dayNames[$0]).tag($0) }
              }
              .settingsPicker()
            }
            SettingsRow("At") {
              Picker("At", selection: setting("hour", edition.state?.hour ?? 7)) {
                ForEach(5..<13) { Text(String(format: "%02d:00", $0)).tag($0) }
              }
              .settingsPicker()
            }
            SettingsRow("Show it on Home") {
              Toggle("Show it on Home", isOn: setting("showOnHome", edition.state?.showOnHome ?? true))
                .labelsHidden()
                .toggleStyle(.switch)
                .tint(Color.stAccent)
                .controlSize(.small)
            }
            SettingsRow("Up next on Home", divider: false) {
              Picker("Up next on Home", selection: setting("upNext", edition.state?.upNext ?? 5)) {
                ForEach(3...5, id: \.self) { Text("\($0) saves").tag($0) }
              }
              .settingsPicker()
            }
          }
          .disabled(edition.state == nil)

          SettingsGroup("On the web") {
            SettingsRow("Stash on the web", divider: false) {
              Button { openURL(StashConfig.server) } label: {
                Label("Open in Safari", systemImage: "safari")
              }
              .buttonStyle(.text)
            }
          }

          SettingsGroup("About") {
            SettingsRow("Version", divider: false) { value(Self.version) }
          }
        }
        .frame(maxWidth: 640, alignment: .leading)
        .pageWidth()
        .padding(.top, 8)
        .padding(.bottom, 40)
      }
      .background(Color.stPage)
      .stashPage("Settings")
      .confirmationDialog("Sign out of Stash?", isPresented: $confirmSignOut) {
        Button("Sign out", role: .destructive) { session.signOut() }
      }
    }
  }

  private func value(_ text: String) -> some View {
    Text(text)
      .font(.ui(13))
      .foregroundStyle(Color.stMuted)
      .lineLimit(1)
      .truncationMode(.middle)
      .textSelection(.enabled)
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

/// A group of settings as the web draws them: a mono caps label over a bordered box of rows.
struct SettingsGroup<Content: View>: View {
  let title: String
  var footer: String?
  @ViewBuilder var content: () -> Content

  init(_ title: String, footer: String? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.footer = footer
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title.uppercased())
        .stashLabel()
        .foregroundStyle(Color.stMuted)
        .padding(.leading, 2)
      VStack(spacing: 0) { content() }
        .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
      if let footer {
        Text(footer)
          .font(.ui(12, relativeTo: .footnote))
          .foregroundStyle(Color.stMuted)
          .padding(.horizontal, 2)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

/// One setting: its name on the left, its control on the right.
struct SettingsRow<Control: View>: View {
  let label: String
  var divider = true
  @ViewBuilder var control: () -> Control

  init(_ label: String, divider: Bool = true, @ViewBuilder control: @escaping () -> Control) {
    self.label = label
    self.divider = divider
    self.control = control
  }

  var body: some View {
    HStack(spacing: 16) {
      Text(label)
        .font(.ui(13, .medium, relativeTo: .subheadline))
        .foregroundStyle(Color.stInk)
      Spacer(minLength: 12)
      control()
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 46)
    .overlay(alignment: .bottom) {
      if divider { Rectangle().fill(Color.stLine).frame(height: 1).padding(.leading, 14) }
    }
  }
}

/// One of a group's choices, with a line saying what it does and an orange dot when chosen.
struct SettingsChoice: View {
  let title: String
  let detail: String
  let value: String
  @Binding var selection: String
  var divider = true

  init(_ title: String, detail: String, value: String, selection: Binding<String>, divider: Bool = true) {
    self.title = title
    self.detail = detail
    self.value = value
    self._selection = selection
    self.divider = divider
  }

  var body: some View {
    Button { selection = value } label: {
      HStack(alignment: .top, spacing: 12) {
        Circle()
          .strokeBorder(selection == value ? Color.stAccent : Color.stLineStrong, lineWidth: selection == value ? 5 : 1.5)
          .frame(width: 16, height: 16)
          .padding(.top, 2)
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.ui(13, .medium, relativeTo: .subheadline))
            .foregroundStyle(Color.stInk)
          Text(detail)
            .font(.ui(12, relativeTo: .footnote))
            .foregroundStyle(Color.stMuted)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selection == value ? .isSelected : [])
    .overlay(alignment: .bottom) {
      if divider { Rectangle().fill(Color.stLine).frame(height: 1).padding(.leading, 14) }
    }
  }
}

private extension View {
  /// A picker that shows its choice as a quiet menu.
  func settingsPicker() -> some View {
    labelsHidden()
      .pickerStyle(.menu)
      .tint(Color.stInk2)
      .fixedSize()
  }
}
