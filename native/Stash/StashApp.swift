import SwiftUI

@main
struct StashApp: App {
  @State private var session = Session()
  /// One video player for the whole app.
  @State private var player = PlayerController()
  /// The Edition's state, so the sidebar knows when an issue is out.
  @State private var edition = EditionModel()

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(session)
        .environment(player)
        .environment(edition)
        .tint(.stashAccent)
    }
    #if os(macOS)
    .defaultSize(width: 1240, height: 820)
    .commands {
      CommandGroup(replacing: .newItem) {}
      SidebarCommands()
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
