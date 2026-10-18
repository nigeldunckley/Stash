import SwiftUI

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
  @State private var toaster = Toaster()

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
    .toasts(toaster)
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
      .itemSwipes(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .itemMenu(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
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
    if action.removesItem && selection?.id == item.id {
      #if os(macOS)
      if let index = items.firstIndex(of: item) {
        let rest = items.dropFirst(index + 1)
        selection = rest.first ?? items.prefix(index).last
      }
      #else
      selection = nil
      #endif
    }
    runItemAction(
      action, item, toaster: toaster,
      remove: { list.remove(item) },
      restore: { list.restore(item) },
      refresh: {
        if action == .markSeen { list.markSeen(item) } else { await list.reload(query) }
      }
    )
  }

  #if os(macOS)
  private func performOnSelection(_ action: ItemAction?) -> KeyPress.Result {
    guard let action, let item = selection else { return .ignored }
    perform(action, item)
    return .handled
  }
  #endif
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
