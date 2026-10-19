#if os(macOS)
import SwiftUI

/// Stash's floating sidebar for Mac: a 251pt panel with 14pt corners, a 1pt line and the
/// web's soft shadow. Stash mark and + at the top, Read and Watch groups that fold, and your
/// account with Settings at the bottom.
struct SidebarPanel: View {
  @Binding var section: AppSection
  let collections: [WatchCollection]
  /// Unseen videos from your channels, shown as an orange badge.
  let channelsCount: Int?
  /// New Discover suggestions, shown as "11 new".
  let discoverCount: Int?

  @Environment(Session.self) private var session
  @Environment(EditionModel.self) private var edition
  @Environment(\.colorScheme) private var colorScheme
  @AppStorage("sidebarReadOpen") private var readOpen = true
  @AppStorage("sidebarWatchOpen") private var watchOpen = true
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  /// The + button's save box, also opened by ⌘N.
  @Binding var capturing: Bool

  var body: some View {
    VStack(spacing: 0) {
      header
      ScrollView {
        VStack(alignment: .leading, spacing: 1) {
          row("Home", "house", .home)
          if edition.isOut {
            row("The Edition", "newspaper", .edition) {
              if edition.isFresh { Text("New").font(.mono(11)).foregroundStyle(Color.stAccentText) }
            }
          }

          SidebarGroupLabel(title: "Read", isOpen: $readOpen)
          if readOpen {
            row("Feeds", "dot.radiowaves.up.forward", .feeds)
            SidebarRow(title: "Saved", ribbon: .saved, selected: section == .saved, action: { go(.saved) }) {
              LandingCount(kind: .saved)
            }
            .momentTarget(.saved)
            row("Highlights", "highlighter", .highlights)
            row("Discover", "safari", .discover) {
              if let discoverCount, discoverCount > 0 {
                Text("\(discoverCount) new").font(.mono(11)).monospacedDigit().foregroundStyle(Color.stAccentText)
              }
            }
            row("Archive", "archivebox", .archive) { LandingCount(kind: .archived) }
              .momentTarget(.archived)
          }

          SidebarGroupLabel(title: "Watch", isOpen: $watchOpen)
          if watchOpen {
            row("Latest", "play.rectangle", .channels) {
              if let channelsCount, channelsCount > 0 { Count(channelsCount, style: .badge) }
            }
            SidebarRow(title: "Saved", ribbon: .savedVideo, selected: section == .savedVideos, action: { go(.savedVideos) }) {
              LandingCount(kind: .savedVideo)
            }
            .momentTarget(.savedVideo)
            ForEach(collections) { collection in
              SidebarRow(
                title: collection.name,
                dot: Color(hexString: collection.color) ?? .stMuted,
                selected: section == .collection(collection.id),
                child: true
              ) { go(.collection(collection.id)) }
            }
          }
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 12)
      }
      .scrollIndicators(.never)
      account
    }
    .frame(width: 251)
    .background(Color.stPanel, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    // The web's shadow: a hairline lift and a soft drop (stronger on dark).
    .shadow(color: .black.opacity(colorScheme == .dark ? 0 : 0.04), radius: 1, y: 1)
    .shadow(color: .black.opacity(colorScheme == .dark ? 0.6 : 0.14), radius: colorScheme == .dark ? 16 : 16, y: colorScheme == .dark ? 12 : 12)
  }

  private var header: some View {
    HStack(spacing: 9) {
      Image("Mark")
        .resizable()
        .interpolation(.high)
        .frame(width: 22, height: 22)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
      Text("Stash")
        .font(.ui(17, .semibold))
        .tracking(-0.34)
        .foregroundStyle(Color.stInk)
      Spacer(minLength: 0)
      SidebarIconButton(symbol: "sidebar.left", help: "Hide the sidebar (⌃⌘S)") {
        withAnimation(.snappy(duration: 0.25)) { sidebarHidden = true }
      }
      SidebarIconButton(symbol: "plus", help: "Save a link (⌘N)") { capturing = true }
        .popover(isPresented: $capturing, arrowEdge: .bottom) {
          CapturePopover { capturing = false }
        }
    }
    .padding(.leading, 16)
    .padding(.trailing, 10)
    .frame(height: 56)
  }

  private var account: some View {
    HStack(spacing: 10) {
      Text(initial)
        .font(.ui(13, .semibold))
        .foregroundStyle(Color.stAccentText)
        .frame(width: 26, height: 26)
        .background(Color.stAccent.opacity(colorScheme == .dark ? 0.14 : 0.10), in: Circle())
      Text(session.viewer?.name ?? "")
        .font(.ui(13))
        .foregroundStyle(Color.stInk)
        .lineLimit(1)
      Spacer(minLength: 0)
      SidebarIconButton(symbol: "gearshape", help: "Settings (⌘,)") { go(.settings) }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(section == .settings ? Color.stSunken : Color.clear)
    .overlay(alignment: .top) { Rectangle().fill(Color.stLine).frame(height: 1) }
  }

  /// Opens a page; clicking the one you're on takes it back to its top.
  private func go(_ target: AppSection) {
    if section == target {
      NotificationCenter.default.post(name: .stashPageTop, object: nil)
    } else {
      section = target
    }
  }

  private var initial: String {
    String((session.viewer?.name ?? "S").prefix(1)).uppercased()
  }

  private func row<Trailing: View>(_ title: String, _ symbol: String, _ target: AppSection, @ViewBuilder trailing: @escaping () -> Trailing) -> some View {
    SidebarRow(title: title, symbol: symbol, selected: section == target, action: { go(target) }, trailing: trailing)
  }

  private func row(_ title: String, _ symbol: String, _ target: AppSection) -> some View {
    SidebarRow(title: title, symbol: symbol, selected: section == target) { go(target) }
  }
}

/// The + button's box: paste a link and press Return to save it.
private struct CapturePopover: View {
  let done: () -> Void

  @State private var link = ""
  @State private var status: String?
  @State private var saving = false
  @FocusState private var focused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      CaptureField(text: $link, prompt: "Paste a link to save", focus: $focused, onSubmit: save)
        .disabled(saving)
      if let status {
        Text(status)
          .font(.stSmall)
          .foregroundStyle(Color.stMuted)
      }
    }
    .padding(12)
    .frame(width: 360)
    .background(Color.stPanel)
    .onAppear {
      if let text = NSPasteboard.general.string(forType: .string), text.hasPrefix("http"), URL(string: text) != nil {
        link = text
      }
      focused = true
    }
  }

  private func save() {
    var url = link.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !url.isEmpty else { return }
    if !url.lowercased().hasPrefix("http") { url = "https://" + url }
    saving = true
    status = "Saving…"
    Task {
      do {
        try await Library.save(url: url)
        Moments.shared.saved(title: url)
        status = "Saved. It's on its way to Saved."
        try? await Task.sleep(for: .seconds(1))
        done()
      } catch {
        status = error.localizedDescription
        saving = false
      }
    }
  }
}
#endif
