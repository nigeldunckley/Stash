import SwiftUI
import WebKit

/// The reader: native toolbar and controls around the article itself.
struct ReaderScreen: View {
  let item: LibraryItem
  let actions: [ItemAction]
  let perform: (ItemAction, LibraryItem) -> Void
  /// Shown inside Home's preview card, which brings its own header and buttons.
  var embedded = false
  var paneControls = false
  var onBack: (() -> Void)?
  var onFocus: (() -> Void)?

  @Environment(Session.self) private var session
  @Environment(\.dismiss) private var dismiss
  @Environment(\.isActivePage) private var isActivePage
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @ScaledMetric(relativeTo: .body) private var typeScale: CGFloat = 1
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
  @AppStorage("readerWidth") private var lineWidth = 640
  private var toaster: Toaster { Toaster.shared }

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
    .safeAreaInset(edge: .top, spacing: 0) {
      if paneControls { paneToolbar }
    }
    .task(id: current.id) { await load() }
    .onAppear { onScreen = true }
    // The colophon's handler holds this screen, so let go of it when the screen goes.
    .onDisappear { onScreen = false; reader?.onColophon = nil }
    .onReceive(NotificationCenter.default.publisher(for: .stashLargerText)) { _ in
      if onScreen && isActivePage { fontSize = min(40, fontSize + 2) }
    }
    .onReceive(NotificationCenter.default.publisher(for: .stashSmallerText)) { _ in
      if onScreen && isActivePage { fontSize = max(12, fontSize - 2) }
    }
    .onChange(of: fontSize) { _, _ in updateSize() }
    .onChange(of: typeScale) { _, _ in updateSize() }
    .onChange(of: fontFamily) { _, font in reader?.send("updateFontFamily", ["fontFamily": font]) }
    .onChange(of: lineWidth) { _, width in reader?.send("stashReaderWidth", ["width": width]) }
  }

  private func article(_ reader: ReaderController) -> some View {
    ReaderWebView(webView: reader.webView)
      .ignoresSafeArea(edges: .bottom)
      .opacity(reader.isReady ? 1 : 0)
      .animation(StashMotion.fade, value: reader.isReady)
      .overlay { placeholder(reader) }
      .overlay(alignment: .top) {
        GeometryReader { geometry in
          Rectangle()
            .fill(Color.stAccent)
            .frame(width: geometry.size.width * reader.progress, height: 2)
          #if os(iOS)
          // A notch where each section starts.
          if let marks = reader.sections?.marks, (reader.sections?.count ?? 0) > 1 {
            ForEach(Array(marks.enumerated()), id: \.offset) { _, mark in
              Rectangle()
                .fill(Color.stMuted.opacity(0.6))
                .frame(width: 1, height: 6)
                .offset(x: geometry.size.width * min(max(mark, 0), 1))
            }
          }
          #endif
        }
        .frame(height: 2)
        .opacity(reader.isReady ? 1 : 0)
      }
      .safeAreaInset(edge: .bottom) {
        if let error = reader.actionError {
          HStack {
            Text(error).font(.stSmall)
            Button("Try again") { reader.retryAction() }.buttonStyle(.text)
          }
          .padding(12).frame(maxWidth: .infinity).background(Color.stPanel)
        }
      }
  }

  private var effectiveSize: Int { Int((Double(fontSize) * Double(typeScale)).rounded()) }
  private func updateSize() { reader?.send("updateFontSize", ["fontSize": effectiveSize]) }

  private var paneToolbar: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) {
        if let onBack { Button(action: onBack) { Label("Back", systemImage: "chevron.left") }.help("Back to the list") }
        ForEach(currentActions.filter { $0 != .delete }, id: \.self) { action in
          Button { perform(action, current) } label: { Label(action.title(for: current), systemImage: action.systemImage) }.help(action.title(for: current))
        }
        Spacer(minLength: 4)
        ReaderTextButton()
        if let url = current.originalURL { ShareLink(item: url); Link(destination: url) { Label("Open original", systemImage: "safari") }.help("Open original") }
        if currentActions.contains(.delete) {
          Menu {
            Button("Delete", role: .destructive) { perform(.delete, current) }
          } label: { Label("More", systemImage: "ellipsis") }.help("More actions")
        }
        if let onFocus { Button(action: onFocus) { Label("Focus", systemImage: "arrow.up.left.and.arrow.down.right") }.help("Toggle Focus mode") }
      }
      HStack {
        if let onBack { Button(action: onBack) { Label("Back", systemImage: "chevron.left") }.help("Back to the list") }
        Spacer()
        ReaderTextButton()
        Menu {
          ForEach(currentActions, id: \.self) { action in
            Button { perform(action, current) } label: { Label(action.title(for: current), systemImage: action.systemImage) }.help(action.title(for: current))
          }
          if let url = current.originalURL { ShareLink(item: url); Link("Open original", destination: url) }
          if let onFocus { Button("Toggle Focus", action: onFocus) }
        } label: { Label("More", systemImage: "ellipsis") }
      }
    }
    .labelStyle(.iconOnly)
    .buttonStyle(.borderless)
    .font(.ui(15))
    .padding(.horizontal, 20)
    .frame(height: 48)
    .background(Color.stPage)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
  }

  @ViewBuilder
  private func placeholder(_ reader: ReaderController) -> some View {
    if let loadError = loadError ?? reader.navigationError, !reader.isReady {
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
    #if os(iOS)
    // The source, and under it the section you're in; tap for the contents.
    ToolbarItem(placement: .principal) {
      Button { reader?.openContents() } label: {
        VStack(spacing: 1) {
          Text(current.source)
            .font(.ui(15, .semibold))
            .foregroundStyle(Color.stInk)
            .lineLimit(1)
          if let line = reader?.sections?.line {
            Text(line)
              .font(.mono(10))
              .tracking(0.5)
              .foregroundStyle(Color.stMuted)
              .lineLimit(1)
              .transition(.opacity)
          }
        }
        .frame(maxWidth: 240)
        .animation(StashMotion.fade, value: reader?.sections?.line)
      }
      .buttonStyle(.plain)
      .disabled((reader?.sections?.count ?? 0) < 2)
      .accessibilityLabel(reader?.sections?.line.map { "\(current.source), \($0). Show contents" } ?? current.source)
    }
    #endif
    ToolbarItemGroup(placement: .primaryAction) {
      ForEach(currentActions, id: \.self) { action in
        Button(role: action == .delete ? .destructive : nil) {
          perform(action, current)
        } label: {
          Label(action.title, systemImage: action.systemImage)
        }
        .help(action.title)
      }

      ReaderTextButton()

      if let url = current.originalURL {
        ShareLink(item: url)
        Link(destination: url) { Label("Open original", systemImage: "safari") }.help("Open original")
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
    if choice == "archiveNext" || choice == "archive" {
      let generation = reader?.loadGeneration
      Task {
        do {
          try await Library.setArchived(item.id, true)
          Moments.shared.archivedOffList(item)
          guard generation == reader?.loadGeneration else { return }
          reader?.send("stashColophonResult", ["archived": true])
          toaster.show("Archived", undo: {
            Task {
              do { try await Library.setArchived(item.id, false) }
              catch { toaster.show("Couldn't move this article back to Saved. Try again.") }
            }
          })
          if choice == "archiveNext", let upNext { reader?.reset(); next = upNext }
          else if let onBack { onBack() }
          else if !embedded { dismiss() }
        } catch {
          guard generation == reader?.loadGeneration else { return }
          reader?.send("stashColophonResult", [:])
          toaster.show("Couldn't archive this article. Try again.")
        }
      }
      return
    }
    switch choice {
    case "next":
      if let upNext {
        reader?.reset()
        next = upNext
      }
    default:
      dismiss()
    }
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
      guard !Task.isCancelled, item.id == current.id else { return }
      reader.onColophon = { choice in colophonPicked(choice, item: item) }
      let html = ReaderPage.html(
        for: content,
        viewer: viewer,
        settings: .init(fontSize: effectiveSize, fontFamily: fontFamily, width: lineWidth),
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
