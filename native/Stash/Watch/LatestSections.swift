import SwiftUI
import UniformTypeIdentifiers

/// Latest's length filter: useful when you have ten minutes.
enum LengthFilter: String, CaseIterable, Identifiable {
  case any, short, medium, long

  var id: Self { self }

  var title: String {
    switch self {
    case .any: return "Any length"
    case .short: return "< 10 min"
    case .medium: return "10–30"
    case .long: return "Longer"
    }
  }

  /// Videos with no known length always show.
  func matches(_ item: LibraryItem) -> Bool {
    guard self != .any, let seconds = Watch.duration(item) else { return true }
    switch self {
    case .any: return true
    case .short: return seconds < 600
    case .medium: return seconds >= 600 && seconds <= 1800
    case .long: return seconds > 1800
    }
  }
}

/// "11 min left" for a part-watched video.
@MainActor func videoTimeLeft(_ item: LibraryItem) -> String? {
  guard let length = Watch.duration(item) else { return nil }
  let at = Double(Watch.positions[item.id] ?? item.readingProgressAnchorIndex ?? 0)
  let minutes = Int(((length - at) / 60).rounded(.up))
  return minutes > 0 ? "\(minutes) min left" : nil
}

/// A caps label with a line after it, and an optional link on the right.
struct WatchBand<Trailing: View>: View {
  let title: String
  @ViewBuilder var trailing: () -> Trailing

  init(_ title: String, @ViewBuilder trailing: @escaping () -> Trailing) {
    self.title = title
    self.trailing = trailing
  }

  var body: some View {
    HStack(spacing: 10) {
      Kicker(title)
      Rectangle().fill(Color.stLine).frame(height: 1)
      trailing()
    }
  }
}

extension WatchBand where Trailing == EmptyView {
  init(_ title: String) {
    self.init(title) { EmptyView() }
  }
}

/// Your channels as a row of round icons; an orange ring means something new.
struct ChannelStrip: View {
  let channels: [Subscription]
  let unseen: [String: Int]
  let onPick: (Subscription) -> Void
  let onAll: () -> Void

  /// Channels with something new first, then the rest by name.
  private var ordered: [Subscription] {
    channels.sorted { a, b in
      let (na, nb) = (count(a), count(b))
      if (na > 0) != (nb > 0) { return na > 0 }
      return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
    }
  }

  private func count(_ channel: Subscription) -> Int {
    channel.url.flatMap { unseen[$0] } ?? 0
  }

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 18) {
        ForEach(ordered.prefix(16)) { channel in
          Button { onPick(channel) } label: {
            item(channel.name, isNew: count(channel) > 0) {
              FadeImage(url: channel.icon.flatMap(URL.init(string:)))
            }
          }
          .buttonStyle(.plain)
          .help(count(channel) > 0 ? "\(channel.name): \(count(channel)) new" : channel.name)
        }
        Button(action: onAll) {
          item("All \(channels.count)", isNew: false) {
            Image(systemName: "square.grid.2x2")
              .font(.ui(18))
              .foregroundStyle(Color.stMuted)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(Color.stSunken)
          }
        }
        .buttonStyle(.plain)
      }
      .padding(.vertical, 4)
      .padding(.horizontal, 4)
    }
  }

  private func item<Icon: View>(_ name: String, isNew: Bool, @ViewBuilder icon: () -> Icon) -> some View {
    VStack(spacing: 6) {
      icon()
        .frame(width: 48, height: 48)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Color.stLine, lineWidth: 1))
        .padding(3)
        .overlay {
          if isNew { Circle().strokeBorder(Color.stAccent, lineWidth: 2) }
        }
      Text(name)
        .font(.ui(11.5, relativeTo: .caption))
        .foregroundStyle(Color.stInk2)
        .lineLimit(1)
        .frame(width: 64)
    }
    .contentShape(Rectangle())
  }
}

