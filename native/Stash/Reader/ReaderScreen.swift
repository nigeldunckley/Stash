import SwiftUI
import WebKit

/// The reader: native toolbar and controls around the article itself.
struct ReaderScreen: View {
  let item: LibraryItem
  let actions: [ItemAction]
  let perform: (ItemAction, LibraryItem) -> Void
  /// Shown inside Home's preview card, which brings its own header and buttons.
  var embedded = false

  @Environment(Session.self) private var session
  @Environment(\.dismiss) private var dismiss
  /// The article picked from the colophon's "Next up", read here in place of `item`.
  @State private var next: LibraryItem?
  /// What the colophon offers to read next, once it's known.
  @State private var upNext: LibraryItem?
  @State private var onScreen = false
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
    .background(Color.stPage)
    .modifier(ScreenChrome(embedded: embedded, title: current.source) { toolbar })
    .task(id: current.id) { await load() }
    .onAppear { onScreen = true }
    // The colophon's handler holds this screen, so let go of it when the screen goes.
    .onDisappear { onScreen = false; reader?.onColophon = nil }
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
            .fill(Color.stAccent)
            .frame(width: geometry.size.width * reader.progress, height: 2)
        }
        .frame(height: 2)
        .opacity(reader.isReady ? 1 : 0)
      }
  }

  @ViewBuilder
  private func placeholder(_ reader: ReaderController) -> some View {
    if let loadError, !reader.isReady {
      EmptyBox(title: "Couldn't open this", message: loadError, systemImage: "doc.text", boxed: false) {
        Button("Try again") { Task { await load() } }
        if let url = current.originalURL { Link("Open original", destination: url) }
      }
    } else if !reader.isReady {
      ProgressView()
    }
  }

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .primaryAction) {
      ForEach(currentActions, id: \.self) { action in
        Button(role: action == .delete ? .destructive : nil) {
          perform(action, current)
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

      if let url = current.originalURL {
        ShareLink(item: url)
        Link(destination: url) { Label("Open original", systemImage: "safari") }
          .help("Open original")
      }
    }
  }

  /// What's showing: the item you opened, or what you went on to from its colophon.
  private var current: LibraryItem { next ?? item }
  /// The toolbar's actions, worked out again for an article reached from the colophon.
  private var currentActions: [ItemAction] { next.map { ItemAction.defaults(for: $0) } ?? actions }

  // MARK: Colophon

  /// The facts and buttons at the end of the article, as on the web.
  private func colophon(for item: LibraryItem) -> [String: Any] {
    var facts: [[String: String]] = []
    if let minutes = item.readingMinutes { facts.append(["label": "Length", "value": "\(minutes) min"]) }
    let highlights = item.highlightsCount ?? 0
    facts.append(["label": "Highlights", "value": highlights == 0 ? "None" : "\(highlights) kept"])
    if !item.source.isEmpty { facts.append(["label": "From", "value": item.source]) }
    if let saved = item.savedAt {
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_GB")
      formatter.dateFormat = "EEE d MMM"
      facts.append(["label": "Saved", "value": formatter.string(from: saved)])
    }
    var result: [String: Any] = [
      "facts": facts,
      "archived": item.isArchived,
      // On Mac the reader sits beside its list, so there's nothing to close.
      "canClose": !embedded,
    ]
    // Beside a list (Mac) or in a preview card, the page that holds the reader moves on itself.
    if !embedded, let upNext {
      let kicker = ["Next", upNext.readingMinutes.map { "\($0) min" }, upNext.progress >= 0.03 ? "Pick up again" : "Newest in Saved"]
        .compactMap { $0 }
        .joined(separator: " · ")
      result["next"] = ["title": upNext.title, "kicker": kicker]
    }
    return result
  }

  /// What to read next, in Home's Up next order: something you've started, then the newest save.
  private static func nextUp(after item: LibraryItem) async -> LibraryItem? {
    let open: (LibraryItem) -> Bool = { $0.id != item.id && !$0.isArchived && $0.progress < 0.9 }
    let started = try? await Library.search("in:inbox use:folders -type:video is:reading sort:read-desc", first: 4)
    if let found = started?.items.first(where: open) { return found }
    let newest = try? await Library.search("in:inbox use:folders -type:video is:unread sort:saved-desc", first: 4)
    return newest?.items.first(where: open)
  }

  private func colophonPicked(_ choice: String, item: LibraryItem) {
    switch choice {
    case "next", "archiveNext":
      if choice == "archiveNext" { archive(item) }
      if let upNext {
        reader?.reset()
        next = upNext
      }
    case "archive":
      guard actions.contains(.archive), next == nil else {
        archive(item)
        if !embedded { dismiss() }
        return
      }
      // The page that opened the reader takes it out of its list; some close the reader as
      // they do, so only close it if it's still showing.
      perform(.archive, item)
      if !embedded {
        Task {
          try? await Task.sleep(for: .seconds(0.35))
          if onScreen { dismiss() }
        }
      }
    default:
      dismiss()
    }
  }

  /// Archives without the opening page's help, for when the reader carries on to something else.
  private func archive(_ item: LibraryItem) {
    guard !item.isArchived else { return }
    Moments.shared.archived(item)
    Task { try? await Library.setArchived(item.id, true) }
  }

  private func load() async {
    loadError = nil
    let reader = self.reader ?? ReaderController()
    self.reader = reader
    do {
      if session.viewer == nil { await session.loadViewer() }
      guard let viewer = session.viewer else { throw StashError.server("Couldn't reach Stash.") }
      let item = current
      async let nextUp = Self.nextUp(after: item)
      let content = try await Library.article(username: viewer.profile.username, slug: item.slug)
      upNext = await nextUp
      reader.onColophon = { choice in colophonPicked(choice, item: item) }
      let html = ReaderPage.html(
        for: content,
        viewer: viewer,
        settings: .init(fontSize: fontSize, fontFamily: fontFamily),
        colophon: colophon(for: item)
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
