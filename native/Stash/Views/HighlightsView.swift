import SwiftUI

/// Everything you've highlighted, newest first. Tap one to open its article.
struct HighlightsView: View {
  @State private var highlights: [Highlight] = []
  @State private var cursor: String?
  @State private var hasMore = true
  @State private var isLoading = false
  @State private var error: String?
  @State private var searchText = ""
  @State private var submittedSearch = ""
  @State private var toaster = Toaster()
  @State private var confirmDelete: Highlight?
  @Environment(\.openURL) private var openURL

  var body: some View {
    NavigationStack {
      List {
        ForEach(highlights) { highlight in
          row(highlight)
            .task { await loadMore(after: highlight) }
        }
        if isLoading && !highlights.isEmpty {
          HStack { Spacer(); ProgressView().controlSize(.small); Spacer() }
            .listRowSeparator(.hidden)
        }
      }
      .listStyle(.plain)
      .overlay { emptyState }
      .navigationTitle("Highlights")
      .navigationDestination(for: LibraryItem.self) { item in
        ItemDestination(item: item, perform: perform)
      }
      .searchable(text: $searchText, prompt: "Search highlights")
      .onSubmit(of: .search) { submittedSearch = searchText }
      .onChange(of: searchText) { _, text in if text.isEmpty { submittedSearch = "" } }
      .refreshable { await reload() }
      .task(id: submittedSearch) { await reload() }
      .toasts(toaster)
      .confirmationDialog(
        "Delete this highlight?",
        isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
        presenting: confirmDelete
      ) { highlight in
        Button("Delete highlight", role: .destructive) { delete(highlight) }
      }
    }
  }

  private func delete(_ highlight: Highlight) {
    withAnimation { highlights.removeAll { $0.id == highlight.id } }
    Task {
      do {
        try await Highlights.delete(highlight.id)
        toaster.show("Highlight deleted")
      } catch {
        toaster.show(error.localizedDescription)
        await reload()
      }
    }
  }

  @ViewBuilder
  private func row(_ highlight: Highlight) -> some View {
    let content = VStack(alignment: .leading, spacing: 8) {
      if let quote = highlight.quote, !quote.isEmpty {
        Text(quote)
          .font(.system(.body, design: .serif))
          .foregroundStyle(Color.stashInk)
          .padding(.leading, 12)
          .overlay(alignment: .leading) {
            Rectangle().fill(color(highlight)).frame(width: 3)
          }
      }
      if let note = highlight.annotation, !note.isEmpty {
        Label(note, systemImage: "text.bubble")
          .font(.callout)
          .foregroundStyle(Color.stashInk)
      }
      HStack(spacing: 6) {
        if let item = highlight.libraryItem {
          SiteIcon(url: item.iconURL)
          Text(item.title).lineLimit(1)
          Text("·")
          Text(item.source).lineLimit(1)
        }
        Spacer(minLength: 0)
        Text(shortAge(highlight.createdAt))
      }
      .font(.stashDetail)
      .foregroundStyle(Color.stashMuted)
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
    .contextMenu {
      if let quote = highlight.quote {
        Button { copy(quote) } label: { Label("Copy quote", systemImage: "doc.on.doc") }
        ShareLink(item: share(quote, highlight)) { Label("Share", systemImage: "square.and.arrow.up") }
      }
      if let url = highlight.libraryItem?.originalURL {
        Link(destination: url) { Label("Open original", systemImage: "safari") }
      }
      Divider()
      Button(role: .destructive) { confirmDelete = highlight } label: { Label("Delete highlight", systemImage: "trash") }
    }

    Group {
      if let item = highlight.libraryItem {
        NavigationLink(value: item) { content }
      } else {
        content
      }
    }
    .swipeActions(edge: .leading, allowsFullSwipe: true) {
      if let quote = highlight.quote {
        Button { copy(quote) } label: { Label("Copy", systemImage: "doc.on.doc") }
          .tint(.blue)
      }
      if let url = highlight.libraryItem?.originalURL {
        Button { openURL(url) } label: { Label("Open original", systemImage: "safari") }
          .tint(.teal)
      }
    }
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button(role: .destructive) { confirmDelete = highlight } label: { Label("Delete", systemImage: "trash") }
    }
  }

  @ViewBuilder
  private var emptyState: some View {
    if highlights.isEmpty {
      if let error {
        ContentUnavailableView {
          Label("Couldn't load", systemImage: "wifi.exclamationmark")
        } description: {
          Text(error)
        } actions: {
          Button("Try again") { Task { await reload() } }
        }
      } else if isLoading {
        ProgressView()
      } else if !submittedSearch.isEmpty {
        ContentUnavailableView.search(text: submittedSearch)
      } else {
        ContentUnavailableView(
          "No highlights yet", systemImage: "highlighter",
          description: Text("Select text while reading and choose Highlight."))
      }
    }
  }

  // MARK: Loading

  private func reload() async {
    isLoading = true
    defer { isLoading = false }
    do {
      let page = try await Highlights.page(query: submittedSearch)
      highlights = page.highlights.filter { $0.type != "REDACTION" }
      cursor = page.endCursor
      hasMore = page.hasNextPage
      error = nil
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func loadMore(after highlight: Highlight) async {
    guard hasMore, !isLoading, let index = highlights.firstIndex(of: highlight), index >= highlights.count - 5 else { return }
    isLoading = true
    defer { isLoading = false }
    if let page = try? await Highlights.page(after: cursor, query: submittedSearch) {
      let known = Set(highlights.map(\.id))
      highlights += page.highlights.filter { !known.contains($0.id) && $0.type != "REDACTION" }
      cursor = page.endCursor
      hasMore = page.hasNextPage
    }
  }

  // MARK: Doing things

  /// The web's highlight colours: yellow unless chosen otherwise.
  private func color(_ highlight: Highlight) -> Color {
    switch highlight.color {
    case "red": return .red
    case "green": return .green
    case "blue": return .blue
    default: return .yellow
    }
  }

  private func share(_ quote: String, _ highlight: Highlight) -> String {
    guard let item = highlight.libraryItem else { return "“\(quote)”" }
    return "“\(quote)”\n— \(item.title)\n\(item.originalArticleUrl ?? item.url)"
  }

  private func copy(_ text: String) {
    #if os(iOS)
    UIPasteboard.general.string = text
    #else
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
    #endif
    toaster.show("Copied")
  }

  private func perform(_ action: ItemAction, _ item: LibraryItem) {
    Task {
      do {
        try await action.run(on: item)
        toaster.show(action.doneMessage)
      } catch {
        toaster.show(error.localizedDescription)
      }
    }
  }
}