/// Every channel you follow, grouped by collection, with the add box to follow more. Drag a
/// channel onto a collection to file it there, or by a collection's handle to change the order.
struct AllChannelsView: View {
  let onPick: (Subscription) -> Void

  @State private var channels: [Subscription] = []
  @State private var collections: [WatchCollection] = []
  @State private var unseen: [String: Int] = [:]
  @State private var loaded = false
  /// What's being dragged, and the section it's over.
  @State private var dragging: Drag?
  /// The last thing picked up. On iPhone the same press can open a menu instead, so nothing
  /// changes on screen until the drag is actually over the page.
  @State private var pending: Drag?
  @State private var target: String?
  /// Every drop area the drag is over right now. Drags don't say when they end, so when it's
  /// over none of them for a moment, it's taken as finished.
  @State private var hovered: Set<String> = []
  @State private var endDrag: Task<Void, Never>?
  @State private var orderBeforeCarry: [String] = []
  /// Order saves run one after another, so quick Move up, Move up can't land out of order.
  @State private var orderSave: Task<Void, Never>?
  @State private var sheet: CollectionSheet.Purpose?
  @State private var deleting: WatchCollection?
  @State private var toaster = Toaster()
  @Namespace private var cards
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private enum Drag: Equatable {
    case channel(String)
    case collection(String)

    var payload: ArrangeDrag {
      switch self {
      case .channel(let id): ArrangeDrag(kind: "channel", id: id)
      case .collection(let id): ArrangeDrag(kind: "collection", id: id)
      }
    }
  }

  private struct ChannelSection: Identifiable {
    let id: String
    let collection: WatchCollection?
    let channels: [Subscription]
  }

  /// The section keys that aren't collections.
  private static let unfiled = "unfiled"
  private static let newCollection = "new"
  private static let page = "page"

  private var motion: Animation? { reduceMotion ? nil : .spring(duration: 0.4) }

  private var draggedChannel: Subscription? {
    guard case .channel(let id) = dragging else { return nil }
    return channels.first { $0.id == id }
  }

  /// While a collection is carried, every section folds to its heading so the list is short.
  private var carrying: Bool {
    if case .collection = dragging { return true }
    return false
  }

  private func sectionKey(_ channel: Subscription) -> String {
    let id = channel.collectionId ?? ""
    return collections.contains { $0.id == id } ? id : Self.unfiled
  }

  private var sections: [ChannelSection] {
    var result = collections.map { collection in
      ChannelSection(id: collection.id, collection: collection, channels: channels.filter { $0.collectionId == collection.id })
    }
    let rest = channels.filter { sectionKey($0) == Self.unfiled }
    // Always there while a channel is dragged, so it can be taken out of its collection.
    if !rest.isEmpty || draggedChannel != nil {
      result.append(ChannelSection(id: Self.unfiled, collection: nil, channels: rest))
    }
    return result
  }

