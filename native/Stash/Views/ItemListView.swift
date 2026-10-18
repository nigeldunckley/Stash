import SwiftUI

enum ItemAction: Hashable {
  case save, archive, unarchive, delete

  var title: String {
    switch self {
    case .save: return "Save"
    case .archive: return "Archive"
    case .unarchive: return "Move to Saved"
    case .delete: return "Delete"
    }
  }

  var systemImage: String {
    switch self {
    case .save: return "bookmark"
    case .archive: return "archivebox"
    case .unarchive: return "tray.and.arrow.up"
    case .delete: return "trash"
    }
  }

  var tint: Color {
    switch self {
    case .save: return .stashAccent
    case .archive, .unarchive: return .gray
    case .delete: return .red
    }
  }

  var doneMessage: String {
    switch self {
    case .save: return "Saved"
    case .archive: return "Archived"
    case .unarchive: return "Moved to Saved"
    case .delete: return "Deleted"
    }
  }

  func run(on item: LibraryItem) async throws {
    switch self {
    case .save: try await Library.move(item.id, to: "inbox")
    case .archive: try await Library.setArchived(item.id, true)
    case .unarchive: try await Library.setArchived(item.id, false)
    case .delete: try await Library.delete(item.id)
    }
  }
}

/// A list with the reader beside it on Mac, or pushed on top of it on iPhone.
struct ItemListView<Tools: View>: View {
  let title: String
  let list: ItemList
  let query: String
  /// Swipe actions: the first goes on the leading edge, the rest on the trailing edge.
  let leading: ItemAction?
  let trailing: [ItemAction]
  var showsUnseen = false
  var subscriptionName: (LibraryItem) -> String? = { _ in nil }
  var onOpen: (LibraryItem) -> Void = { _ in }
  var emptyTitle = "Nothing here"
  var emptyMessage = ""
  /// Search box text, for lists that can be searched.
  var search: Binding<String>?
  /// Buttons for this list's toolbar.
  @ViewBuilder var tools: () -> Tools

  @State private var selection: LibraryItem?
  @State private var toast: String?

  var body: some View {
    #if os(macOS)
    HSplitView {
      listView
        .frame(minWidth: 300, idealWidth: 380, maxWidth: 560)
      Group {
        if let selection {
          ReaderScreen(item: selection, actions: readerActions(for: selection), perform: perform)
            .id(selection.id)
        } else {
          ContentUnavailableView("Pick something to read", systemImage: "text.alignleft")
        }
      }
      .frame(minWidth: 440, maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.stashBackground)
    }
    #else
    NavigationStack {
      listView
        .navigationDestination(item: $selection) { item in
          ReaderScreen(item: item, actions: readerActions(for: item), perform: perform)
        }
    }
    #endif
  }

  private var listView: some View {
    listContainer
    .listStyle(.plain)
    .overlay { emptyState }
    .overlay(alignment: .bottom) { toastView }
    .navigationTitle(title)
    .toolbar { ToolbarItemGroup(placement: .primaryAction) { tools() } }
    .modifier(Searchable(text: search))
    .refreshable { await list.reload(query) }
    .task(id: query) { await list.load(query) }
    #if os(macOS)
    .onChange(of: selection) { _, item in if let item { open(item) } }
    .onKeyPress(.delete) { performOnSelection(trailing.first) }
    .onKeyPress(.deleteForward) { performOnSelection(trailing.first) }
    .onKeyPress("s") { performOnSelection(leading == .save ? .save : nil) }
    .onKeyPress(.return) { if let url = selection?.originalURL { NSWorkspace.shared.open(url) }; return .handled }
    #endif
  }

  @ViewBuilder
  private var listContainer: some View {
    #if os(macOS)
    List(selection: macSelection) { rows }
    #else
    List { rows }
    #endif
  }

  @ViewBuilder
  private var rows: some View {
    ForEach(list.visibleItems) { item in
      row(item)
        .tag(item.id)
        .task { await list.loadMore(after: item) }
    }
    if list.isLoading && !list.items.isEmpty {
      HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
        .listRowSeparator(.hidden)
    }
  }

