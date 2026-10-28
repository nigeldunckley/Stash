import SwiftUI
import WebKit
import UniformTypeIdentifiers

/// The player page: a stable video stage with context beside it in wide windows,
/// or below it on iPhone and narrow iPad windows.
struct PlayerScreen: View {
  let item: LibraryItem
  let queue: [LibraryItem]
  let actions: [ItemAction]
  let perform: (ItemAction, LibraryItem) -> Void
  /// Shown inside Home's preview card, which brings its own header and buttons.
  var embedded = false
  var resumePlayback = true
  var onMini: (() -> Void)?

  @Environment(\.dismiss) private var dismiss
  @Environment(PlayerController.self) private var player
  @Environment(\.isActivePage) private var isActivePage
  @State private var tab: PlayerTab = .upNext
  @State private var showsContext = true
  @State private var transcript: [TranscriptLine] = []
  @State private var transcriptVideoID: String?
  @State private var transcriptError: String?
  @State private var transcriptSearch = ""
  @State private var scrubbingTime: Double?
  @State private var screenID = UUID()
  @State private var opened = false
  @State private var draggingID: String?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private enum PlayerTab: String, CaseIterable, Identifiable {
    case upNext = "Up next", chapters = "Chapters", transcript = "Transcript", about = "About"
    var id: Self { self }
  }

  /// A wide iPad window keeps context beside the stage; narrower windows put it below.
  private var splitWidth: CGFloat {
    #if os(iOS)
    UIDevice.current.userInterfaceIdiom == .pad ? 900 : .infinity
    #else
    900
    #endif
  }

  /// Whatever is playing now: it changes as Up next moves on.
  private var current: LibraryItem { player.item ?? item }
  private var phonePlayer: Bool {
    #if os(iOS)
    UIDevice.current.userInterfaceIdiom == .phone
    #else
    false
    #endif
  }

  var body: some View {
    GeometryReader { geometry in
      if geometry.size.width >= splitWidth {
        HStack(spacing: 0) {
          ScrollView { mainColumn.padding(24) }
          if showsContext {
            Divider()
            sideColumn.frame(width: geometry.size.width >= 1100 ? 370 : 320)
          }
        }
      } else {
        VStack(spacing: 0) {
          video
          playbackTimeline.padding(.horizontal, 16).padding(.top, 10)
          controls.padding(.horizontal, 16).padding(.top, 6)
          ScrollView {
            VStack(alignment: .leading, spacing: 16) {
              details
              tabs
            }
            .padding(16)
          }
        }
      }
    }
    .background(Color.stPage)
    .modifier(ScreenChrome(embedded: embedded, title: phonePlayer ? "Watch" : current.source) { toolbar })
    .task(id: "\(current.id)|\(tab.rawValue)") {
      if tab == .transcript { await loadTranscript() }
    }
    .onChange(of: current.id) { _, _ in scrubbingTime = nil }
    .onAppear {
      guard isActivePage else { return }
      if !opened {
        if player.item?.id != item.id || player.queue.isEmpty { player.queue = queue }
        if resumePlayback || player.item?.id != item.id { player.play(item) }
        opened = true
      }
      player.screenShown(screenID)
    }
    .onDisappear { player.screenLeft(screenID) }
    // On Mac a page you leave stays alive out of sight, so leaving it counts as leaving the video.
    .onChange(of: isActivePage) { _, active in
      if active {
        if player.item == nil { player.queue = queue; player.play(item) }
        player.screenShown(screenID)
      } else {
        player.screenLeft(screenID)
      }
    }
    .safeAreaInset(edge: .bottom) {
      if let error = player.syncError {
        HStack {
          Text(error).font(.stSmall)
          Button("Try again") { player.retryPosition() }.buttonStyle(.text)
        }
        .padding(12).frame(maxWidth: .infinity).background(Color.stPanel)
      }
    }
  }

  // MARK: Layout

