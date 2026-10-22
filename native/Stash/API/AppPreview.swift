#if DEBUG
import Foundation

/// Local data for native UI checks. Never reads credentials or sends library mutations.
/// Build with DEBUG + STASH_PREVIEW, or launch a Debug build with --preview.
enum AppPreview {
  static let enabled: Bool = {
    #if STASH_PREVIEW
    return true
    #else
    return ProcessInfo.processInfo.arguments.contains("--preview")
    #endif
  }()
  @MainActor private static var items = makeItems()
  @MainActor private static var settings: [String: Any] = ["watch": ["order": [], "collections": ["music", "parks"]]]

  private static func makeItems() -> [[String: Any]] {
    let titles = ["A walk along the coast", "How the album was recorded", "The last night at the cinema", "A new route through the city", "The bookshop on the corner", "Making room for a small garden", "A visit to the park", "Behind the scenes at the studio", "An afternoon on the railway"]
    return titles.enumerated().map { index, title in
      let video = index >= 6
      let stamp = ISO8601DateFormatter().string(from: Date.now.addingTimeInterval(Double(-index * 3600)))
      return ["id": "preview-\(index)", "title": title, "slug": "preview-\(index)",
        "url": video ? "https://www.youtube.com/watch?v=M7lc1UVf-VE" : "https://example.com/preview-\(index)",
        "folder": [0, 1, 2, 6, 7].contains(index) ? "inbox" : "following",
        "pageType": video ? "VIDEO" : "ARTICLE", "contentReader": "WEB", "state": "SUCCEEDED",
        "author": "Preview library", "siteName": "Preview library", "subscription": video ? "https://youtube.com/feeds/preview" : "https://example.com/feed",
        "createdAt": stamp, "savedAt": stamp, "publishedAt": stamp,
        "wordsCount": video ? 5645 : 1880, "readingProgressPercent": [0,6].contains(index) ? 35.0 : 0.0,
        "readingProgressAnchorIndex": index == 6 ? 420 : 0, "highlightsCount": 0,
        "description": "", "labels": [], "highlights": [], "directionality": "LTR"]
    }
  }

