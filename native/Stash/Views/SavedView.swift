import SwiftUI

/// Articles you've saved to read (or, with `archive`, ones you've finished; with `trash`,
/// anything you've deleted, articles and videos alike).
struct SavedView: View {
  let archive: Bool
  var trash = false

  private var isArchive: Bool { archive }

  @State private var list = ItemList()
  @State private var searchText = ""
  @State private var submittedSearch = ""
  @State private var isAddingLink = false
  /// All, Unread or In progress, as on the web.
  @AppStorage("savedFilter") private var filter = Filter.all

  enum Filter: String { case all, unread, reading }

  private var query: String {
    if trash { return ["in:trash use:folders", submittedSearch].filter { !$0.isEmpty }.joined(separator: " ") }
    let base = isArchive ? "in:archive use:folders -type:video" : "in:inbox use:folders -type:video"
    let state = isArchive ? "" : (filter == .unread ? "is:unread" : filter == .reading ? "is:reading" : "")
    return [base, state, submittedSearch].filter { !$0.isEmpty }.joined(separator: " ")
  }

  /// "MONDAY 19 OCTOBER · 42 SAVED · 6H 20M OF READING", or the archived count.
  private var folio: FolioContent {
    let count = list.total ?? list.visibleItems.count
    if trash { return FolioContent(items: [FolioContent.today, "\(count) IN TRASH"]) }
    if isArchive { return FolioContent(items: [FolioContent.today, "\(count) ARCHIVED"]) }
    let minutes = list.visibleItems.filter { $0.progress < 0.03 }.compactMap(\.readingMinutes).reduce(0, +)
    return FolioContent(items: [FolioContent.today, "\(count) SAVED", FolioContent.readingTime(minutes: minutes)])
  }

  var body: some View {
    ItemListView(
      title: trash ? "Trash" : isArchive ? "Archive" : "Saved",
      list: list,
      query: query,
      leading: trash ? .restore : nil,
      trailing: trash ? [] : isArchive ? [.unarchive, .delete] : [.archive, .delete],
      emptyTitle: trash ? "Trash is empty" : isArchive ? "Nothing archived" : "Nothing saved",
      emptyMessage: trash
        ? "Anything you delete ends up here, and you can put it back."
        : isArchive
        ? "Articles you archive end up here."
        : "Save from Feeds, or add a link with the + button.",
      search: $searchText,
      countLabel: trash ? "in Trash" : isArchive ? "archived" : "saved",
      onSearch: { submittedSearch = searchText },
      folio: folio
    ) {
      if !isArchive && !trash {
        StashSegmented(selection: $filter, [.init("All", Filter.all), .init("Unread", Filter.unread), .init("In progress", Filter.reading)])
        Button { isAddingLink = true } label: { Label("Add link", systemImage: "plus") }
          .buttonStyle(.text)
          .help("Save a link")
      }
    }
    .onChange(of: searchText) { _, text in if text.isEmpty { submittedSearch = "" } }
    .linkCapture(isPresented: $isAddingLink)
  }
}
