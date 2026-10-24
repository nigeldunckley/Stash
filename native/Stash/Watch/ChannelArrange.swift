import SwiftUI
import UniformTypeIdentifiers

/// Making, changing and ordering Watch collections, as the web does. Each collection is a
/// label marked "Watch collection"; which labels are collections, and their order, is the
/// `watch.collections` list kept with your account.
extension Watch {
  /// New collections take the next of these in turn.
  static let collectionColors = [
    "#4C7BF3", "#E5484D", "#F5A524", "#8E4EC6", "#30A46C", "#12A594", "#E54D8F", "#8B8D98",
  ]

  /// Saves the order of the collections. Reads the latest list first, so a collection made
  /// on another device meanwhile is kept, at the end.
  static func setCollectionOrder(_ ids: [String]) async throws {
    try await Personalization.update("watch") { current in
      var watch = current as? [String: Any] ?? [:]
      let latest = watch["collections"] as? [String] ?? []
      watch["collections"] = ids + latest.filter { !ids.contains($0) }
      return watch
    }
  }

  /// Makes a collection, reusing a label with the same name rather than duplicating it.
  static func createCollection(name: String, color: String) async throws -> WatchCollection {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let labels = try await StashAPI.shared.graphQLJSON("""
      query GetLabels { labels { ... on LabelsSuccess { labels { id name color } } ... on LabelsError { errorCodes } } }
      """, variables: [:])
    let all = ((labels["labels"] as? [String: Any])?["labels"] as? [[String: Any]]) ?? []
    var label = all.first { ($0["name"] as? String)?.lowercased() == trimmed.lowercased() }
    if label == nil {
      let data = try await StashAPI.shared.graphQLJSON("""
        mutation CreateLabel($input: CreateLabelInput!) {
          createLabel(input: $input) {
            ... on CreateLabelSuccess { label { id name color } }
            ... on CreateLabelError { errorCodes }
          }
        }
        """, variables: ["input": ["name": trimmed, "color": color, "description": "Watch collection"]])
      let result = data["createLabel"] as? [String: Any]
      if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
      label = result?["label"] as? [String: Any]
    }
    guard let label, let id = label["id"] as? String else { throw StashError.server("NO_LABEL") }
    try await Personalization.update("watch") { current in
      var watch = current as? [String: Any] ?? [:]
      let ids = watch["collections"] as? [String] ?? []
      watch["collections"] = ids.contains(id) ? ids : ids + [id]
      return watch
    }
    return WatchCollection(id: id, name: label["name"] as? String ?? trimmed, color: label["color"] as? String ?? color)
  }

  static func updateCollection(_ collection: WatchCollection, name: String, color: String) async throws {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation UpdateLabel($input: UpdateLabelInput!) {
        updateLabel(input: $input) {
          ... on UpdateLabelSuccess { label { id } }
          ... on UpdateLabelError { errorCodes }
        }
      }
      """, variables: ["input": [
        "labelId": collection.id, "name": trimmed.isEmpty ? collection.name : trimmed,
        "color": color, "description": "Watch collection",
      ]])
    if let code = ((data["updateLabel"] as? [String: Any])?["errorCodes"] as? [String])?.first {
      throw StashError.server(code)
    }
  }

  /// Deleting the label also takes it off its channels and videos. The label goes first, so
  /// if that fails the collection is still listed.
  static func deleteCollection(_ collection: WatchCollection) async throws {
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation DeleteLabel($id: ID!) {
        deleteLabel(id: $id) {
          ... on DeleteLabelSuccess { label { id } }
          ... on DeleteLabelError { errorCodes }
        }
      }
      """, variables: ["id": collection.id])
    if let code = ((data["deleteLabel"] as? [String: Any])?["errorCodes"] as? [String])?.first {
      throw StashError.server(code)
    }
    try await Personalization.update("watch") { current in
      var watch = current as? [String: Any] ?? [:]
      watch["collections"] = (watch["collections"] as? [String] ?? []).filter { $0 != collection.id }
      return watch
    }
  }
}

