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
          EmptyBox(message: "Pick something to read", systemImage: "text.alignleft", boxed: false)
        }
      }
      .frame(minWidth: 440, maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.stPage)
      
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
    .stashList()
    .overlay { emptyState }
    .toasts(toaster)
    .navigationTitle(title)
    .toolbar { ToolbarItemGroup(placement: .primaryAction) { tools() } }
    .modifier(Searchable(text: search))
    .refreshable { await list.reload(query) }
    .task(id: query) { await list.load(query) }
    #if os(macOS)
    .onChange(of: selection) { _, item in if let item { open(item) } }
    .focusable()
    .focusEffectDisabled()
    .onKeyPress(.downArrow) { step(1) }
    .onKeyPress(.upArrow) { step(-1) }
    .onKeyPress(.delete) { performOnSelection(trailing.first) }
    .onKeyPress(.deleteForward) { performOnSelection(trailing.first) }
    .onKeyPress("s") { performOnSelection(leading == .save ? .save : nil) }
    .onKeyPress(.return) { if let url = selection?.originalURL { NSWorkspace.shared.open(url) }; return .handled }
    #endif
  }

  @ViewBuilder
  private var listContainer: some View {
    #if os(macOS)
    // Selection is drawn by StashRow rather than the system, so the row stays Stash grey with
    // an orange bar instead of the Mac's accent colour.
    ScrollViewReader { proxy in
      List { rows }
        .onChange(of: selection) { _, item in
          if let item { withAnimation(.snappy(duration: 0.15)) { proxy.scrollTo(item.id) } }
        }
    }
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
        .padding(.vertical, 8)
        .stashListRow()
    }
  }

  private func row(_ item: LibraryItem) -> some View {
    rowBase(item)
      .stashListRow()
      .itemSwipes(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
      .itemMenu(item, unseen: showsUnseen && list.isUnseen(item), perform: perform)
  }

  @ViewBuilder
  private func rowBase(_ item: LibraryItem) -> some View {
    #if os(macOS)
    ItemRow(item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item), selected: selection?.id == item.id)
      .onTapGesture { selection = item }
    #else
    let content = ItemRow(item: item, subscriptionName: subscriptionName(item), unseen: showsUnseen && list.isUnseen(item))
    Button { selection = item; open(item) } label: { content }
      .buttonStyle(.plain)
    #endif
  }

  @ViewBuilder
  private var emptyState: some View {
    if list.visibleItems.isEmpty {
      if let error = list.error {
        EmptyBox(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark", boxed: false) {
          Button("Try again") { Task { await list.reload(query) } }
        }
      } else if list.isLoading {
        ProgressView()
      } else {
        EmptyBox(title: emptyTitle, message: emptyMessage, systemImage: "tray", boxed: false)
      }
    }
  }

  // MARK: Doing things


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
        if action == .markSeen || action == .openOriginal { list.markSeen(item) } else { await list.reload(query) }
      }
    )
  }

  #if os(macOS)
  /// Up and down arrows move the selection through the list.
  private func step(_ offset: Int) -> KeyPress.Result {
    let items = list.visibleItems
    guard !items.isEmpty else { return .ignored }
    guard let current = selection, let index = items.firstIndex(of: current) else {
      selection = offset > 0 ? items.first : items.last
      return .handled
    }
    let next = min(max(index + offset, 0), items.count - 1)
    selection = items[next]
    return .handled
  }

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
