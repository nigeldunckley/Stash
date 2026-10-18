import SwiftUI
import WebKit

/// The reader: native toolbar and controls around the article itself.
struct ReaderScreen: View {
  let item: LibraryItem
  let actions: [ItemAction]
  let perform: (ItemAction, LibraryItem) -> Void

  @Environment(Session.self) private var session
  /// Made when the screen first appears, rather than every time SwiftUI rebuilds this view.
  @State private var reader: ReaderController?
  @State private var loadError: String?
  @AppStorage("readerFontSize") private var fontSize = 20
  @AppStorage("readerFont") private var fontFamily = "Newsreader"

  private static let fonts = ["Newsreader", "Literata", "Geist"]

  var body: some View {
    Group {
      if let reader {
        article(reader)
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .background(Color.stashBackground)
    .navigationTitle(item.source)
    #if os(iOS)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar(.hidden, for: .tabBar)
    #endif
    .toolbar { toolbar }
    .task(id: item.id) { await load() }
    .onChange(of: fontSize) { _, size in reader?.send("updateFontSize", ["fontSize": size]) }
    .onChange(of: fontFamily) { _, font in reader?.send("updateFontFamily", ["fontFamily": font]) }
  }

  private func article(_ reader: ReaderController) -> some View {
    ReaderWebView(webView: reader.webView)
      .ignoresSafeArea(edges: .bottom)
      .opacity(reader.isReady ? 1 : 0)
      .overlay { placeholder(reader) }
      .overlay(alignment: .top) {
        GeometryReader { geometry in
          Rectangle()
            .fill(Color.stashAccent)
            .frame(width: geometry.size.width * reader.progress, height: 2)
        }
        .frame(height: 2)
        .opacity(reader.isReady ? 1 : 0)
      }
  }

  @ViewBuilder
  private func placeholder(_ reader: ReaderController) -> some View {
    if let loadError, !reader.isReady {
      ContentUnavailableView {
        Label("Couldn't open this", systemImage: "doc.text")
      } description: {
        Text(loadError)
      } actions: {
        Button("Try again") { Task { await load() } }
        if let url = item.originalURL { Link("Open original", destination: url) }
      }
    } else if !reader.isReady {
      ProgressView()
    }
  }

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .primaryAction) {
      ForEach(actions, id: \.self) { action in
        Button(role: action == .delete ? .destructive : nil) {
          perform(action, item)
        } label: {
          Label(action.title, systemImage: action.systemImage)
        }
        .help(action.title)
      }

      Menu {
        Button("Larger text", systemImage: "textformat.size.larger") { fontSize = min(fontSize + 2, 40) }
          .keyboardShortcut("+", modifiers: .command)
        Button("Smaller text", systemImage: "textformat.size.smaller") { fontSize = max(fontSize - 2, 12) }
          .keyboardShortcut("-", modifiers: .command)
        Picker("Font", selection: $fontFamily) {
          ForEach(Self.fonts, id: \.self) { Text($0).tag($0) }
        }
      } label: {
        Label("Text", systemImage: "textformat.size")
      }
      .help("Text size and font")

      if let url = item.originalURL {
        ShareLink(item: url)
        Link(destination: url) { Label("Open original", systemImage: "safari") }
          .help("Open original")
      }
    }
  }

  private func load() async {
    loadError = nil
    let reader = self.reader ?? ReaderController()
    self.reader = reader
    do {
      if session.viewer == nil { await session.loadViewer() }
      guard let viewer = session.viewer else { throw StashError.server("Couldn't reach Stash.") }
      let content = try await Library.article(username: viewer.profile.username, slug: item.slug)
      let html = ReaderPage.html(
        for: content,
        viewer: viewer,
        settings: .init(fontSize: fontSize, fontFamily: fontFamily)
      )
      await reader.load(html: html, token: StashAPI.shared.token)
    } catch {
      // A load that was cancelled (the screen changed, or a newer load took over) isn't a
      // failure, and an article that's already showing doesn't need an error over it.
      if Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled
        || reader.isReady {
        return
      }
      loadError = error.localizedDescription
    }
  }
}

#if os(iOS)
struct ReaderWebView: UIViewRepresentable {
  let webView: WKWebView
  func makeUIView(context: Context) -> WKWebView { webView }
  func updateUIView(_ view: WKWebView, context: Context) {}
}
#else
struct ReaderWebView: NSViewRepresentable {
  let webView: WKWebView
  func makeNSView(context: Context) -> WKWebView { webView }
  func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif
