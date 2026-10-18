import SwiftUI

/// Home: what's new in your feeds, and the few saves you're most likely to read next.
/// While The Edition is out and unopened, a strip at the top points to it.
struct HomeView: View {
  /// Switches to another part of the app, e.g. Feeds or The Edition.
  let go: (AppSection) -> Void

  @Environment(EditionModel.self) private var edition
  @State private var feeds = ItemList()
  @State private var subscriptions: [Subscription] = []
  @State private var tab: Tab = .read
  @State private var otherCount: Int?
  @State private var upNext: [LibraryItem] = []
  @State private var unreadTotal: Int?
  @State private var loadingUpNext = true
  @State private var leadTitle: String?
  @State private var width: CGFloat = 0
  @State private var path = NavigationPath()
  @State private var toaster = Toaster()

  private enum Tab: String { case read, watch }

  private static let feedLimit = 12

  private var feedsQuery: String {
    "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen sort:published-desc"
  }

  private var isWide: Bool { width >= 860 }

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 26) {
          if edition.isFresh && edition.state?.showOnHome != false {
            editionStrip
          }
          if isWide {
            HStack(alignment: .top, spacing: 40) {
              feedsSection.frame(maxWidth: .infinity, alignment: .leading)
              upNextRail.frame(width: 320)
            }
          } else {
            upNextStrip
            feedsSection
          }
        }
        .padding(.horizontal, isWide ? 32 : 16)
        .padding(.vertical, 16)
        .frame(maxWidth: 1180)
        .frame(maxWidth: .infinity)
      }
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
      .background(Color.stashBackground)
      .navigationTitle("Home")
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased())
            .font(.stashDetail)
            .foregroundStyle(Color.stashMuted)
            .fixedSize()
        }
      }
      .navigationDestination(for: LibraryItem.self) { item in
        ItemDestination(item: item, queue: feeds.visibleItems.filter(Watch.isVideo), perform: perform)
          .onAppear { markSeen(item) }
      }
      .refreshable { await reload() }
      .task(id: feedsQuery) {
        await feeds.load(feedsQuery)
        otherCount = await count(tab == .read ? "type:video" : "-type:video")
      }
      .task {
        if subscriptions.isEmpty { subscriptions = (try? await Library.subscriptions()) ?? [] }
        await loadUpNext()
        await loadLead()
      }
      .toasts(toaster)
    }
  }

  // MARK: The Edition strip

  private var editionStrip: some View {
    Button { go(.edition) } label: {
      HStack(spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          (Text("The Edition") + Text(".").foregroundStyle(Color.stashAccent))
            .font(.system(size: 20, weight: .bold))
            .tracking(-0.8)
          if let current = edition.current {
            Kicker("No. \(current.number) · \(EditionSchedule.at(current.date, hour: 12).formatted(.dateTime.weekday(.wide).day().month(.wide)))")
          } else {
            Kicker("This week's issue is out")
          }
        }
        .fixedSize()
        if let leadTitle {
          Divider().frame(height: 34)
          VStack(alignment: .leading, spacing: 2) {
            Kicker("The week's best you missed", accent: true)
            Text(leadTitle)
              .font(.system(.title3, design: .serif))
              .foregroundStyle(Color.stashInk)
              .lineLimit(isWide ? 1 : 2)
              .multilineTextAlignment(.leading)
          }
        }
        Spacer(minLength: 0)
        Image(systemName: "arrow.right")
          .font(.callout.weight(.semibold))
          .foregroundStyle(Color.stashMuted)
      }
      .padding(.vertical, 12)
      .overlay(alignment: .top) { Rectangle().fill(Color.stashInk).frame(height: 2) }
      .overlay(alignment: .bottom) { Rectangle().fill(Color.stashBorder).frame(height: 1) }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }

  // MARK: New from your feeds

  private var feedsSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionHeading(title: "New from your feeds", detail: feeds.total.map { "\($0) unseen" }) {
        Picker("Show", selection: $tab) {
          Text(label("Read", tab == .read ? feeds.total : otherCount)).tag(Tab.read)
          Text(label("Watch", tab == .watch ? feeds.total : otherCount)).tag(Tab.watch)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .fixedSize()
        Button { markAllSeen() } label: {
          Label("Mark all seen", systemImage: "checkmark.circle")
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
        .disabled(feeds.visibleItems.isEmpty)
        .help("Mark all as seen")
      }

      let items = Array(feeds.visibleItems.prefix(Self.feedLimit))
      if items.isEmpty {
        Group {
          if feeds.isLoading {
            ProgressView().frame(maxWidth: .infinity)
          } else if let error = feeds.error {
            ContentUnavailableView("Couldn't load", systemImage: "wifi.exclamationmark", description: Text(error))
          } else {
            ContentUnavailableView(
              "All caught up", systemImage: "checkmark.circle",
              description: Text(tab == .watch ? "No new videos from your channels." : "Nothing new from your feeds."))
          }
        }
        .padding(.vertical, 24)
      } else {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(groups(items).enumerated()), id: \.offset) { _, group in
            Kicker(group.label)
              .padding(.top, 14)
              .padding(.bottom, 4)
            ForEach(group.items) { item in
              feedRow(item)
              Divider()
            }
          }
        }
        if (feeds.total ?? 0) > items.count {
          Button {
            go(tab == .watch ? .channels : .feeds)
          } label: {
            HStack {
              Text("\((feeds.total ?? 0) - items.count) more")
                .foregroundStyle(Color.stashMuted)
              Spacer()
              Text(tab == .watch ? "Open Channels" : "Open Feeds").fontWeight(.medium)
              Image(systemName: "chevron.right")
            }
            .font(.callout)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func label(_ title: String, _ count: Int?) -> String {
    guard let count, count > 0 else { return title }
    return "\(title) \(count)"
  }

  private func groups(_ items: [LibraryItem]) -> [(label: String, items: [LibraryItem])] {
    var result: [(label: String, items: [LibraryItem])] = []
    for item in items {
      let label = dayGroup(item.date)
      if result.last?.label == label {
        result[result.count - 1].items.append(item)
      } else {
        result.append((label, [item]))
      }
    }
    return result
  }

  private func feedRow(_ item: LibraryItem) -> some View {
    NavigationLink(value: item) {
      Group {
        if Watch.isVideo(item) {
          VideoRow(item: item)
        } else {
          ItemRow(item: item, subscriptionName: channelName(item), unseen: feeds.isUnseen(item))
        }
      }
      .padding(.vertical, 4)
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button { perform(.save, item) } label: { Label(Watch.isVideo(item) ? "Save for later" : "Save", systemImage: "bookmark") }
      Button { perform(.archive, item) } label: { Label("Archive", systemImage: "archivebox") }
      Button { markSeen(item) } label: { Label("Mark as seen", systemImage: "eye") }
      if let url = item.originalURL {
        Divider()
        Link(destination: url) { Label("Open original", systemImage: "safari") }
        ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
      }
    }
  }

  // MARK: Up next

  /// On wide screens: the first save featured with its cover, then the rest as a list.
  private var upNextRail: some View {
    VStack(alignment: .leading, spacing: 12) {
      upNextHeading
      if let first = upNext.first {
        NavigationLink(value: first) {
          VStack(alignment: .leading, spacing: 8) {
            CoverImage(url: first.imageURL)
              .aspectRatio(16 / 10, contentMode: .fit)
              .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
              .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color.stashBorder, lineWidth: 0.5))
            upNextText(first, titleFont: .stashTitle(.title3))
            if first.progress > 0.02 {
              ProgressView(value: first.progress).tint(Color.stashAccent)
            }
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu { upNextMenu(first) }

        ForEach(upNext.dropFirst()) { item in
          Divider()
          NavigationLink(value: item) {
            upNextText(item, titleFont: .stashTitle(.subheadline)).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .contextMenu { upNextMenu(item) }
        }
      } else {
        upNextEmpty
      }
      if let unreadTotal, unreadTotal > upNext.count {
        Button { go(.saved) } label: {
          HStack {
            Text("All \(unreadTotal) in Saved")
            Image(systemName: "chevron.right")
          }
          .font(.callout)
        }
        .buttonStyle(.borderless)
        .padding(.top, 4)
      }
    }
  }

  /// On iPhone: a row of cards to swipe through.
  @ViewBuilder
  private var upNextStrip: some View {
    VStack(alignment: .leading, spacing: 10) {
      upNextHeading
      if upNext.isEmpty {
        upNextEmpty
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: 12) {
            ForEach(upNext) { item in
              NavigationLink(value: item) {
                VStack(alignment: .leading, spacing: 8) {
                  CoverImage(url: item.imageURL)
                    .frame(width: 240, height: 130)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(alignment: .bottom) {
                      if item.progress > 0.02 {
                        ProgressView(value: item.progress).tint(Color.stashAccent).padding(8)
                      }
                    }
                  upNextText(item, titleFont: .stashTitle(.subheadline))
                }
                .frame(width: 240, alignment: .leading)
                .contentShape(Rectangle())
              }
              .buttonStyle(.plain)
              .contextMenu { upNextMenu(item) }
            }
          }
        }
        .scrollClipDisabled()
      }
    }
  }

  private var upNextHeading: some View {
    SectionHeading(title: "Up next", detail: upNext.isEmpty ? nil : "\(upNext.count) to read")
  }

  @ViewBuilder
  private var upNextEmpty: some View {
    if loadingUpNext {
      ProgressView().frame(maxWidth: .infinity).padding(.vertical, 12)
    } else {
      Text("Nothing waiting. Save something from your feeds and it will show here.")
        .font(.callout)
        .foregroundStyle(Color.stashMuted)
    }
  }

  private func upNextText(_ item: LibraryItem, titleFont: Font) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        SiteIcon(url: item.iconURL)
        Text(item.source).lineLimit(1)
      }
      .font(.stashDetail)
      .foregroundStyle(Color.stashMuted)
      Text(item.title)
        .font(titleFont)
        .foregroundStyle(Color.stashInk)
        .lineLimit(3)
        .multilineTextAlignment(.leading)
      if let label = readingLabel(item) {
        Text(label)
          .font(.stashDetail)
          .foregroundStyle(item.progress >= 0.02 ? Color.stashAccentText : Color.stashMuted)
      }
    }
  }

  @ViewBuilder
  private func upNextMenu(_ item: LibraryItem) -> some View {
    Button { perform(.archive, item) } label: { Label("Archive", systemImage: "archivebox") }
    if let url = item.originalURL {
      Link(destination: url) { Label("Open original", systemImage: "safari") }
      ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
    }
    Divider()
    Button(role: .destructive) { perform(.delete, item) } label: { Label("Delete", systemImage: "trash") }
  }

  // MARK: Loading

  private func reload() async {
    await feeds.reload(feedsQuery)
    otherCount = await count(tab == .read ? "type:video" : "-type:video")
    await loadUpNext()
    await edition.refresh()
    await loadLead()
  }

  private func count(_ type: String) async -> Int? {
    try? await Library.search("in:following use:folders \(type) -is:seen", first: 1).pageInfo.totalCount
  }

  /// Anything you've started, then your newest unread saves.
  private func loadUpNext() async {
    defer { loadingUpNext = false }
    async let reading = Library.search("in:inbox use:folders is:reading -type:video sort:read-desc", first: 5)
    async let unread = Library.search("in:inbox use:folders is:unread -type:video sort:saved-desc", first: 8)
    let started = (try? await reading)?.items ?? []
    let fresh = try? await unread
    var seen = Set<String>()
    upNext = (started + (fresh?.items ?? []))
      .filter { seen.insert($0.id).inserted && $0.progress < 0.9 && !$0.isArchived }
      .prefix(edition.state?.upNext ?? 5)
      .map { $0 }
    unreadTotal = fresh?.pageInfo.totalCount
  }

  /// Makes this week's issue if it's out and not made yet, so it's ready to open.
  private func loadLead() async {
    guard edition.isFresh else { return }
    if edition.current == nil { await edition.make(subscriptions: subscriptions) }
    guard let lead = edition.current?.entries.first(where: { $0.slot == "lead" }) else { return }
    leadTitle = try? await Library.search("includes:\(lead.id)", first: 1).items.first?.title
  }

  // MARK: Doing things

  private func channelName(_ item: LibraryItem) -> String? {
    guard let value = item.subscription else { return nil }
    return subscriptions.first { $0.url == value || $0.name == value }?.name
  }

  private func markSeen(_ item: LibraryItem) {
    guard feeds.isUnseen(item) else { return }
    feeds.markSeen(item)
    Task { try? await Library.markSeen([item.id]) }
  }

  private func markAllSeen() {
    let query = "in:following use:folders \(tab == .watch ? "type:video" : "-type:video") -is:seen"
    Task {
      do {
        try await Library.markSeen(query: query)
        toaster.show(tab == .watch ? "Marked all videos as seen" : "Marked all feeds as seen")
        await feeds.reload(feedsQuery)
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    if path.count > 0 { path.removeLast() }
    withAnimation {
      feeds.remove(item)
      upNext.removeAll { $0.id == item.id }
    }
    Task {
      do {
        try await action.run(on: item)
        toaster.show(item.isFeedItem && action == .save && Watch.isVideo(item) ? "Saved for later" : action.doneMessage)
        if !item.isFeedItem || action == .save { await loadUpNext() }
      } catch {
        withAnimation { feeds.restore(item) }
        toaster.show(error.localizedDescription)
      }
    }
  }
}
