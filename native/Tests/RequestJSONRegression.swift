import Foundation

private struct TestFailure: Error {
  let message: String
}

@main struct RequestJSONRegression {
  static func main() async throws {
    let validInput: [String: Any] = [
      "id": "article", "readingProgressPercent": 100,
      "readingProgressTopPercent": 93, "readingProgressAnchorIndex": 12,
    ]
    let body: [String: Any] = ["query": "mutation SaveArticleReadingProgress", "variables": ["input": validInput]]
    let data = try StashAPI.encodeRequestBody(body)
    let decoded = try JSONSerialization.jsonObject(with: data) as? NSDictionary
    guard decoded?.isEqual(to: body) == true else {
      throw TestFailure(message: "Valid request must survive encoding unchanged")
    }

    let api = StashAPI()
    api.token = "test-token"
    for invalid in [Double.nan, Double.infinity, -Double.infinity] {
      var input = validInput
      input["readingProgressAnchorIndex"] = invalid
      let variables: [String: Any] = ["input": input]
      try await rejectsInvalidJSON {
        _ = try await api.graphQLJSON("mutation SaveArticleReadingProgress", variables: variables)
      }
      try await rejectsInvalidJSON {
        let _: [String: String] = try await api.graphQL("mutation SaveArticleReadingProgress", variables: variables)
      }
    }
    try await rejectsInvalidJSON {
      _ = try StashAPI.encodeRequestBody(["nested": ["values": [Date()]]])
    }
    print("PASS: request JSON preserves valid values and rejects NaN, infinity and unsupported nested values without crashing")
  }

  private static func rejectsInvalidJSON(_ operation: () async throws -> Void) async throws {
    do {
      try await operation()
    } catch StashError.server(let message) where message == "Stash couldn't prepare this request." {
      return
    }
    throw TestFailure(message: "Invalid JSON must produce a recoverable error before transport")
  }
}
