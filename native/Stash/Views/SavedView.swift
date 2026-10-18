import SwiftUI

/// Articles you've saved to read (or, with `archive`, ones you've finished).
struct SavedView: View {
  let archive: Bool

  @State private var list = ItemList()
  @State private var searchText = ""
  @State private var submittedSearch = ""
  @State private var isAddingLink = false
  @State private var newLink = ""
  @State private var addError: String?

  private var query: String {
    let base = archive ? "in:archive use:folders -type:video" : "in:inbox use:folders -type:video"
    return [base, submittedSearch].filter { !$0.isEmpty }.joined(separator: " ")
  }

  var body: some View {
    ItemListView(
      title: archive ? "Archive" : "Saved",
      list: list,
      query: query,
      leading: nil,
      trailing: archive ? [.unarchive, .delete] : [.archive, .delete],
      emptyTitle: archive ? "Nothing archived" : "Nothing saved",
      emptyMessage: archive
        ? "Articles you archive end up here."
        : "Save from Feeds, or add a link with the + button.",
      search: $searchText
    ) {
      if !archive {
        Button { isAddingLink = true } label: { Label("Add link", systemImage: "plus") }
          .keyboardShortcut("n", modifiers: .command)
          .help("Save a link")
      }
    }
    .onSubmit(of: .search) { submittedSearch = searchText }
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
