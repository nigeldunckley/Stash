import Foundation

/// Where the app points. Change `server` to use a different Stash install.
enum StashConfig {
  static let server = URL(string: "https://stash.nigeldunckley.com")!
}

enum StashError: LocalizedError {
  case signedOut
  case server(String)

  var errorDescription: String? {
    switch self {
    case .signedOut: return "You've been signed out."
    case .server(let message): return message
    }
  }
}

/// Talks to the Stash server: signing in, and GraphQL for everything else.
final class StashAPI: @unchecked Sendable {
  static let shared = StashAPI()

  /// The sign-in token, sent with every request. Kept in the Keychain by `Session`.
  var token: String?

  private let urlSession: URLSession = {
    let config = URLSessionConfiguration.default
    // The token goes in a header; cookies would only get in its way.
    config.httpShouldSetCookies = false
    config.httpCookieAcceptPolicy = .never
    config.timeoutIntervalForRequest = 30
    return URLSession(configuration: config)
  }()

  private let decoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let container = try decoder.singleValueContainer()
      let string = try container.decode(String.self)
      if let date = StashAPI.parseDate(string) { return date }
      throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date \(string)")
    }
    return decoder
  }()

  static func parseDate(_ string: String) -> Date? {
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = precise.date(from: string) { return date }
    let plain = ISO8601DateFormatter()
    return plain.date(from: string)
  }

  // MARK: Signing in

  private struct SignInResponse: Decodable {
    let authToken: String?
    let pendingEmailVerification: Bool?
  }

  /// Signs in with email and password through the server's route for apps.
  func signIn(email: String, password: String) async throws -> String {
    var request = URLRequest(url: StashConfig.server.appending(path: "api/mobile-auth/email-sign-in"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
    let (data, response) = try await urlSession.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    let body = try? decoder.decode(SignInResponse.self, from: data)
    if let token = body?.authToken, status == 200 { return token }
    if body?.pendingEmailVerification == true {
      throw StashError.server("This account's email address hasn't been verified yet.")
    }
    if status == 429 { throw StashError.server("Too many attempts. Wait a minute and try again.") }
    throw StashError.server("That email and password didn't work.")
  }

  // MARK: GraphQL

  private struct Envelope<T: Decodable>: Decodable {
    let data: T?
    let errors: [Message]?
    struct Message: Decodable { let message: String }
  }

  /// Runs a GraphQL query or mutation and decodes its `data`.
  func graphQL<T: Decodable>(_ query: String, variables: [String: Any] = [:]) async throws -> T {
    #if DEBUG
    if AppPreview.enabled { return try decoder.decode(T.self, from: await AppPreview.response(query, variables: variables)) }
    #endif
    guard let token else { throw StashError.signedOut }
    var request = URLRequest(url: StashConfig.server.appending(path: "api/graphql"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(token, forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["query": query, "variables": variables])

    let (data, response) = try await urlSession.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401 || status == 403 {
      await MainActor.run { NotificationCenter.default.post(name: .stashSignedOut, object: nil) }
      throw StashError.signedOut
    }
    let envelope = try decoder.decode(Envelope<T>.self, from: data)
    if let result = envelope.data { return result }
    let message = envelope.errors?.first?.message ?? "Stash didn't answer (\(status))."
    if message.lowercased().contains("unauthorized") || message.contains("UNAUTHORIZED") {
      await MainActor.run { NotificationCenter.default.post(name: .stashSignedOut, object: nil) }
      throw StashError.signedOut
    }
    throw StashError.server(message)
  }

  /// For the reader bridge, which passes plain JSON through untouched.
  func graphQLJSON(_ query: String, variables: [String: Any]) async throws -> [String: Any] {
    #if DEBUG
    if AppPreview.enabled {
      let data = try await AppPreview.response(query, variables: variables)
      return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
    #endif
    guard let token else { throw StashError.signedOut }
    var request = URLRequest(url: StashConfig.server.appending(path: "api/graphql"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(token, forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["query": query, "variables": variables])
    let (data, _) = try await urlSession.data(for: request)
    let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    guard let result = json?["data"] as? [String: Any] else {
      let errors = json?["errors"] as? [[String: Any]]
      throw StashError.server(errors?.first?["message"] as? String ?? "Stash didn't answer.")
    }
    return result
  }
}

extension Notification.Name {
  static let stashSignedOut = Notification.Name("stashSignedOut")
}
