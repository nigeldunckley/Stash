import SwiftUI

enum AppSection: Hashable {
  case home, edition, feeds, saved, highlights, discover, archive, channels, savedVideos, settings
  case collection(String)
  /// iPhone only: Read and Watch, each with a row of pages along the top.
  case read, watch

  /// Kept between launches as text.
  var key: String {
    switch self {
    case .home: return "home"
    case .edition: return "edition"
    case .feeds: return "feeds"
    case .saved: return "saved"
    case .highlights: return "highlights"
    case .discover: return "discover"
    case .archive: return "archive"
    case .channels: return "channels"
    case .savedVideos: return "savedVideos"
    case .settings: return "settings"
    case .read: return "read"
    case .watch: return "watch"
    case .collection(let id): return "collection:\(id)"
    }
  }

  init(key: String) {
    switch key {
    case "edition": self = .edition
    case "feeds": self = .feeds
    case "saved": self = .saved
    case "highlights": self = .highlights
    case "discover": self = .discover
    case "archive": self = .archive
    case "channels": self = .channels
    case "savedVideos": self = .savedVideos
    case "settings": self = .settings
    case "read": self = .read
    case "watch": self = .watch
    case let other where other.hasPrefix("collection:"): self = .collection(String(other.dropFirst(11)))
    default: self = .home
    }
  }
}

/// A sidebar on Mac, grouped into Read and Watch like the web app. On iPhone, tabs for Home,
/// Read, Watch and Settings, with The Edition beside Home while an issue is out.
struct MainView: View {
  @Environment(EditionModel.self) private var edition
  @Environment(\.scenePhase) private var scenePhase
  @SceneStorage("section") private var storedSection = "home"
  @State private var section: AppSection = .home
  @State private var collections: [WatchCollection] = []
  /// Which page Read and Watch show on iPhone.
  @State private var readPage: AppSection = .feeds
  @State private var watchPage: AppSection = .channels
  #if os(iOS)
  @Environment(PlayerController.self) private var player
  /// The full player, opened from the mini player.
  @State private var showingPlayer = false
  #endif

  var body: some View {
    shell
      .onAppear {
        let restored = AppSection(key: storedSection)
        // The Edition's tab only exists while an issue is out; check again once it has loaded.
        section = restored == .edition && !edition.isOut ? .home : restored
      }
      .onChange(of: section) { _, value in storedSection = value.key }
      .onChange(of: edition.isOut) { _, out in if !out && section == .edition { section = .home } }
      .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await edition.refresh() } } }
      .task { collections = (try? await Watch.collections()) ?? [] }
      .task {
        await edition.refresh()
        if storedSection == "edition" && edition.isOut { section = .edition }
      }
  }

  #if os(macOS)
  /// Stash's own floating sidebar beside the page, rather than the system sidebar.
  private var shell: some View {
    MacShell(section: $section, collections: collections)
  }
  #else
  private var shell: some View {
    TabView(selection: $section) {
      Tab("Home", systemImage: "house", value: AppSection.home) {
        HomeView(go: go)
      }
      if edition.isOut {
        Tab("The Edition", systemImage: "newspaper", value: AppSection.edition) {
          EditionView(onPutAway: { section = .home })
        }
        .badge(edition.isFresh ? Text("New") : nil)
      }
      Tab("Read", systemImage: "text.alignleft", value: AppSection.read) {
        PageRow(selection: $readPage, pages: [
          (.feeds, "Feeds"), (.saved, "Saved"), (.highlights, "Highlights"), (.discover, "Discover"),
        ]) { page in
          switch page {
          case .saved: SavedView(archive: false)
          case .highlights: HighlightsView()
          case .discover: DiscoverView()
          default: FeedsView()
          }
        }
      }
      Tab("Watch", systemImage: "play.rectangle", value: AppSection.watch) {
        PageRow(selection: $watchPage, pages: watchPages) { page in
          switch page {
          case .savedVideos: WatchView(kind: .saved)
          case .collection(let id):
            if let collection = collections.first(where: { $0.id == id }) {
              WatchView(kind: .collection(collection))
            } else {
              WatchView(kind: .channels)
            }
          default: WatchView(kind: .channels)
          }
        }
      }
      Tab("Settings", systemImage: "gearshape", value: AppSection.settings) {
        SettingsView()
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    // The video you left, just above the tab bar.
    .overlay(alignment: .bottom) {
      if player.host == .mini {
        MiniPlayer(onExpand: { showingPlayer = true })
          .padding(.horizontal, 10)
          .padding(.bottom, 58)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.snappy(duration: 0.25), value: player.host == .mini)
    .sheet(isPresented: $showingPlayer) {
      if let item = player.item {
        NavigationStack {
          PlayerScreen(item: item, queue: player.queue, actions: [], perform: { _, _ in })
            .toolbar {
              ToolbarItem(placement: .cancellationAction) {
                Button("Done") { showingPlayer = false }
              }
            }
        }
      }
    }
  }
  #endif

  private var watchPages: [(AppSection, String)] {
    [(AppSection.channels, "Latest"), (AppSection.savedVideos, "Saved")]
      + collections.map { (AppSection.collection($0.id), $0.name) }
  }

  /// Goes to a part of the app. On iPhone, pages inside Read and Watch open their tab.
  private func go(_ target: AppSection) {
    #if os(iOS)
    switch target {
    case .feeds, .saved, .highlights, .discover:
      readPage = target
      section = .read
      return
    case .channels, .savedVideos, .collection:
      watchPage = target
      section = .watch
      return
    default: break
    }
    #endif
    section = target
  }
}

#if os(iOS)
/// A row of pages along the top of a tab, as on the web app's iPhone layout.
struct PageRow<Content: View>: View {
  @Binding var selection: AppSection
  let pages: [(AppSection, String)]
  @ViewBuilder let content: (AppSection) -> Content

  var body: some View {
    content(selection)
      .id(selection)
      .safeAreaInset(edge: .top, spacing: 0) {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(pages, id: \.0) { page, title in
              Button(title) { selection = page }
                .font(.ui(13, selection == page ? .medium : .regular, relativeTo: .subheadline))
                .foregroundStyle(selection == page ? Color.stPage : Color.stInk)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selection == page ? Color.stInk : Color.stSunken, in: Capsule())
                .buttonStyle(.plain)
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
        }
        .background(.bar)
      }
  }
}
#endif