  @MainActor static func response(_ query: String, variables: [String: Any]) throws -> Data {
    var result: [String: Any] = [:]
    if query.contains("query Search") {
      let filter = variables["query"] as? String ?? ""
      var found = items.filter { item in
        let video = item["pageType"] as? String == "VIDEO"
        let progress = item["readingProgressPercent"] as? Double ?? 0
        if filter.contains("in:inbox"), item["folder"] as? String != "inbox" { return false }
        if filter.contains("in:following"), item["folder"] as? String != "following" { return false }
        if filter.contains("in:archive"), item["state"] as? String != "ARCHIVED" { return false }
        if !filter.contains("in:archive"), item["state"] as? String == "ARCHIVED" { return false }
        if item["state"] as? String == "DELETED" { return false }
        if filter.contains("-type:video") && video { return false }
        if !filter.contains("-type:video") && filter.contains("type:video") && !video { return false }
        if filter.contains("is:reading") && !(progress >= 2 && progress < 90) { return false }
        if filter.contains("is:unread") && progress >= 2 { return false }
        if filter.contains("-is:seen") && item["seenAt"] != nil { return false }
        return true
      }
      if let range = filter.range(of: "includes:") {
        let ids = String(filter[range.upperBound...]).split(separator: " ").first.map(String.init) ?? ""
        found = found.filter { ids.split(separator: ",").contains(Substring($0["id"] as? String ?? "")) }
      }
      let start = Int(variables["after"] as? String ?? "0") ?? 0
      let limit = variables["first"] as? Int ?? 30
      let end = min(found.count, start + limit)
      let slice = Array(found.dropFirst(start).prefix(limit))
      result = ["search": ["edges": slice.map { ["node": $0] }, "pageInfo": ["hasNextPage": end < found.count, "endCursor": "\(end)", "totalCount": found.count]]]
    } else if query.contains("query Viewer") {
      result = ["me": ["id": "preview", "name": "Preview library", "profile": ["id": "preview", "username": "preview"]]]
    } else if query.contains("query GetArticle") {
      var item = items.first { $0["slug"] as? String == variables["slug"] as? String } ?? items[0]
      let paragraphs = ["We took the train to the coast on Saturday. It was quiet when we arrived, and the cafe by the station had just opened.", "The path followed the water for a mile before turning inland. We stopped at a bench to look at the map, then carried on towards the harbour.", "A few boats were coming in. Two people were unloading boxes on the quay, and someone was washing the windows of the sailing club.", "We bought lunch from the bakery and found a place to sit out of the wind. There was no reason to hurry back."]
      item["content"] = (0..<5).map { _ in paragraphs.map { "<p>\($0)</p>" }.joined() }.joined()
      item["linkId"] = item["id"]
      result = ["article": ["article": item]]
    } else if query.contains("query GetSubscriptions") {
      result = ["subscriptions": ["subscriptions": [["id": "feed", "name": "Preview articles", "type": "RSS", "url": "https://example.com/feed"], ["id": "channel", "name": "Preview videos", "type": "RSS", "url": "https://youtube.com/feeds/preview"]]]]
    } else if query.contains("query GetLabels") {
      result = ["labels": ["labels": [["id": "music", "name": "Music", "color": "#FF4F00"], ["id": "parks", "name": "Theme Parks", "color": "#3B82F6"]]]]
    } else if query.contains("getUserPersonalization") {
      result = ["getUserPersonalization": ["userPersonalization": ["fields": settings]]]
    } else if query.contains("setUserPersonalization") {
      settings = (variables["input"] as? [String: Any])?["fields"] as? [String: Any] ?? settings
      result = ["setUserPersonalization": ["updatedUserPersonalization": ["fields": settings]]]
    } else if query.contains("feedSuggestions") {
      result = ["feedSuggestions": ["suggestions": [], "enabled": true]]
    } else if query.contains("youtubeTranscript") {
      result = ["youtubeTranscript": ["lines": []]]
    } else if query.contains("mutation SaveUrl") {
      let input = variables["input"] as? [String: Any] ?? [:]
      var item = makeItems()[1]
      item["id"] = "preview-new"; item["slug"] = "preview-new"
      item["url"] = input["url"] as? String ?? "https://example.com/new"
      item["title"] = "Newly saved article"
      if !items.contains(where: { $0["url"] as? String == item["url"] as? String }) { items.insert(item, at: 0) }
      result = ["saveUrl": ["url": item["url"]!]]
    } else if query.contains("mutation MoveToFolder") {
      if let index = items.firstIndex(where: { $0["id"] as? String == variables["id"] as? String }) { items[index]["folder"] = variables["folder"] }
      result = ["moveToFolder": ["success": true]]
    } else if query.contains("saveArticleReadingProgress") {
      let input = variables["input"] as? [String: Any] ?? [:]
      if let index = items.firstIndex(where: { $0["id"] as? String == input["id"] as? String }) {
        items[index]["readingProgressPercent"] = input["readingProgressPercent"]
        items[index]["readingProgressAnchorIndex"] = input["readingProgressAnchorIndex"]
      }
      result = ["saveArticleReadingProgress": ["updatedArticle": ["id": input["id"] ?? "preview"]]]
    } else if query.contains("setLinkArchived") {
      let input = variables["input"] as? [String: Any] ?? [:]
      if let index = items.firstIndex(where: { $0["id"] as? String == input["linkId"] as? String }) { items[index]["state"] = (input["archived"] as? Bool ?? true) ? "ARCHIVED" : "SUCCEEDED" }
      result = ["setLinkArchived": ["linkId": input["linkId"] ?? "preview"]]
    } else if query.contains("bulkAction") {
      result = ["bulkAction": ["success": true]]
    } else {
      throw StashError.server("This action isn't available in the local preview.")
    }
    return try JSONSerialization.data(withJSONObject: result)
  }
}
#endif
