import SwiftUI

/// Sort through feeds: your unseen feed posts as a stack of cards, one decision each. Flick up to save,
/// left to archive, right to skip (marks it seen), tap to read. The queue is fixed when it
/// opens; anything new joins the back.
struct TheSort: View {
  /// Narrows the queue to one feed, as Feeds does.
  var scope = "in:following use:folders -type:video"
  let onDone: () -> Void

  @State private var queue: [LibraryItem] = []
  @State private var index = 0
  @State private var loaded = false
  @State private var deciding = false
  @State private var loadError: String?
  @State private var toaster = Toaster()
  @State private var saved: [LibraryItem] = []
  @State private var archived = 0
  @State private var skipped = 0
  @State private var drag: CGSize = .zero
  /// Which way the top card is leaving, so it flies off that way.
  @State private var leaving: Verdict?
  @State private var reading: LibraryItem?
  @FocusState private var focused: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Namespace private var unfold

  enum Verdict { case save, archive, skip }

  private var current: LibraryItem? { index < queue.count ? queue[index] : nil }
  private var sorted: Int { saved.count + archived + skipped }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        strip
        ZStack {
          if !loaded {
            ProgressView()
          } else if let loadError {
            EmptyBox(title: "Couldn't load these posts", message: loadError) {
              Button("Try again") { Task { await load() } }
            }
          } else if current == nil {
            endCard.transition(.opacity)
          } else {
            stack.allowsHitTesting(!deciding)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 20)
        if current != nil { buttons.disabled(deciding) }
      }
      .background(Color.stPage)
      .navigationDestination(item: $reading) { item in
        ItemDestination(item: item, perform: { action, item in
          runItemAction(action, item, toaster: toaster, remove: {}, restore: {})
        })
          .unfoldDestination(item, in: unfold)
          .pageBack(["Sort through feeds"], escape: true)
      }
      #if os(iOS)
      .toolbar(.hidden, for: .navigationBar)
      #endif
      // ⌘[ at the top closes the Sort, rather than reaching the page behind it.
      .pageBack([], action: onDone)
    }
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    .onKeyPress(keys: [.upArrow, "s"]) { _ in key(.save) }
    .onKeyPress(keys: [.delete, .deleteForward, .leftArrow]) { _ in key(.archive) }
    .onKeyPress(keys: [.space, .rightArrow]) { _ in key(.skip) }
    .onKeyPress(.return) {
      guard reading == nil, leaving == nil, let current else { return .ignored }
      read(current)
      return .handled
    }
    .onKeyPress(.escape) {
      guard reading == nil else { return .ignored }
      onDone()
      return .handled
    }
    .toasts(toaster)
    .task { await load() }
    .task { await watchForNew() }
    .onAppear { focused = true }
  }

  // MARK: Parts

  /// "THE SORT · 1 OF 6 · 0 SAVED" and "ESC · DONE", over a progress rule.
  private var strip: some View {
    VStack(spacing: 0) {
      HStack {
        Text(["SORT THROUGH FEEDS", queue.isEmpty ? nil : "\(min(index + 1, queue.count)) OF \(queue.count)", "\(saved.count) SAVED"]
          .compactMap { $0 }
          .joined(separator: " · "))
          .foregroundStyle(Color.stInk)
        Spacer()
        Button(action: onDone) {
          #if os(macOS)
          Text("ESC · DONE")
          #else
          Text("DONE")
          #endif
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.stMuted)
      }
      .font(.mono(11, .medium))
      .tracking(0.9)
      .padding(.horizontal, 20)
      .padding(.vertical, 14)
      GeometryReader { geometry in
        ZStack(alignment: .leading) {
          Rectangle().fill(Color.stLine)
          Rectangle()
            .fill(Color.stInk)
            .frame(width: queue.isEmpty ? 0 : geometry.size.width * CGFloat(index) / CGFloat(queue.count))
        }
      }
      .frame(height: 1)
      .animation(reduceMotion ? nil : StashMotion.change, value: index)
    }
  }

  private var stack: some View {
    ZStack {
      // Two cards peek behind the top one.
      ForEach(Array(queue.indices.dropFirst(index).prefix(3).reversed()), id: \.self) { position in
        let depth = position - index
        card(queue[position], top: depth == 0)
          .scaleEffect(1 - CGFloat(depth) * 0.04)
          .offset(y: CGFloat(depth) * 14)
          .opacity(depth == 0 ? 1 : 1 - Double(depth) * 0.25)
          .zIndex(Double(-depth))
      }
    }
    .frame(maxWidth: 560, maxHeight: 620)
    .animation(reduceMotion ? nil : StashMotion.change, value: index)
  }

  private func card(_ item: LibraryItem, top: Bool) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      ItemCover(item: item)
        .aspectRatio(16 / 10, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .unfoldSource(item, in: unfold)
      Text(kicker(item))
        .font(.mono(11, .medium))
        .tracking(0.9)
        .foregroundStyle(Color.stAccentText)
        .lineLimit(1)
      Text(item.title)
        .font(.reading(26, .medium, relativeTo: .title))
        .foregroundStyle(Color.stInk)
        .lineLimit(4)
      if let deck = item.description?.trimmingCharacters(in: .whitespacesAndNewlines), !deck.isEmpty {
        Text(deck)
          .font(.reading(16, .regular))
          .foregroundStyle(Color.stMuted)
          .lineLimit(4)
      }
      Spacer(minLength: 0)
    }
    .padding(18)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .overlay(alignment: .top) { if top { stamp } }
    .shadow(color: .black.opacity(top ? 0.1 : 0.04), radius: top ? 18 : 8, y: 8)
    .offset(top ? cardOffset : .zero)
    .rotationEffect(.degrees(top && !reduceMotion ? Double(cardOffset.width / 30) : 0))
    .opacity(top && leaving != nil && reduceMotion ? 0 : 1)
    .contentShape(Rectangle())
    .onTapGesture { if top { read(item) } }
    .gesture(flick, including: top ? .all : .subviews)
    .allowsHitTesting(top)
  }

  /// Where the top card is: under your finger, or flying off.
  private var cardOffset: CGSize {
    guard !reduceMotion else { return .zero }
    switch leaving {
    case .save: return CGSize(width: 0, height: -900)
    case .archive: return CGSize(width: -900, height: drag.height)
    case .skip: return CGSize(width: 900, height: drag.height)
    case nil: return drag
    }
  }

  /// The action you'd get if you let go now.
  private var pending: Verdict? {
    if let leaving { return leaving }
    if -drag.height > 90 && abs(drag.height) > abs(drag.width) { return .save }
    if drag.width < -90 { return .archive }
    if drag.width > 90 { return .skip }
    return nil
  }

  @ViewBuilder
  private var stamp: some View {
    if let pending {
      Text(pending == .save ? "SAVE" : pending == .archive ? "ARCHIVE" : "SKIP")
        .font(.mono(13, .medium))
        .tracking(1.6)
        .foregroundStyle(pending == .save ? Color.stOnAccent : Color.stInk)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(pending == .save ? Color.stAccent : Color.stSurface, in: RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.stInk, lineWidth: 1.5))
        .rotationEffect(.degrees(-6))
        .padding(.top, 28)
        .transition(.opacity)
    }
  }

  private var flick: some Gesture {
    DragGesture(minimumDistance: 8)
      .onChanged { drag = $0.translation }
      .onEnded { value in
        let predicted = value.predictedEndTranslation
        drag = value.translation
        if -predicted.height > 160 && abs(predicted.height) > abs(predicted.width) {
          decide(.save)
        } else if predicted.width < -160 {
          decide(.archive)
        } else if predicted.width > 160 {
          decide(.skip)
        } else {
          withAnimation(reduceMotion ? nil : .smooth(duration: 0.25, extraBounce: 0)) { drag = .zero }
        }
      }
  }

  private var buttons: some View {
    HStack(spacing: 8) {
      Button { decide(.archive) } label: { Label("Archive", systemImage: "archivebox") }
        .buttonStyle(SortButtonStyle())
      Button { decide(.skip) } label: { Label("Skip", systemImage: "arrow.right") }
        .buttonStyle(SortButtonStyle())
      Button { decide(.save) } label: { Label("Save", systemImage: "bookmark") }
        .buttonStyle(SortButtonStyle(ink: true))
      Button { if let current { read(current) } } label: { Label("Read now", systemImage: "book") }
        .buttonStyle(SortButtonStyle())
    }
    .labelStyle(.titleOnly)
    .padding(.horizontal, 20)
    .padding(.vertical, 18)
  }

  /// "All sorted.", what you set aside, and the counts.
  private var endCard: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("All sorted.")
        .font(.reading(40, .medium, relativeTo: .largeTitle))
        .foregroundStyle(Color.stInk)
      let minutes = saved.compactMap(\.readingMinutes).reduce(0, +)
      Text(saved.isEmpty ? "Nothing set aside this time." : "\(minutes) min set aside in Saved for later.")
        .font(.reading(19, .regular, italic: true))
        .foregroundStyle(Color.stMuted)
      Rectangle().fill(Color.stInk).frame(height: 1).padding(.top, 6)
      HStack(spacing: 28) {
        count("SORTED", sorted)
        count("SAVED", saved.count)
        count("ARCHIVED", archived)
      }
      Button("Done", action: onDone)
        .buttonStyle(SortButtonStyle(ink: true))
        .keyboardShortcut(.defaultAction)
        .padding(.top, 10)
    }
    .frame(maxWidth: 440, alignment: .leading)
  }

  private func count(_ label: String, _ value: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.mono(10)).tracking(0.9).foregroundStyle(Color.stMuted)
      Text("\(value)").font(.mono(22, .medium)).monospacedDigit().foregroundStyle(Color.stInk)
    }
  }

  private func kicker(_ item: LibraryItem) -> String {
    [item.source.uppercased(), shortAge(item.date).uppercased(), item.readingMinutes.map { "\($0) MIN" }]
      .compactMap { $0 }
      .filter { !$0.isEmpty }
      .joined(separator: " · ")
  }

  // MARK: Doing

  private func key(_ verdict: Verdict) -> KeyPress.Result {
    guard reading == nil, current != nil, leaving == nil else { return .ignored }
    decide(verdict)
    return .handled
  }

  private func decide(_ verdict: Verdict) {
    guard let item = current, leaving == nil, !deciding else { return }
    deciding = true
    Task {
      defer { deciding = false }
      do {
        switch verdict {
        case .save:
          try await ItemAction.save.run(on: item)
          saved.append(item)
          Moments.shared.saved(item)
        case .archive:
          try await ItemAction.archive.run(on: item)
          archived += 1
          Moments.shared.archivedOffList(item)
        case .skip:
          try await Library.markSeen([item.id])
          skipped += 1
        }
        withAnimation(reduceMotion ? StashMotion.fade : StashMotion.change) { leaving = verdict }
        try? await Task.sleep(for: .milliseconds(reduceMotion ? 150 : 200))
        var reset = Transaction()
        reset.disablesAnimations = true
        withTransaction(reset) { leaving = nil; drag = .zero }
        withAnimation(reduceMotion ? StashMotion.fade : StashMotion.change) { index += 1 }
      } catch {
        drag = .zero
        toaster.show("Couldn't save that change. Try again.")
      }
    }
  }

  /// Opening a post keeps its place until marking it seen succeeds.

  private func read(_ item: LibraryItem) {
    guard leaving == nil, reading == nil, !deciding else { return }
    reading = item
    Task {
      do { try await Library.markSeen([item.id]); skipped += 1; index += 1 }
      catch { toaster.show("Couldn't mark this post as seen. Try again.") }
    }
  }

  private func load() async {
    loadError = nil
    do { queue = try await Library.search("\(scope) -is:seen sort:published-desc", first: 100).items }
    catch { loadError = "Check your connection and try again." }
    loaded = true
  }

  /// Every minute, anything new joins the back of the queue.
  private func watchForNew() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(60))
      guard !Task.isCancelled,
            let page = try? await Library.search("\(scope) -is:seen sort:published-desc", first: 20)
      else { continue }
      let known = Set(queue.map(\.id))
      queue.append(contentsOf: page.items.filter { !known.contains($0.id) })
    }
  }
}

