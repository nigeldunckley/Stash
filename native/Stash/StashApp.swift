import SwiftUI

@main
struct StashApp: App {
  @State private var session = Session()
  /// One video player for the whole app.
  @State private var player = PlayerController()
  /// The Edition's state, so the sidebar knows when an issue is out.
  @State private var edition = EditionModel()
  #if os(macOS)
  /// Shared with the Mac sidebar, so ⌃⌘S and its strip button stay in step.
  @AppStorage("sidebarHidden") private var sidebarHidden = false
  #endif

  init() {
    StashFonts.register()
  }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(session)
        .environment(player)
        .environment(edition)
        .font(.stBody)
        .foregroundStyle(Color.stInk)
        .tint(.stAccent)
    }
    #if os(macOS)
    .defaultSize(width: 1240, height: 820)
    .windowToolbarStyle(.unified)
    .windowBackgroundDragBehavior(.enabled)
    .commands {
      #if DEBUG
      if AppPreview.enabled {
        CommandMenu("Preview") {
          Button("Minimum window") { previewWindow(width: 640, height: 560) }
          Button("Compact window") { previewWindow(width: 760, height: 640) }
          Button("Standard window") { previewWindow(width: 1240, height: 820) }
        }
      }
      #endif
      CommandGroup(replacing: .newItem) {
        Button("Save a Link…") { NotificationCenter.default.post(name: .stashCapture, object: nil) }
          .keyboardShortcut("n", modifiers: .command)
      }
      CommandGroup(replacing: .appSettings) {
        Button("Settings…") { NotificationCenter.default.post(name: .stashOpenSettings, object: nil) }
          .keyboardShortcut(",", modifiers: .command)
      }
      CommandGroup(after: .windowArrangement) {
        Button("Float Video on Top") { NotificationCenter.default.post(name: .stashPopOut, object: nil) }
          .keyboardShortcut("p", modifiers: [.option, .command])
      }
      CommandMenu("Reading") {
        Button("Larger text") { NotificationCenter.default.post(name: .stashLargerText, object: nil) }
          .keyboardShortcut("+", modifiers: .command)
        Button("Smaller text") { NotificationCenter.default.post(name: .stashSmallerText, object: nil) }
          .keyboardShortcut("-", modifiers: .command)
        Divider()
        Button("Toggle Focus mode") { NotificationCenter.default.post(name: .stashToggleFocus, object: nil) }
          .keyboardShortcut("f", modifiers: [.option, .command])
      }
      CommandMenu("Go") {
        Button("Back") { NotificationCenter.default.post(name: .stashBack, object: nil) }
          .keyboardShortcut("[", modifiers: .command)
        Button("Forward") { NotificationCenter.default.post(name: .stashForward, object: nil) }
          .keyboardShortcut("]", modifiers: .command)
      }
      CommandGroup(replacing: .sidebar) {
        Button(sidebarHidden ? "Show Sidebar" : "Hide Sidebar") { sidebarHidden.toggle() }
          .keyboardShortcut("s", modifiers: [.control, .command])
      }
    }
    #endif
  }

  #if os(macOS) && DEBUG
  private func previewWindow(width: CGFloat, height: CGFloat) {
    NSApplication.shared.windows.first { $0.isVisible && $0.contentView != nil }?
      .setContentSize(CGSize(width: width, height: height))
  }
  #endif
}

struct RootView: View {
  @Environment(Session.self) private var session

  var body: some View {
    Group {
      if session.isSignedIn {
        MainView()
          .task { await session.loadViewer() }
      } else {
        SignInView()
      }
    }
    .animation(.default, value: session.isSignedIn)
  }
}
