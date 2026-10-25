import Foundation
import Observation

enum LinkValidation {
  static func url(_ input: String) throws -> URL {
    let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
    let value = text.contains("://") ? text : "https://" + text
    guard !text.isEmpty, !text.contains(where: \.isWhitespace),
          let parts = URLComponents(string: value),
          ["http", "https"].contains(parts.scheme?.lowercased() ?? ""),
          let host = parts.host, host.contains("."),
          parts.user == nil, parts.password == nil, let url = parts.url else {
      throw ValidationError()
    }
    return url
  }

  struct ValidationError: LocalizedError {
    var errorDescription: String? { "Enter a website address, such as example.com/article." }
  }
}

/// YouTube video links in any of their forms: watch, youtu.be, Shorts, embed and live.
enum YouTubeLink {
  static func videoID(_ url: URL) -> String? {
    guard let host = url.host()?.lowercased() else { return nil }
    if host == "youtu.be" {
      let id = String(url.path().dropFirst().prefix(11))
      return id.isEmpty ? nil : id
    }
    guard host.hasSuffix("youtube.com") else { return nil }
    if let v = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "v" })?.value {
      return v
    }
    let parts = url.path().split(separator: "/")
    if parts.count >= 2, ["shorts", "embed", "live", "v"].contains(String(parts[0])) {
      return String(parts[1].prefix(11))
    }
    return nil
  }

  static func isVideo(_ text: String) -> Bool {
    URL(string: text).flatMap(videoID) != nil
  }
}

@MainActor
@Observable
final class LinkCapture {
  enum Phase: Equatable { case editing, saving, preparing, queued, saved, failed }
  var text = ""
  private(set) var phase: Phase = .editing
  private(set) var message: String?
  var busy: Bool { phase == .saving || phase == .preparing }
  var accepted: Bool { phase == .preparing || phase == .queued || phase == .saved }

  @ObservationIgnored private let saveURL: (String) async throws -> String
  @ObservationIgnored private let findURL: (String) async throws -> Bool
  @ObservationIgnored private let pause: (Int) async throws -> Void

  init(
    save: @escaping (String) async throws -> String = { try await Library.save(url: $0) },
    find: @escaping (String) async throws -> Bool = { url in
      let page = try await Library.search("in:inbox use:folders sort:saved-desc", first: 20)
      return page.items.contains { $0.originalArticleUrl == url || $0.url == url }
    },
    pause: @escaping (Int) async throws -> Void = { try await Task.sleep(for: .seconds($0)) }
  ) {
    saveURL = save
    findURL = find
    self.pause = pause
  }

  func submit() async {
    guard !busy, !accepted else { return }
    do {
      let url = try LinkValidation.url(text).absoluteString
      phase = .saving
      message = "Saving…"
      let canonical = try await saveURL(url)
      // A YouTube video is ready the moment it's saved, under its own watch link.
      if YouTubeLink.isVideo(url) {
        phase = .saved
        message = "Saved to Watch."
        LibraryChanges.shared.publish()
        return
      }
      phase = .preparing
      message = "Saved. The article is being prepared."
      LibraryChanges.shared.publish()
      for delay in [0, 1, 2, 4, 8] {
        if delay > 0 { try? await pause(delay) }
        if (try? await findURL(canonical)) == true {
          phase = .saved
          message = "Ready in Saved."
          LibraryChanges.shared.publish()
          return
        }
      }
      // An accepted request is never submitted again just because fetching is slow.
      phase = .queued
      message = "Saved. It will appear in Saved when it's ready."
      LibraryChanges.shared.publish()
    } catch {
      phase = .failed
      message = error.localizedDescription
    }
  }
}
