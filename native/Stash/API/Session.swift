import Foundation
import Security
import Observation

/// Who's signed in. The token lives in the Keychain, so you stay signed in between launches.
@MainActor
@Observable
final class Session {
  private(set) var isSignedIn: Bool
  private(set) var viewer: Viewer?

  private static let tokenKey = "authToken"

  init() {
    #if DEBUG
    if AppPreview.enabled { isSignedIn = true; return }
    #endif
    let token = Keychain.read(Self.tokenKey)
    StashAPI.shared.token = token
    isSignedIn = token != nil
    NotificationCenter.default.addObserver(forName: .stashSignedOut, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.signOut() }
    }
  }

  func signIn(email: String, password: String) async throws {
    #if DEBUG
    if AppPreview.enabled { isSignedIn = true; await loadViewer(); return }
    #endif
    let token = try await StashAPI.shared.signIn(email: email, password: password)
    Keychain.write(token, for: Self.tokenKey)
    StashAPI.shared.token = token
    isSignedIn = true
    await loadViewer()
  }

  func loadViewer() async {
    guard isSignedIn else { return }
    viewer = try? await Library.viewer()
  }

  func signOut() {
    #if DEBUG
    if AppPreview.enabled { viewer = nil; isSignedIn = false; return }
    #endif
    Keychain.write(nil, for: Self.tokenKey)
    StashAPI.shared.token = nil
    viewer = nil
    isSignedIn = false
  }
}

/// Where the sign-in token lives. On Mac it's kept in the same kind of keychain iPhone uses,
/// which belongs to the app itself, so a new build from Xcode reads it without asking for your
/// Mac password. (The older Mac login keychain asks again whenever the app's signature changes.)
enum Keychain {
  private static let service = "com.nigeldunckley.stash"

  static func read(_ account: String) -> String? {
    if let value = read(account, modern: true) { return value }
    #if os(macOS)
    // Signed in before the move: bring the token across once, then clear the old copy.
    if let value = read(account, modern: false) {
      if add(value, for: account, modern: true) { delete(account, modern: false) }
      return value
    }
    #endif
    return nil
  }

  static func write(_ value: String?, for account: String) {
    delete(account, modern: true)
    #if os(macOS)
    delete(account, modern: false)
    #endif
    guard let value else { return }
    #if os(macOS)
    // A build without a team can't use the app's own keychain; keep it in the old one then.
    if !add(value, for: account, modern: true) { _ = add(value, for: account, modern: false) }
    #else
    _ = add(value, for: account, modern: true)
    #endif
  }

  private static func base(_ account: String, modern: Bool) -> [String: Any] {
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    #if os(macOS)
    query[kSecUseDataProtectionKeychain as String] = modern
    #endif
    return query
  }

  private static func read(_ account: String, modern: Bool) -> String? {
    var query = base(account, modern: modern)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  @discardableResult
  private static func add(_ value: String, for account: String, modern: Bool) -> Bool {
    var item = base(account, modern: modern)
    item[kSecValueData as String] = Data(value.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
  }

  private static func delete(_ account: String, modern: Bool) {
    SecItemDelete(base(account, modern: modern) as CFDictionary)
  }
}
