import SwiftUI

enum AppSection: String, Hashable {
  case feeds, saved, archive, settings
}

/// Tabs on iPhone, a sidebar on Mac, grouped like the web app's Read section.
struct MainView: View {
  @SceneStorage("section") private var section: AppSection = .feeds

  var body: some View {
    TabView(selection: $section) {
      TabSection("Read") {
        Tab("Feeds", systemImage: "dot.radiowaves.up.forward", value: AppSection.feeds) {
          FeedsView()
        }
        Tab("Saved", systemImage: "bookmark", value: AppSection.saved) {
          SavedView(archive: false)
        }
        Tab("Archive", systemImage: "archivebox", value: AppSection.archive) {
          SavedView(archive: true)
        }
      }
      Tab("Settings", systemImage: "gearshape", value: AppSection.settings) {
        SettingsView()
      }
    }
    .tabViewStyle(.sidebarAdaptable)
  }
}
