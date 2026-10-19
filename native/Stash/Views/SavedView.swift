import SwiftUI

/// Articles you've saved to read (or, with `archive`, ones you've finished).
struct SavedView: View {
  let archive: Bool

  /// On iPhone, Saved has a switch to show the archive instead.
  @State private var archiveSwitch = false
  private var isArchive: Bool { archive || archiveSwitch }

  @State private var list = ItemList()
  @State private var searchText = ""
  @State private var submittedSearch = ""
  @State private var isAddingLink = false
  @State private var newLink = ""
  @State private var addError: String?
  /// All, Unread or In progress, as on the web.
  @AppStorage("savedFilter") private var filter = Filter.all

  enum Filter: String { case all, unread, reading }

  private var query: String {
    let base = isArchive ? "in:archive use:folders -type:video" : "in:inbox use:folders -type:video"
    let state = isArchive ? "" : (filter == .unread ? "is:unread" : filter == .reading ? "is:reading" : "")
    return [base, state, submittedSearch].filter { !$0.isEmpty }.joined(separator: " ")
  }

  /// "MONDAY 19 OCTOBER · 42 SAVED · 6H 20M OF READING", or the archived count.
  private var folio: FolioContent {
    let count = list.total ?? list.visibleItems.count
    if isArchive { return FolioContent(items: [FolioContent.today, "\(count) ARCHIVED"]) }
    let minutes = list.visibleItems.filter { $0.progress < 0.03 }.compactMap(\.readingMinutes).reduce(0, +)
    return FolioContent(items: [FolioContent.today, "\(count) SAVED", FolioContent.readingTime(minutes: minutes)])
  }

  var body: some View {
    ItemListView(
      title: isArchive ? "Archive" : "Saved",
      list: list,
      query: query,
      leading: nil,
      trailing: isArchive ? [.unarchive, .delete] : [.archive, .delete],
      emptyTitle: isArchive ? "Nothing archived" : "Nothing saved",
      emptyMessage: isArchive
        ? "Articles you archive end up here."
        : "Save from Feeds, or add a link with the + button.",
      search: $searchText,
      countLabel: isArchive ? "archived" : "saved",
      onSearch: { submittedSearch = searchText },
      folio: folio
    ) {
      #if os(iOS)
      if !archive {
        StashSegmented(selection: $archiveSwitch, [.init("Saved", false), .init("Archive", true)])
      }
      #endif
      if !isArchive {
        #if os(macOS)
        StashSegmented(selection: $filter, [.init("All", Filter.all), .init("Unread", Filter.unread), .init("In progress", Filter.reading)])
        #endif
        Button { isAddingLink = true } label: { Label("Add link", systemImage: "plus") }
          .buttonStyle(.text)
          .help("Save a link")
      }
    }
    .onChange(of: searchText) { _, text in if text.isEmpty { submittedSearch = "" } }
    .alert("Save a link", isPresented: $isAddingLink) {
      TextField("https://", text: $newLink)
        #if os(iOS)
        .keyboardType(.URL)
        .textInputAutocapitalization(.never)
        #endif
        .autocorrectionDisabled()
      Button("Cancel", role: .cancel) { newLink = "" }
      Button("Save") { saveLink() }
    } message: {
      Text("Stash will fetch the article and add it to Saved.")
    }
    .alert("Couldn't save", isPresented: Binding(get: { addError != nil }, set: { if !$0 { addError = nil } })) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(addError ?? "")
    }
    .onAppear(perform: pasteLinkIfCopied)
  }

  private func saveLink() {
    var link = newLink.trimmingCharacters(in: .whitespacesAndNewlines)
    newLink = ""
    guard !link.isEmpty else { return }
    if !link.lowercased().hasPrefix("http") { link = "https://" + link }
    Task {
      do {
        try await Library.save(url: link)
        Moments.shared.saved(title: link)
        // The server fetches the article in the background; give it a moment.
        try? await Task.sleep(for: .seconds(2))
        await list.reload(query)
      } catch {
        addError = error.localizedDescription
      }
    }
  }

  /// Fills in the add box with a copied link, so saving is just a tap.
  private func pasteLinkIfCopied() {
    guard !archive, newLink.isEmpty else { return }
    #if os(macOS)
    if let text = NSPasteboard.general.string(forType: .string), text.hasPrefix("http"), URL(string: text) != nil {
      newLink = text
    }
    #endif
  }
}