  private var mainColumn: some View {
    VStack(alignment: .leading, spacing: 18) {
      #if os(iOS)
      if UIDevice.current.userInterfaceIdiom == .pad {
        HStack {
          Spacer()
          Button { showsContext.toggle() } label: {
            Label(showsContext ? "Hide context" : "Show context", systemImage: "sidebar.right")
          }
          .buttonStyle(.text)
          .accessibilityLabel(showsContext ? "Hide video context" : "Show video context")
        }
      }
      #endif
      video.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      playbackTimeline
      controls
      details
    }
    .frame(maxWidth: 1100)
    .frame(maxWidth: .infinity)
  }

  private var sideColumn: some View {
    VStack(spacing: 0) {
      tabPicker.padding(12)
      Divider()
      ScrollView { tabContent.padding(12) }
    }
  }

  private var video: some View {
    PlayerWebView(webView: player.webView, active: player.host == .screen(screenID))
      .overlay {
        if let error = player.playbackError {
          VStack(spacing: 12) {
            Text(error).font(.stSmall).multilineTextAlignment(.center)
            Button("Try again") { player.play(current) }.buttonStyle(.text)
            if let url = current.originalURL { Link("Open on YouTube", destination: url).buttonStyle(.text) }
          }
          .foregroundStyle(Color.stInk)
          .padding(20)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color.stPanel)
        }
      }
      .aspectRatio(16 / 9, contentMode: .fit)
      .background(Color.black)
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 13) {
      Text(current.title)
        .font(.reading(phonePlayer ? 34 : 30, .medium, relativeTo: .largeTitle))
        .foregroundStyle(Color.stInk)
      HStack(spacing: 8) {
        Text(current.author ?? current.source)
        Text("·")
        Text(shortAge(current.publishedAt ?? current.savedAt))
        if let length = Watch.duration(current) {
          Text("·")
          Text(Watch.timecode(length))
        }
      }
      .font(.stDetail)
      .foregroundStyle(Color.stMuted)
      #if os(iOS)
      HStack(spacing: 24) {
        if let action = actions.first(where: { $0 == .save || $0 == .archive || $0 == .unarchive }) {
          Button { perform(action, current) } label: {
            Label(action.title(for: current), systemImage: action.systemImage)
          }
        }
        if let url = current.originalURL {
          ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
        }
      }
      .font(.ui(14))
      .buttonStyle(.plain)
      .padding(.top, 13)
      #endif
    }
  }

  private var playbackTimeline: some View {
    Slider(value: Binding(
      get: { min(scrubbingTime ?? player.time, max(player.duration, 1)) },
      set: { scrubbingTime = $0 }
    ), in: 0...max(player.duration, 1), onEditingChanged: { editing in
      if !editing, let time = scrubbingTime {
        player.seek(to: time)
        scrubbingTime = nil
      }
    })
      .tint(Color.stAccent)
      .disabled(player.duration <= 0)
      .accessibilityLabel("Playback position")
      .accessibilityValue("\(Watch.timecode(scrubbingTime ?? player.time)) of \(Watch.timecode(player.duration))")
  }

  private var controls: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) { playbackButtons; playbackTime; Spacer(); playbackOptions }
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 12) { playbackButtons; Spacer(); playbackTime }
        HStack(spacing: 12) { Spacer(); playbackOptions }
      }
    }
    .buttonStyle(.borderless)
    .font(.ui(17, relativeTo: .title3))
  }

  private var target: CGFloat {
    #if os(iOS)
    44
    #else
    28
    #endif
  }

  private var playbackTime: some View {
    Text("\(Watch.timecode(scrubbingTime ?? player.time)) / \(Watch.timecode(player.duration))")
      .font(.stDetail).foregroundStyle(Color.stMuted).monospacedDigit().fixedSize()
  }

  @ViewBuilder
  private var playbackButtons: some View {
    Button { player.skip(-10) } label: { Image(systemName: "gobackward.10").frame(width: target, height: target) }
      .keyboardShortcut(.leftArrow, modifiers: []).help("Back 10 seconds").accessibilityLabel("Back 10 seconds")
    Button { player.toggle() } label: {
      Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").frame(width: target, height: target)
    }
    .keyboardShortcut(.space, modifiers: []).help(player.isPlaying ? "Pause" : "Play")
    .accessibilityLabel(player.isPlaying ? "Pause" : "Play")
    Button { player.skip(10) } label: { Image(systemName: "goforward.10").frame(width: target, height: target) }
      .keyboardShortcut(.rightArrow, modifiers: []).help("Forward 10 seconds").accessibilityLabel("Forward 10 seconds")
  }

  @ViewBuilder
  private var playbackOptions: some View {
    Button { player.pictureInPicture() } label: { Image(systemName: "pip.enter").frame(width: target, height: target) }
      .help("Picture in Picture").accessibilityLabel("Picture in Picture")
    Button { player.host = .mini; if let onMini { onMini() } else { dismiss() } } label: { Image(systemName: "rectangle.bottomthird.inset.filled").frame(width: target, height: target) }
      .help("Mini player").accessibilityLabel("Mini player")
    #if os(macOS)
    Button { NotificationCenter.default.post(name: .stashPopOut, object: nil) } label: {
      Image(systemName: "rectangle.on.rectangle").frame(width: target, height: target)
    }
    .help("Float above other apps (⌥⌘P)").accessibilityLabel("Float above other apps")
    #endif
    Menu {
      Picker("Speed", selection: Binding(get: { player.rate }, set: { player.setRate($0) })) {
        ForEach(PlayerController.speeds, id: \.self) { speed in
          Text(speed == 1 ? "Normal" : "\(speed.formatted())×").tag(speed)
        }
      }
    } label: {
      Text("\(player.rate.formatted())×").font(.stDetail).padding(.horizontal, 8).frame(minHeight: target)
    }
    .menuIndicator(.hidden).fixedSize().help("Playback speed, remembered for this channel")
  }

  private var tabs: some View {
    VStack(alignment: .leading, spacing: 12) {
      tabPicker
      tabContent
    }
  }

  private var tabPicker: some View {
    #if os(iOS)
    ScrollView(.horizontal) {
      HStack(spacing: 25) {
        ForEach(PlayerTab.allCases) { option in
          Button {
            withAnimation(reduceMotion ? nil : StashMotion.feedback) { tab = option }
          } label: {
            Text(option.rawValue)
              .font(.ui(14, tab == option ? .semibold : .regular))
              .foregroundStyle(tab == option ? Color.stInk : Color.stMuted)
              .padding(.vertical, 13)
              .overlay(alignment: .bottom) {
                if tab == option { Rectangle().fill(Color.stAccent).frame(height: 2) }
              }
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(tab == option ? .isSelected : [])
        }
      }
    }
    .scrollIndicators(.hidden)
    #else
    StashSegmented(selection: $tab, PlayerTab.allCases.map { StashSegmented<PlayerTab>.Option($0.rawValue, $0) })
    #endif
  }

  @ViewBuilder
  private var tabContent: some View {
    switch tab {
    case .upNext: upNext
    case .chapters: chapters
    case .transcript: transcriptContent
    case .about: about
    }
  }

  // MARK: Up next

  private var upNext: some View {
    VStack(alignment: .leading, spacing: 8) {
      #if os(iOS)
      HStack {
        Text(phonePlayer ? "Next in this session" : "Up next")
          .font(.ui(13, .medium)).foregroundStyle(Color.stMuted)
        Spacer()
        Text("\(player.upNext.count) videos")
          .font(.stDetail).foregroundStyle(Color.stMuted)
      }
      .padding(.bottom, 6)
      #else
      Toggle("Play the next video automatically", isOn: Binding(
        get: { player.autoplay }, set: { player.autoplay = $0 }
      ))
      .font(.ui(13))
      .padding(.bottom, 8)
      #endif
      if player.upNext.isEmpty {
        Text("Nothing else in this list.")
          .font(.ui(13))
          .foregroundStyle(Color.stMuted)
      }
      #if os(macOS)
      if !player.upNext.isEmpty {
        Text("Plays in this order").font(.stDetail).foregroundStyle(Color.stMuted).padding(.vertical, 8)
      }
      #endif
      ForEach(Array(player.upNext.prefix(30).enumerated()), id: \.element.id) { index, next in
        Group {
          #if os(iOS)
          playerQueueRow(next, index: index)
          #else
          QueueRow(
            item: next,
            position: index + 1,
            onPlay: { player.play(next) },
            onMove: index == 0 && index == player.upNext.count - 1 ? nil : { step in
              withAnimation(reduceMotion ? nil : StashMotion.change) { player.moveUpcoming(next.id, by: step) }
            },
            canMoveUp: index > 0,
            canMoveDown: index < player.upNext.count - 1
          )
          #endif
        }
        .onDrag { draggingID = next.id; return NSItemProvider(object: next.id as NSString) }
        .onDrop(of: [UTType.text], isTargeted: nil) { _ in
          guard let id = draggingID, let source = player.upNext.firstIndex(where: { $0.id == id }), source != index else { return false }
          withAnimation(reduceMotion ? nil : StashMotion.change) { player.moveUpcoming(id, by: index - source) }
          draggingID = nil
          return true
        }
      }
    }
  }

  #if os(iOS)
  private func playerQueueRow(_ next: LibraryItem, index: Int) -> some View {
    HStack(alignment: .center, spacing: 12) {
      Button { player.play(next) } label: {
        HStack(spacing: 12) {
          VideoThumbnail(item: next)
            .frame(width: phonePlayer ? 135 : 98)
          VStack(alignment: .leading, spacing: 6) {
            Text(next.title)
              .font(.reading(phonePlayer ? 20 : 17, .medium, relativeTo: .title3))
              .foregroundStyle(Color.stInk)
              .lineLimit(2)
              .multilineTextAlignment(.leading)
            Text(next.author ?? next.source)
              .font(.stSmall)
              .foregroundStyle(Color.stMuted)
              .lineLimit(1)
          }
          Spacer(minLength: 0)
        }
      }
      .buttonStyle(.plain)
      Menu {
        Button("Play now") { player.play(next) }
        Button("Move up") { player.moveUpcoming(next.id, by: -1) }.disabled(index == 0)
        Button("Move down") { player.moveUpcoming(next.id, by: 1) }.disabled(index >= player.upNext.count - 1)
      } label: {
        Image(systemName: "ellipsis")
          .foregroundStyle(Color.stMuted)
          .frame(width: 44, height: 44)
      }
      .accessibilityLabel("More for \(next.title)")
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) { Rectangle().fill(Color.stLine).frame(height: 1) }
  }
  #endif

  // MARK: Context

  private var chapters: some View {
    let chapters = Watch.chapters(current.description)
    return VStack(alignment: .leading, spacing: 8) {
      if chapters.isEmpty {
        Text("No chapters for this video.").font(.stSmall).foregroundStyle(Color.stMuted)
      }
      ForEach(chapters, id: \.self) { chapter in
        Button { player.seek(to: chapter.start) } label: {
          HStack(spacing: 10) {
            Text(Watch.timecode(chapter.start))
              .font(.stDetail)
              .foregroundStyle(Color.stAccentText)
              .frame(width: 52, alignment: .leading)
            Text(chapter.title).font(.ui(13)).foregroundStyle(Color.stInk)
            Spacer()
          }
          .padding(.vertical, 6)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
  }

  @ViewBuilder
  private var transcriptContent: some View {
    if transcriptVideoID != current.id {
      ProgressView().frame(maxWidth: .infinity).padding(24)
    } else if let transcriptError {
      EmptyBox(title: "Transcript unavailable", message: transcriptError, systemImage: "text.bubble", boxed: false) {
        Button("Try again") { Task { await loadTranscript() } }
      }
    } else if transcript.isEmpty {
      Text("No transcript for this video.").font(.stSmall).foregroundStyle(Color.stMuted)
    } else {
      VStack(alignment: .leading, spacing: 10) {
        TextField("Search transcript", text: $transcriptSearch)
          .textFieldStyle(.roundedBorder)
        let lines = transcript.filter { transcriptSearch.isEmpty || $0.text.localizedCaseInsensitiveContains(transcriptSearch) }
        if lines.isEmpty {
          Text("No matching lines.").font(.stSmall).foregroundStyle(Color.stMuted)
        }
        ForEach(lines, id: \.self) { line in
          Button { player.seek(to: line.start) } label: {
            HStack(alignment: .top, spacing: 10) {
              Text(Watch.timecode(line.start))
                .font(.stDetail)
                .foregroundStyle(Color.stAccentText)
                .frame(width: 52, alignment: .leading)
              Text(line.text).font(.ui(13)).foregroundStyle(Color.stInk)
                .multilineTextAlignment(.leading)
              Spacer(minLength: 0)
            }
            .padding(.vertical, 5)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func loadTranscript() async {
    guard let videoID = Watch.videoID(current) else {
      transcriptVideoID = current.id
      transcriptError = "This video has no transcript."
      return
    }
    let itemID = current.id
    transcriptVideoID = nil
    transcriptError = nil
    do {
      let lines = try await Watch.transcript(videoID)
      guard !Task.isCancelled, current.id == itemID else { return }
      transcript = lines
      transcriptVideoID = itemID
    } catch {
      guard !Task.isCancelled, current.id == itemID else { return }
      transcriptError = error.localizedDescription
      transcriptVideoID = itemID
    }
  }

  // MARK: About

  private var about: some View {
    return VStack(alignment: .leading, spacing: 14) {
      #if os(iOS)
      Toggle("Play the next video automatically", isOn: Binding(
        get: { player.autoplay }, set: { player.autoplay = $0 }
      ))
      .font(.ui(13))
      #endif
      Text("Captions are available through the YouTube player’s controls.").font(.stSmall).foregroundStyle(Color.stMuted)
      if let description = current.description, !description.isEmpty {
        Text(description)
          .font(.ui(13))
          .foregroundStyle(Color.stInk)
          .textSelection(.enabled)
      } else {
        Text("No description.").font(.ui(13)).foregroundStyle(Color.stMuted)
      }
    }
  }

  // MARK: Toolbar

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .primaryAction) {
      if phonePlayer {
        Menu {
          ForEach(actions, id: \.self) { action in
            Button(role: action == .delete ? .destructive : nil) { perform(action, current) } label: {
              Label(action.title(for: current), systemImage: action.systemImage)
            }
          }
          if let url = current.originalURL { Link("Open on YouTube", destination: url) }
        } label: { Label("More", systemImage: "ellipsis") }
      } else {
      ForEach(actions, id: \.self) { action in
        Button(role: action == .delete ? .destructive : nil) {
          perform(action, current)
        } label: {
          Label(action.title, systemImage: action.systemImage)
        }
        .help(action.title)
      }
      if let url = current.originalURL {
        ShareLink(item: url)
        Link(destination: url) { Label("Open on YouTube", systemImage: "play.rectangle") }
          .help("Open on YouTube")
      }
      }
    }
  }
}

/// A place the one video player can show: the player screen, the mini player or the floating
/// window. The web view moves into whichever is active, so the video carries on where it was.
#if os(iOS)
struct PlayerWebView: UIViewRepresentable {
  let webView: WKWebView
  var active = true

  func makeUIView(context: Context) -> UIView {
    let container = UIView()
    container.backgroundColor = .black
    container.clipsToBounds = true
    attach(to: container)
    return container
  }

  func updateUIView(_ container: UIView, context: Context) { attach(to: container) }

  private func attach(to container: UIView) {
    guard active, webView.superview !== container else { return }
    webView.removeFromSuperview()
    webView.frame = container.bounds
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    container.addSubview(webView)
  }
}
#else
struct PlayerWebView: NSViewRepresentable {
  let webView: WKWebView
  var active = true

  func makeNSView(context: Context) -> NSView {
    let container = NSView()
    container.wantsLayer = true
    container.layer?.backgroundColor = NSColor.black.cgColor
    attach(to: container)
    return container
  }

  func updateNSView(_ container: NSView, context: Context) { attach(to: container) }

  private func attach(to container: NSView) {
    guard active, webView.superview !== container else { return }
    webView.removeFromSuperview()
    webView.frame = container.bounds
    webView.autoresizingMask = [.width, .height]
    container.addSubview(webView)
  }
}
#endif
