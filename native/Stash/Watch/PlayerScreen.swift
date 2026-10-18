import SwiftUI
import WebKit

/// The player page: the video, its controls, and Up next, Transcript and About beside
/// it on a Mac or underneath on iPhone.
struct PlayerScreen: View {
  let item: LibraryItem
  let queue: [LibraryItem]
  let actions: [ItemAction]
  let perform: (ItemAction, LibraryItem) -> Void
  /// Shown inside Home's preview card, which brings its own header and buttons.
  var embedded = false

  @Environment(PlayerController.self) private var player
  @State private var tab: PlayerTab = .upNext
  @State private var screenID = UUID()
  @State private var transcript: [TranscriptLine]?
  @State private var transcriptError = false

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
    .background(Color.stashBackground)
    .modifier(ScreenChrome(embedded: embedded, title: current.source) { toolbar })
    .onAppear {
      player.queue = queue
      player.owner = screenID
      player.play(item)
    }
    .onDisappear { if player.owner == screenID { player.stop() } }
    .task(id: current.id) { await loadTranscript() }
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
    PlayerWebView(webView: player.webView)
      .aspectRatio(16 / 9, contentMode: .fit)
      .background(Color.black)
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(current.title)
        .font(.stashTitle(.title2))
        .foregroundStyle(Color.stashInk)
      HStack(spacing: 8) {
        Text(current.author ?? current.source)
        Text("·")
        Text(shortAge(current.publishedAt ?? current.savedAt))
        if let length = Watch.duration(current) {
          Text("·")
          Text(Watch.timecode(length))
        }
      }
      .font(.stashDetail)
      .foregroundStyle(Color.stashMuted)
      controls
    }
  }

  private var controls: some View {
    HStack(spacing: 14) {
      Button { player.skip(-10) } label: { Image(systemName: "gobackward.10") }
        .keyboardShortcut(.leftArrow, modifiers: [])
        .help("Back 10 seconds")
      Button { player.toggle() } label: {
        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
          .frame(width: 22)
      }
      .keyboardShortcut(.space, modifiers: [])
      .help(player.isPlaying ? "Pause" : "Play")
      Button { player.skip(10) } label: { Image(systemName: "goforward.10") }
        .keyboardShortcut(.rightArrow, modifiers: [])
        .help("Forward 10 seconds")

      Text("\(Watch.timecode(player.time)) / \(Watch.timecode(player.duration))")
        .font(.stashDetail)
        .foregroundStyle(Color.stashMuted)
        .monospacedDigit()

      Spacer()

      Menu {
        Picker("Speed", selection: Binding(get: { player.rate }, set: { player.setRate($0) })) {
          ForEach(PlayerController.speeds, id: \.self) { speed in
            Text(speed == 1 ? "Normal" : "\(speed.formatted())×").tag(speed)
          }
        }
      } label: {
        Text(player.rate == 1 ? "1×" : "\(player.rate.formatted())×")
          .font(.stashDetail)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
          .overlay(Capsule().strokeBorder(Color.stashBorder))
      }
      .menuIndicator(.hidden)
      .fixedSize()
      .help("Playback speed, remembered for this channel")
    }
    .buttonStyle(.borderless)
    .font(.title3)
  }

  private var tabs: some View {
    VStack(alignment: .leading, spacing: 12) {
      tabPicker
      tabContent
    }
  }

  private var tabPicker: some View {
    Picker("Show", selection: $tab) {
      ForEach(PlayerTab.allCases) { Text($0.rawValue).tag($0) }
    }
    .pickerStyle(.segmented)
    .labelsHidden()
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
      .font(.callout)
      .padding(.bottom, 8)
      if player.upNext.isEmpty {
        Text("Nothing else in this list.")
          .font(.callout)
          .foregroundStyle(Color.stashMuted)
      }
      ForEach(player.upNext.prefix(30)) { next in
        Button { player.play(next) } label: {
          VideoRow(item: next)
        }
        .buttonStyle(.plain)
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
                  .font(.stashDetail)
                  .foregroundStyle(Color.stashMuted)
                  .frame(width: 52, alignment: .leading)
                Text(line.text)
                  .font(.callout)
                  .foregroundStyle(index == currentLine ? Color.stashInk : Color.stashMuted)
                  .fontWeight(index == currentLine ? .semibold : .regular)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .padding(.vertical, 4)
              .padding(.horizontal, 6)
              .background(
                index == currentLine ? Color.stashAccent.opacity(0.10) : .clear,
                in: RoundedRectangle(cornerRadius: 6)
              )
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .id(index)
          }
        }
        .onChange(of: currentLine) { _, line in
          if let line, player.isPlaying { withAnimation { proxy.scrollTo(line, anchor: .center) } }
        }
      }
    } else if transcriptError || transcript?.isEmpty == true {
      Text("This video has no transcript.")
        .font(.callout)
        .foregroundStyle(Color.stashMuted)
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
          Text("Chapters").font(.headline)
          ForEach(chapters, id: \.self) { chapter in
            Button { player.seek(to: chapter.start) } label: {
              HStack(spacing: 10) {
                Text(Watch.timecode(chapter.start))
                  .font(.stashDetail)
                  .foregroundStyle(Color.stashAccentText)
                  .frame(width: 52, alignment: .leading)
                Text(chapter.title).font(.callout).foregroundStyle(Color.stashInk)
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
          .font(.callout)
          .foregroundStyle(Color.stashInk)
          .textSelection(.enabled)
      } else if chapters.isEmpty {
        Text("No description.").font(.callout).foregroundStyle(Color.stashMuted)
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

#if os(iOS)
struct PlayerWebView: UIViewRepresentable {
  let webView: WKWebView
  func makeUIView(context: Context) -> WKWebView { webView }
  func updateUIView(_ view: WKWebView, context: Context) {}
}
#else
struct PlayerWebView: NSViewRepresentable {
  let webView: WKWebView
  func makeNSView(context: Context) -> WKWebView { webView }
  func updateNSView(_ view: WKWebView, context: Context) {}
}
#endif
