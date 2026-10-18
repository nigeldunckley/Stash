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
      CommandGroup(replacing: .newItem) {
        Button("Save a Link…") { NotificationCenter.default.post(name: .stashCapture, object: nil) }
          .keyboardShortcut("n", modifiers: .command)
      }
      CommandGroup(replacing: .appSettings) {
        Button("Settings…") { NotificationCenter.default.post(name: .stashOpenSettings, object: nil) }
          .keyboardShortcut(",", modifiers: .command)
      }
      CommandGroup(replacing: .sidebar) {
        Button(sidebarHidden ? "Show Sidebar" : "Hide Sidebar") { sidebarHidden.toggle() }
          .keyboardShortcut("s", modifiers: [.control, .command])
      }
    }
    #endif
  }
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
