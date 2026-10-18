import Foundation

/// Settings the web app keeps with your account (Watch's collections, The Edition's issues),
/// so the Mac, iPhone and web all see the same ones.
enum Personalization {
  static func fields() async throws -> [String: Any] {
    let data = try await StashAPI.shared.graphQLJSON("""
      query PersonalizationFields {
        getUserPersonalization {
          ... on GetUserPersonalizationSuccess { userPersonalization { fields } }
          ... on GetUserPersonalizationError { errorCodes }
        }
      }
      """, variables: [:])
    let result = data["getUserPersonalization"] as? [String: Any]
    return (result?["userPersonalization"] as? [String: Any])?["fields"] as? [String: Any] ?? [:]
  }

  /// Changes one entry. Reads the latest copy first so everything else kept there is left as it is.
  @discardableResult
  static func update(_ key: String, _ change: (Any?) -> Any) async throws -> [String: Any] {
    var fields = try await fields()
    fields[key] = change(fields[key])
    let data = try await StashAPI.shared.graphQLJSON("""
      mutation SetPersonalizationFields($input: SetUserPersonalizationInput!) {
        setUserPersonalization(input: $input) {
          ... on SetUserPersonalizationSuccess { updatedUserPersonalization { fields } }
          ... on SetUserPersonalizationError { errorCodes }
        }
      }
      """, variables: ["input": ["fields": fields]])
    let result = data["setUserPersonalization"] as? [String: Any]
    if let code = (result?["errorCodes"] as? [String])?.first { throw StashError.server(code) }
    return fields
  }
}