/// Sort through feeds's buttons: outlined, or ink for Save and Done.
struct SortButtonStyle: ButtonStyle {
  var ink = false

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.ui(14, .medium))
      .foregroundStyle(ink ? Color.stSurface : Color.stInk)
      .padding(.horizontal, 16)
      .frame(minHeight: 38)
      .frame(maxWidth: .infinity)
      .background(ink ? Color.stInk : Color.clear, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: Radius.sm, style: .continuous).strokeBorder(ink ? Color.clear : Color.stLine, lineWidth: 1))
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .contentShape(Rectangle())
  }
}

extension View {
  /// Opens Sort through feeds over the page: full screen on iPhone, a large sheet on Mac.
  func sortSheet(isPresented: Binding<Bool>, scope: String, onDone: @escaping () -> Void) -> some View {
    #if os(iOS)
    fullScreenCover(isPresented: isPresented, onDismiss: onDone) {
      TheSort(scope: scope) { isPresented.wrappedValue = false }
    }
    #else
    sheet(isPresented: isPresented, onDismiss: onDone) {
      TheSort(scope: scope) { isPresented.wrappedValue = false }
        .environment(\.inSheet, true)
        .frame(minWidth: 680, idealWidth: 760, minHeight: 720, idealHeight: 820)
    }
    #endif
  }
}
