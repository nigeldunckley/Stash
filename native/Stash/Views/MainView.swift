import SwiftUI

enum AppSection: Hashable {
  case feeds, saved, archive, channels, savedVideos, settings
  case collection(String)

  /// Kept between launches as text.
  var key: String {
    switch self {
    case .feeds: return "feeds"
    case .saved: return "saved"
    case .archive: return "archive"
    case .channels: return "channels"
    case .savedVideos: return "savedVideos"
    case .settings: return "settings"
    case .collection(let id): return "collection:\(id)"
    }
  }

  init(key: String) {
    switch key {
    case "saved": self = .saved
    case "archive": self = .archive
    case "channels": self = .channels
    case "savedVideos": self = .savedVideos
    case "settings": self = .settings
    case let other where other.hasPrefix("collection:"): self = .collection(String(other.dropFirst(11)))
    default: self = .feeds
    }
  }
}

/// Tabs on iPhone, a sidebar on Mac, grouped into Read and Watch like the web app.
struct MainView: View {
  @SceneStorage("section") private var storedSection = "feeds"
  @State private var section: AppSection = .feeds
  @State private var collections: [WatchCollection] = []

  var body: some View {
    TabView(selection: $section) {
      TabSection("Read") {
        Tab("Feeds", systemImage: "dot.radiowaves.up.forward", value: AppSection.feeds) {
          FeedsView()
        }
        Tab("Saved", systemImage: "bookmark", value: AppSection.saved) {
          SavedView(archive: false)
        }
        // On iPhone the archive is a switch inside Saved, to keep the tab bar short.
        Tab("Archive", systemImage: "archivebox", value: AppSection.archive) {
          SavedView(archive: true)
        }
        .tabPlacement(.sidebarOnly)
      }

      TabSection("Watch") {
        Tab("Channels", systemImage: "play.rectangle", value: AppSection.channels) {
          WatchView(kind: .channels)
        }
        Tab(savedVideosTitle, systemImage: "play.rectangle.on.rectangle", value: AppSection.savedVideos) {
          WatchView(kind: .saved)
        }
        ForEach(collections) { collection in
          Tab(collection.name, systemImage: "square.stack", value: AppSection.collection(collection.id)) {
            WatchView(kind: .collection(collection))
          }
          .tabPlacement(.sidebarOnly)
        }
      }

      Tab("Settings", systemImage: "gearshape", value: AppSection.settings) {
        SettingsView()
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .onAppear { section = AppSection(key: storedSection) }
    .onChange(of: section) { _, value in storedSection = value.key }
    .task { collections = (try? await Watch.collections()) ?? [] }
  }

  private var savedVideosTitle: String {
    #if os(iOS)
    return "Videos"
    #else
    return "Saved"
    #endif
  }
}