/// A channel or collection being dragged on All channels. Its own type, so only this app's
/// drop areas take it, never a text field.
struct ArrangeDrag: Codable, Transferable {
  let kind: String
  let id: String

  static var transferRepresentation: some TransferRepresentation {
    CodableRepresentation(contentType: .stashArrange)
  }
}

extension UTType {
  static let stashArrange = UTType(exportedAs: "com.nigeldunckley.stash.arrange")
}

extension Subscription {
  /// The same channel filed in another collection, or in none.
  func filed(in collectionId: String?) -> Subscription {
    Subscription(
      id: id, name: name, type: type, url: url, icon: icon, status: status,
      collectionId: collectionId, hideShortVideos: hideShortVideos, youtubeImported: youtubeImported,
      youtubeManualFollow: youtubeManualFollow, youtubeExcluded: youtubeExcluded, lastFetchedAt: lastFetchedAt
    )
  }
}

extension Color {
  /// A colour from the web's "#RRGGBB" strings, such as a collection's label colour.
  init?(hexString: String) {
    let digits = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
    self.init(hex: value)
  }
}

/// Naming a collection and picking its colour, for a new one or to change one.
struct CollectionSheet: View {
  enum Purpose: Identifiable {
    /// A new collection, with the channel dropped on "New collection" to move into it.
    case new(Subscription?, color: String)
    case edit(WatchCollection)

    var id: String {
      switch self {
      case .new(let channel, _): "new-\(channel?.id ?? "")"
      case .edit(let collection): collection.id
      }
    }
  }

  let purpose: Purpose
  let onSave: (_ name: String, _ color: String) -> Void

  @State private var name: String
  @State private var color: String
  @FocusState private var focused: Bool
  @Environment(\.dismiss) private var dismiss

  init(_ purpose: Purpose, onSave: @escaping (_ name: String, _ color: String) -> Void) {
    self.purpose = purpose
    self.onSave = onSave
    switch purpose {
    case .new(_, let color):
      _name = State(initialValue: "")
      _color = State(initialValue: color)
    case .edit(let collection):
      _name = State(initialValue: collection.name)
      _color = State(initialValue: collection.color)
    }
  }

  private var title: String {
    switch purpose {
    case .new(let channel?, _): "New collection for \(channel.name)"
    case .new: "New collection"
    case .edit: "Change collection"
    }
  }

  private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text(title)
        .font(.ui(17, .semibold, relativeTo: .headline))
        .foregroundStyle(Color.stInk)
        .lineLimit(2)
      TextField("Name, such as Tech", text: $name)
        .textFieldStyle(.roundedBorder)
        .focused($focused)
        .onSubmit(save)
      HStack(spacing: 10) {
        ForEach(Watch.collectionColors, id: \.self) { hex in
          Button { color = hex } label: {
            Circle()
              .fill(Color(hexString: hex) ?? .stMuted)
              .frame(width: 22, height: 22)
              .padding(3)
              .overlay(Circle().strokeBorder(color == hex ? Color.stInk : .clear, lineWidth: 1.5))
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Colour \(hex)")
          .accessibilityAddTraits(color == hex ? .isSelected : [])
        }
      }
      HStack {
        Spacer()
        Button("Cancel") { dismiss() }
          .keyboardShortcut(.cancelAction)
        Button("Save", action: save)
          .keyboardShortcut(.defaultAction)
          .disabled(trimmed.isEmpty)
      }
    }
    .padding(24)
    .frame(minWidth: 340)
    .onAppear { focused = true }
    #if os(iOS)
    .presentationDetents([.height(260)])
    #endif
  }

  private func save() {
    guard !trimmed.isEmpty else { return }
    onSave(trimmed, color)
    dismiss()
  }
}