  private var intro: String {
    #if os(macOS)
    "Drag a channel onto a collection to file it there. Drag a collection by its handle to change the order."
    #else
    "Press and hold a channel, then drag it to a collection. Or tap ⋯ to choose one."
    #endif
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        YouTubeConnectionView { Task { await load() } }
        WatchAddBox { Task { await load() } }
        if !loaded {
          SkeletonCards(count: 8, minWidth: 220, height: 68)
        } else if channels.isEmpty {
          EmptyBox(title: "No channels yet", message: "Paste a channel link or search for one above to follow it.", systemImage: "play.rectangle", boxed: false)
        } else {
          Text(intro)
            .font(.stSmall)
            .foregroundStyle(Color.stMuted)
            .padding(.bottom, -8)
          ForEach(sections) { section in
            sectionView(section)
          }
          if !carrying { newCollectionZone }
        }
      }
      .pageWidth()
      .padding(.bottom, 40)
    }
    .background(Color.stPage)
    // Dropped anywhere else on the page: nothing moves, but the drag is over.
    .dropDestination(for: ArrangeDrag.self) { items, _ in
      // Nothing moves, except a carried collection, which stays where it's showing.
      let carried = items.first?.kind == "collection"
      finishDrag(commit: true)
      return carried
    } isTargeted: { track(Self.page, $0) }
    .stashPage("All channels", detail: loaded ? "\(channels.count) channels" : nil)
    .toasts(toaster)
    .sheet(item: $sheet) { purpose in
      CollectionSheet(purpose) { name, color in save(purpose, name: name, color: color) }
    }
    .confirmationDialog(
      "Delete \(deleting?.name ?? "this collection")?",
      isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
      presenting: deleting
    ) { collection in
      Button("Delete", role: .destructive) { delete(collection) }
    } message: { _ in
      Text("Its channels move to Not in a collection. Their videos stay.")
    }
    .task { await load() }
  }

  // MARK: Sections

  private func sectionView(_ section: ChannelSection) -> some View {
    let lit = isLit(section.id)
    return VStack(alignment: .leading, spacing: 12) {
      heading(section, lit: lit)
      if !carrying {
        if section.channels.isEmpty {
          dashedBox(section.collection == nil
            ? "Drop here to take a channel out of its collection"
            : "Drag channels here", lit: lit)
        } else {
          grid {
            ForEach(section.channels) { card($0) }
          }
        }
      }
    }
    .background {
      RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
        .fill(Color.stAccent.opacity(lit ? 0.06 : 0))
        .overlay(
          RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
            .strokeBorder(Color.stAccent.opacity(lit ? 1 : 0), lineWidth: 1)
        )
        .padding(-10)
        .allowsHitTesting(false)
    }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: lit)
    .dropDestination(for: ArrangeDrag.self) { items, _ in
      drop(items, on: section.id)
    } isTargeted: { track(section.id, $0) }
  }

  /// The section a channel is dragged over lights up, unless it's the one it's already in.
  private func isLit(_ key: String) -> Bool {
    guard target == key, let channel = draggedChannel else { return false }
    return key == Self.newCollection || key != sectionKey(channel)
  }

  private func heading(_ section: ChannelSection, lit: Bool) -> some View {
    HStack(spacing: 10) {
      if let collection = section.collection {
        Image(systemName: "line.3.horizontal")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(Color.stMuted)
          .frame(width: 22, height: 22)
          .contentShape(Rectangle())
          .onDrag {
            begin(.collection(collection.id))
          }
          .help("Drag to change the order")
          .accessibilityHidden(true)
        Circle()
          .fill(Color(hexString: collection.color) ?? .stMuted)
          .frame(width: 7, height: 7)
      }
      Kicker(section.collection?.name ?? "Not in a collection")
      if lit {
        Text("Drop to move here")
          .font(.mono(11))
          .foregroundStyle(Color.stAccentText)
          .transition(.opacity)
      }
      Rectangle().fill(Color.stLine).frame(height: 1)
      if let collection = section.collection {
        Menu {
          collectionMenu(collection)
        } label: {
          Image(systemName: "ellipsis")
        }
        .menuStyle(.button)
        .buttonStyle(.text)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("\(collection.name) options")
      }
    }
    .frame(minHeight: 22)
    .contextMenu {
      if let collection = section.collection { collectionMenu(collection) }
    }
  }

  @ViewBuilder
  private func collectionMenu(_ collection: WatchCollection) -> some View {
    let index = collections.firstIndex(of: collection) ?? 0
    Button("Move up", systemImage: "arrow.up") { shift(collection, by: -1) }
      .disabled(index == 0)
    Button("Move down", systemImage: "arrow.down") { shift(collection, by: 1) }
      .disabled(index >= collections.count - 1)
    Divider()
    Button("Rename or change colour…", systemImage: "pencil") { sheet = .edit(collection) }
    Button("Delete…", systemImage: "trash", role: .destructive) { deleting = collection }
  }

  private func dashedBox(_ text: String, lit: Bool) -> some View {
    Text(text)
      .font(.ui(13))
      .foregroundStyle(lit ? Color.stAccentText : Color.stMuted)
      .frame(maxWidth: .infinity, minHeight: 64)
      .overlay(
        RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
          .strokeBorder(lit ? Color.stAccent : Color.stLineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
      )
  }

  /// "+ New collection" at the bottom: click it, or drop a channel on it to make one for it.
  private var newCollectionZone: some View {
    let lit = isLit(Self.newCollection)
    let label = lit ? draggedChannel.map { "New collection for \($0.name)" } : nil
    return Button {
      sheet = .new(nil, color: nextColor)
    } label: {
      Label(label ?? "New collection", systemImage: "plus")
        .font(.ui(13, .medium))
        .foregroundStyle(lit ? Color.stAccentText : Color.stMuted)
        .frame(maxWidth: .infinity, minHeight: 64)
        .background(Color.stAccent.opacity(lit ? 0.06 : 0), in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
            .strokeBorder(lit ? Color.stAccent : Color.stLineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .dropDestination(for: ArrangeDrag.self) { items, _ in
      drop(items, on: Self.newCollection)
    } isTargeted: { track(Self.newCollection, $0) }
  }

  private var nextColor: String {
    Watch.collectionColors[collections.count % Watch.collectionColors.count]
  }

  // MARK: Cards

  private func grid<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12, alignment: .top)], spacing: 12) {
      content()
    }
  }

  /// A channel's card. Click to open it; drag it to a collection, or use ⋯ › Move to.
  private func card(_ channel: Subscription) -> some View {
    let lifted = dragging == .channel(channel.id)
    return channelCard(channel)
      // The gap it leaves while it's carried.
      .opacity(lifted ? 0 : 1)
      .overlay {
        if lifted {
          RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
            .strokeBorder(Color.stInk, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            .opacity(0.35)
        }
      }
      .onTapGesture { onPick(channel) }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isButton)
      .overlay(alignment: .trailing) {
        Menu {
          moveMenu(channel)
        } label: {
          Image(systemName: "ellipsis")
            .frame(width: 28, height: 28)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.text)
        .menuIndicator(.hidden)
        .fixedSize()
        .padding(.trailing, 8)
        .opacity(lifted ? 0 : 1)
        .accessibilityLabel("Move \(channel.name)")
      }
      .contextMenu { moveMenu(channel) }
      .onDrag {
        begin(.channel(channel.id))
      } preview: {
        liftedCard(channel)
      }
      .matchedGeometryEffect(id: channel.id, in: cards)
  }

  @ViewBuilder
  private func moveMenu(_ channel: Subscription) -> some View {
    Menu("Move to") {
      ForEach(collections) { collection in
        Button(collection.name) { move(channel, to: collection.id) }
          .disabled(channel.collectionId == collection.id)
      }
      if !collections.isEmpty { Divider() }
      Button("No collection") { move(channel, to: nil) }
        .disabled(sectionKey(channel) == Self.unfiled)
      Button("New collection…") { sheet = .new(channel, color: nextColor) }
    }
  }

  /// The card in your hand: a little larger, tipped and floating.
  private func liftedCard(_ channel: Subscription) -> some View {
    channelCard(channel)
      .frame(width: 260)
      .scaleEffect(1.04)
      .rotationEffect(.degrees(reduceMotion ? 0 : -1.5))
      .shadow(color: .black.opacity(0.18), radius: 18, y: 10)
      .padding(20)
  }

  private func channelCard(_ channel: Subscription) -> some View {
    let count = channel.url.flatMap { unseen[$0] } ?? 0
    return HStack(spacing: 12) {
      FadeImage(url: channel.icon.flatMap(URL.init(string:)))
        .frame(width: 40, height: 40)
        .clipShape(Circle())
      VStack(alignment: .leading, spacing: 2) {
        Text(channel.name)
          .font(.ui(14, .medium))
          .foregroundStyle(Color.stInk)
          .lineLimit(1)
        if channel.youtubeImported == true { Text("From YouTube").font(.stDetail).foregroundStyle(Color.stMuted) }
        if count > 0 {
          Text("\(count) new").font(.mono(11)).foregroundStyle(Color.stAccentText)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .padding(.trailing, 26)
    .background(Color.stSurface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Color.stLine, lineWidth: 1))
    .contentShape(Rectangle())
  }

  // MARK: Dragging

  /// Picks something up, and hands the drag its payload. Only this app's own drop areas take
  /// it, so it can't be dropped into a text field as text.
  private func begin(_ drag: Drag) -> NSItemProvider {
    endDrag?.cancel()
    pending = drag
    dragging = nil
    target = nil
    hovered = []
    orderBeforeCarry = collections.map(\.id)
    let provider = NSItemProvider()
    let data = (try? JSONEncoder().encode(drag.payload)) ?? Data()
    provider.registerDataRepresentation(forTypeIdentifier: UTType.stashArrange.identifier, visibility: .ownProcess) { done in
      done(data, nil)
      return nil
    }
    return provider
  }

  private func track(_ key: String, _ isOver: Bool) {
    if isOver {
      // The drag is really happening (or back over the page after leaving it).
      if dragging == nil, let pending {
        withAnimation(motion) { dragging = pending }
      }
      hovered.insert(key)
      if key != Self.page { target = key }
      if key != Self.page, case .collection(let id) = dragging { carry(id, over: key) }
    } else {
      hovered.remove(key)
      if target == key { target = nil }
    }
    scheduleEnd()
  }

  private func scheduleEnd() {
    endDrag?.cancel()
    guard dragging != nil, hovered.isEmpty else { return }
    endDrag = Task {
      try? await Task.sleep(for: .seconds(1.2))
      guard !Task.isCancelled else { return }
      finishDrag(commit: false)
    }
  }

  /// Letting go saves a carried collection's new place; a drag that wanders off and isn't
  /// dropped puts it back. It can still pick up again if the drag comes back.
  private func finishDrag(commit: Bool) {
    endDrag?.cancel()
    let carried = carrying
    withAnimation(motion) {
      dragging = nil
      target = nil
      if carried, !commit {
        let byID = Dictionary(uniqueKeysWithValues: collections.map { ($0.id, $0) })
        let restored = orderBeforeCarry.compactMap { byID[$0] }
        if restored.count == collections.count { collections = restored }
      }
    }
    hovered = []
    if commit {
      pending = nil
      if carried, collections.map(\.id) != orderBeforeCarry { saveOrder() }
    }
  }

  /// A carried collection takes the place of the one it's over; the others slide to make room.
  private func carry(_ id: String, over key: String) {
    guard key != id, let from = collections.firstIndex(where: { $0.id == id }) else { return }
    let to: Int
    if key == Self.unfiled || key == Self.newCollection {
      to = collections.count - 1
    } else if let index = collections.firstIndex(where: { $0.id == key }) {
      to = index
    } else {
      return
    }
    guard from != to else { return }
    withAnimation(motion) {
      let collection = collections.remove(at: from)
      collections.insert(collection, at: to)
    }
  }

  private func drop(_ items: [ArrangeDrag], on key: String) -> Bool {
    defer { finishDrag(commit: true) }
    guard let payload = items.first else { return false }
    if payload.kind == "channel" {
      let id = payload.id
      guard let channel = channels.first(where: { $0.id == id }) else { return false }
      if key == Self.newCollection {
        sheet = .new(channel, color: nextColor)
      } else {
        move(channel, to: key == Self.unfiled ? nil : key)
      }
      return true
    }
    // A collection's new place is already showing; letting go saves it.
    return payload.kind == "collection"
  }

  // MARK: Changes

  /// Files a channel in a collection (nil takes it out), at once, with Undo.
  private func move(_ channel: Subscription, to collectionId: String?) {
    let from = sectionKey(channel) == Self.unfiled ? nil : channel.collectionId
    guard from != collectionId else { return }
    let fromName = collections.first { $0.id == from }?.name
    let toName = collections.first { $0.id == collectionId }?.name
    file(channel.id, in: collectionId)
    Task {
      do {
        try await Watch.updateChannel(channel.id, collectionId: collectionId ?? "")
        LibraryChanges.shared.publish()
        let message = toName.map { "Moved \(channel.name) to \($0)" }
          ?? "Took \(channel.name) out of \(fromName ?? "its collection")"
        toaster.show(message) {
          file(channel.id, in: from)
          Task {
            do {
              try await Watch.updateChannel(channel.id, collectionId: from ?? "")
              LibraryChanges.shared.publish()
            } catch {
              file(channel.id, in: collectionId)
              toaster.show("Couldn't put \(channel.name) back")
            }
          }
        }
      } catch {
        file(channel.id, in: from)
        toaster.show("Couldn't move \(channel.name)")
      }
    }
  }

  private func file(_ id: String, in collectionId: String?) {
    withAnimation(motion) {
      channels = channels.map { $0.id == id ? $0.filed(in: collectionId) : $0 }
    }
  }

  private func shift(_ collection: WatchCollection, by offset: Int) {
    guard let from = collections.firstIndex(of: collection) else { return }
    let to = from + offset
    guard collections.indices.contains(to) else { return }
    withAnimation(motion) { collections.swapAt(from, to) }
    saveOrder()
  }

  private func saveOrder() {
    let ids = collections.map(\.id)
    let previous = orderSave
    orderSave = Task {
      await previous?.value
      do {
        try await Watch.setCollectionOrder(ids)
        LibraryChanges.shared.publish()
      } catch {
        toaster.show("Couldn't save the order")
      }
    }
  }

  private func save(_ purpose: CollectionSheet.Purpose, name: String, color: String) {
    switch purpose {
    case .new(let channel, _):
      Task {
        do {
          let collection = try await Watch.createCollection(name: name, color: color)
          if !collections.contains(where: { $0.id == collection.id }) {
            withAnimation(motion) { collections.append(collection) }
          }
          if let channel = channels.first(where: { $0.id == channel?.id }) {
            move(channel, to: collection.id)
          } else {
            LibraryChanges.shared.publish()
          }
        } catch {
          toaster.show("Couldn't make that collection")
        }
      }
    case .edit(let collection):
      let changed = WatchCollection(id: collection.id, name: name, color: color)
      collections = collections.map { $0.id == collection.id ? changed : $0 }
      Task {
        do {
          try await Watch.updateCollection(collection, name: name, color: color)
          LibraryChanges.shared.publish()
        } catch {
          collections = collections.map { $0.id == collection.id ? collection : $0 }
          toaster.show("Couldn't change \(collection.name)")
        }
      }
    }
  }

  private func delete(_ collection: WatchCollection) {
    let before = (collections, channels)
    withAnimation(motion) {
      collections.removeAll { $0.id == collection.id }
      channels = channels.map { $0.collectionId == collection.id ? $0.filed(in: nil) : $0 }
    }
    Task {
      do {
        try await Watch.deleteCollection(collection)
        LibraryChanges.shared.publish()
        toaster.show("Deleted \(collection.name)")
      } catch {
        (collections, channels) = before
        toaster.show("Couldn't delete \(collection.name)")
      }
    }
  }

  private func load() async {
    async let subscriptions = Library.subscriptions()
    async let labels = Watch.collections()
    async let counts = Watch.unseenByChannel()
    channels = ((try? await subscriptions) ?? []).filter(\.isYouTube)
    collections = (try? await labels) ?? []
    unseen = await counts
    loaded = true
  }
}
