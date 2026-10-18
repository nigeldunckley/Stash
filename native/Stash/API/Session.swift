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
    let token = Keychain.read(Self.tokenKey)
    StashAPI.shared.token = token
    isSignedIn = token != nil
    NotificationCenter.default.addObserver(forName: .stashSignedOut, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.signOut() }
    }
  }

  func signIn(email: String, password: String) async throws {
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
    Keychain.write(nil, for: Self.tokenKey)
    StashAPI.shared.token = nil
    viewer = nil
    isSignedIn = false
  }
}

enum Keychain {
  private static let service = "com.nigeldunckley.stash"

  static func read(_ account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func write(_ value: String?, for account: String) {
    let match: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(match as CFDictionary)
    guard let value else { return }
    var item = match
    item[kSecValueData as String] = Data(value.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(item as CFDictionary, nil)
  }
}
