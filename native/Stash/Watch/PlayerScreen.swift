import SwiftUI
import WebKit
import UniformTypeIdentifiers

/// The player page: the video, its controls, and Up next, Transcript and About beside
/// it on a Mac or underneath on iPhone.
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
  @State private var screenID = UUID()
  @State private var opened = false
  @State private var transcript: [TranscriptLine]?
  @State private var transcriptError = false
  @State private var draggingID: String?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private enum PlayerTab: String, CaseIterable, Identifiable {
    case upNext = "Up next", transcript = "Transcript", about = "About"
    var id: Self { self }
  }

  /// Whatever is playing now: it changes as Up next moves on.
  private var current: LibraryItem { player.item ?? item }

  var body: some View {
    GeometryReader { geometry in
      if geometry.size.width >= 900 {
        HStack(spacing: 0) {
          ScrollView { mainColumn.padding(24) }
          Divider()
          sideColumn.frame(width: 360)
        }
      } else {
        VStack(spacing: 0) {
          video
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
    .modifier(ScreenChrome(embedded: embedded, title: current.source) { toolbar })
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
    .task(id: current.id) { await loadTranscript() }
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
      video.clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
      .aspectRatio(16 / 9, contentMode: .fit)
      .background(Color.black)
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(current.title)
        .font(.reading(24, .medium, relativeTo: .title2))
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
      controls
    }
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
    Text("\(Watch.timecode(player.time)) / \(Watch.timecode(player.duration))")
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
    StashSegmented(selection: $tab, PlayerTab.allCases.map { StashSegmented<PlayerTab>.Option($0.rawValue, $0) })
  }

  @ViewBuilder
  private var tabContent: some View {
    switch tab {
    case .upNext: upNext
    case .transcript: transcriptView
    case .about: about
    }
  }

  // MARK: Up next

  private var upNext: some View {
    VStack(alignment: .leading, spacing: 4) {
      Toggle("Play the next video automatically", isOn: Binding(
        get: { player.autoplay }, set: { player.autoplay = $0 }
      ))
      .font(.ui(13))
      .padding(.bottom, 8)
      if player.upNext.isEmpty {
        Text("Nothing else in this list.")
          .font(.ui(13))
          .foregroundStyle(Color.stMuted)
      }
      if !player.upNext.isEmpty {
        Text("Plays in this order").font(.stDetail).foregroundStyle(Color.stMuted).padding(.vertical, 8)
      }
      ForEach(Array(player.upNext.prefix(30).enumerated()), id: \.element.id) { index, next in
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

  // MARK: Transcript

  @ViewBuilder
  private var transcriptView: some View {
    if let transcript, !transcript.isEmpty {
      let currentLine = transcript.lastIndex { $0.start <= player.time }
      ScrollViewReader { proxy in
        LazyVStack(alignment: .leading, spacing: 2) {
          ForEach(Array(transcript.enumerated()), id: \.offset) { index, line in
            Button { player.seek(to: line.start) } label: {
              HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(Watch.timecode(line.start))
                  .font(.stDetail)
                  .foregroundStyle(Color.stMuted)
                  .frame(width: 52, alignment: .leading)
                Text(line.text)
                  .font(.ui(13, index == currentLine ? .semibold : .regular))
                  .foregroundStyle(index == currentLine ? Color.stInk : Color.stMuted)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .padding(.vertical, 4)
              .padding(.horizontal, 6)
              .background(
                index == currentLine ? Color.stAccent.opacity(0.10) : .clear,
                in: RoundedRectangle(cornerRadius: 6)
              )
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .id(index)
          }
        }
        .onChange(of: currentLine) { _, line in
          if let line, player.isPlaying { withAnimation(reduceMotion ? nil : StashMotion.change) { proxy.scrollTo(line, anchor: .center) } }
        }
      }
    } else if transcriptError || transcript?.isEmpty == true {
      Text("This video has no transcript.")
        .font(.ui(13))
        .foregroundStyle(Color.stMuted)
    } else {
      ProgressView().frame(maxWidth: .infinity)
    }
  }

  private func loadTranscript() async {
    transcript = nil
    transcriptError = false
    guard let id = Watch.videoID(current) else { transcriptError = true; return }
    do {
      transcript = try await Watch.transcript(id)
    } catch {
      transcriptError = true
    }
  }

  // MARK: About

  private var about: some View {
    let chapters = Watch.chapters(current.description)
    return VStack(alignment: .leading, spacing: 14) {
      if !chapters.isEmpty {
        VStack(alignment: .leading, spacing: 2) {
          Text("Chapters").font(.stSection)
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
              .padding(.vertical, 4)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
          }
        }
      }
      if let description = current.description, !description.isEmpty {
        Text(description)
          .font(.ui(13))
          .foregroundStyle(Color.stInk)
          .textSelection(.enabled)
      } else if chapters.isEmpty {
        Text("No description.").font(.ui(13)).foregroundStyle(Color.stMuted)
      }
    }
  }

  // MARK: Toolbar

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    ToolbarItemGroup(placement: .primaryAction) {
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