  private func row(_ item: LibraryItem) -> some View {
    rowBase(item)
      .swipeActions(edge: .leading) {
        if let leading { actionButton(leading, item) }
      }
      .swipeActions(edge: .trailing) {
        ForEach(trailing, id: \.self) { actionButton($0, item) }
      }
      .contextMenu { contextMenu(item) }
  }

  @ViewBuilder
  private func rowBase(_ item: LibraryItem) -> some View {
    let content = ItemRow(item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item))
    #if os(macOS)
    content
    #else
    Button { selection = item; open(item) } label: { content }
      .buttonStyle(.plain)
    #endif
  }

  private func actionButton(_ action: ItemAction, _ item: LibraryItem) -> some View {
    Button(role: action == .delete ? .destructive : nil) {
      perform(action, item)
    } label: {
      Label(action.title, systemImage: action.systemImage)
    }
    .tint(action.tint)
  }

  @ViewBuilder
  private func contextMenu(_ item: LibraryItem) -> some View {
    if let url = item.originalURL {
      Link(destination: url) { Label("Open original", systemImage: "safari") }
      ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
      Button { copy(url) } label: { Label("Copy link", systemImage: "link") }
      Divider()
    }
    ForEach(([leading].compactMap { $0 } + trailing), id: \.self) { action in
      Button(role: action == .delete ? .destructive : nil) { perform(action, item) } label: {
        Label(action.title, systemImage: action.systemImage)
      }
    }
  }

  @ViewBuilder
  private var emptyState: some View {
    if list.visibleItems.isEmpty {
      if let error = list.error {
        ContentUnavailableView {
          Label("Couldn't load", systemImage: "wifi.exclamationmark")
        } description: {
          Text(error)
        } actions: {
          Button("Try again") { Task { await list.reload(query) } }
        }
      } else if list.isLoading {
        ProgressView()
      } else {
        ContentUnavailableView(emptyTitle, systemImage: "tray", description: Text(emptyMessage))
      }
    }
  }

  @ViewBuilder
  private var toastView: some View {
    if let toast {
      Text(toast)
        .font(.callout.weight(.medium))
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.stashBorder, lineWidth: 0.5))
        .padding(.bottom, 16)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
  }

  // MARK: Doing things

  private var macSelection: Binding<String?> {
    Binding(
      get: { selection?.id },
      set: { id in selection = list.visibleItems.first { $0.id == id } }
    )
  }

  private func readerActions(for item: LibraryItem) -> [ItemAction] {
    [leading].compactMap { $0 } + trailing
  }

  private func open(_ item: LibraryItem) {
    list.markSeen(item)
    onOpen(item)
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    // Move on to the next item, as the web app does.
    let items = list.visibleItems
    if selection?.id == item.id {
      #if os(macOS)
      if let index = items.firstIndex(of: item) {
        let rest = items.dropFirst(index + 1)
        selection = rest.first ?? items.prefix(index).last
      }
      #else
      selection = nil
      #endif
    }
    withAnimation { list.remove(item) }
    Task {
      do {
        try await action.run(on: item)
        show(action.doneMessage)
      } catch {
        withAnimation { list.restore(item) }
        show(error.localizedDescription)
      }
    }
  }

  #if os(macOS)
  private func performOnSelection(_ action: ItemAction?) -> KeyPress.Result {
    guard let action, let item = selection else { return .ignored }
    perform(action, item)
    return .handled
  }
  #endif

  private func show(_ message: String) {
    withAnimation { toast = message }
    Task {
      try? await Task.sleep(for: .seconds(2))
      withAnimation { if toast == message { toast = nil } }
    }
  }

  private func copy(_ url: URL) {
    #if os(iOS)
    UIPasteboard.general.url = url
    #else
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(url.absoluteString, forType: .string)
    #endif
  }
}

private struct Searchable: ViewModifier {
  let text: Binding<String>?

  func body(content: Content) -> some View {
    if let text {
      content.searchable(text: text, prompt: "Search")
    } else {
      content
    }
  }
}
