import SwiftUI

struct YouTubeConnectionStatus: Decodable {
  let configured: Bool
  let connected: Bool
  let channelTitle: String?
  let lastSyncedAt: Date?
  let importedChannels: Int
  let syncing: Bool
  let authorizing: Bool
  let error: String?
}

/// One server connection for native and web; credentials never enter the app.
struct YouTubeConnectionView: View {
  var onChange: () -> Void = {}
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @State private var status: YouTubeConnectionStatus?
  @State private var error: String?
  @State private var busy = false
  @State private var confirming = false
  @State private var notice: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("YouTube").font(.stSection).foregroundStyle(Color.stInk)
      if let status {
        if !status.configured {
          Text("Your server needs YouTube API credentials before you can connect. See Stash’s YouTube setup guide.")
        } else {
          Text(status.connected ? "Connected as \(status.channelTitle ?? "your YouTube channel"). \(status.importedChannels) imported channels." : "Bring your YouTube subscriptions into Watch. New subscriptions and uploads arrive automatically.")
          if let date = status.lastSyncedAt { Text("Last synced \(date.formatted(date: .abbreviated, time: .shortened)).") }
          if status.syncing || status.authorizing { Text(status.authorizing ? "Waiting for Google authorization…" : "Syncing your subscriptions…") }
          if let message = status.error { Text(message).foregroundStyle(Color.stInk).accessibilityAddTraits(.updatesFrequently) }
          HStack(spacing: 16) {
            if status.connected {
              Button("Sync now") { run("sync") }.disabled(status.syncing)
              Button("Disconnect", role: .destructive) { confirming = true }
            } else {
              Button(status.error == nil ? "Connect YouTube" : "Reconnect YouTube") { run("connect") }
                .disabled(status.authorizing)
            }
            if busy { ProgressView().controlSize(.small) }
          }
          .buttonStyle(.text)
          .disabled(busy)
        }
      } else if error == nil {
        ProgressView().controlSize(.small).accessibilityLabel("Checking YouTube connection")
      }
      if let error {
        Text(error).foregroundStyle(Color.stInk)
        Button("Try again") { Task { await load() } }.buttonStyle(.text)
      }
      if let notice { Text(notice).foregroundStyle(Color.stInk) }
      Text("Read-only access. Following here never changes YouTube. Watch Later and YouTube watch history are unavailable. Captions are in the YouTube player.")
      Text("The old Shorts setting is now an optional duration filter in each channel’s settings.")
      Button("YouTube privacy and data") { openURL(StashConfig.server.appending(path: "settings/youtube-privacy")) }.buttonStyle(.text)
    }
    .font(.stSmall)
    .foregroundStyle(Color.stMuted)
    .frame(maxWidth: .infinity, alignment: .leading)
    .task {
      await load()
      while !Task.isCancelled {
        do { try await Task.sleep(for: .seconds(15)) } catch { return }
        if scenePhase == .active { await load() }
      }
    }
    .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
    .confirmationDialog("Disconnect YouTube?", isPresented: $confirming, titleVisibility: .visible) {
      Button("Disconnect YouTube", role: .destructive) { run("disconnect") }
    } message: {
      Text("Stops imported channel follows and removes your YouTube connection data. Saved videos, notes and Stash watching progress remain.")
    }
  }

  private func load() async {
    do {
      let next: YouTubeConnectionStatus = try await StashAPI.shared.youtube("status")
      if next.lastSyncedAt != status?.lastSyncedAt || next.connected != status?.connected { LibraryChanges.shared.publish(); onChange() }
      status = next
      error = nil
    } catch { self.error = error.localizedDescription }
  }

  private func run(_ action: String) {
    busy = true
    error = nil
    Task {
      defer { busy = false }
      do {
        if action == "connect" {
          struct Result: Decodable { let authorizationUrl: URL }
          let result: Result = try await StashAPI.shared.youtube("connect", post: true)
          openURL(result.authorizationUrl)
          notice = "Finish connecting in your browser, then return to Stash."
        } else {
          struct Result: Decodable { let queued: Bool?; let disconnected: Bool? }
          let _: Result = try await StashAPI.shared.youtube(action, post: true)
          notice = action == "sync" ? "Sync requested. Your channels will update shortly." : "YouTube disconnected. Your saved videos remain in Stash."
          LibraryChanges.shared.publish()
        }
        await load()
      } catch { self.error = error.localizedDescription }
    }
  }
}
