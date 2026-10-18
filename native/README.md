# Stash for iPhone and Mac

A native SwiftUI app for Stash. One Xcode project builds both the iPhone and the Mac app.
It signs in to https://stash.nigeldunckley.com with your usual email and password.

## Run it

1. Double-click `Stash.xcodeproj` to open it in Xcode.
2. Click **Stash** at the top of the left-hand list, then the **Signing & Capabilities** tab.
   Under **Team**, choose your name (Personal Team). If your name isn't there, choose
   **Add an Account…** and sign in with your Apple ID.
3. Choose where to run it from the device menu at the top of the window:
   - **My Mac** for the Mac app.
   - Your **iPhone**, plugged in by cable (or on the same Wi-Fi once it has been plugged in once).
4. Press **Run** (the ▶ button, or ⌘R).

The first time on iPhone:
- Turn on **Developer Mode**: Settings › Privacy & Security › Developer Mode, then restart the phone.
- After installing, open Settings › General › VPN & Device Management, tap your Apple ID and tap **Trust**.

## Free Apple account limits

- On iPhone the app stops opening after 7 days. Plug the phone in and press Run again to renew it.
- No TestFlight or App Store, and at most 3 free-account apps on the phone at once.
- These go away once the paid developer account is set up: choose the new team under Signing and run again.

## What's in it

- Sign in, kept in the Keychain so you stay signed in.
- **Feeds**: unseen or all posts, filter by feed, swipe right to save, swipe left to archive,
  mark all as seen. On Mac: Delete archives, S saves, Return opens the original.
- **Saved** and **Archive**: search, add a link (⌘N), archive, delete.
- **Reader**: the same reader and highlighting as the website, with text size and font,
  share and open original. Highlights and reading position sync with the web app.
- **Watch**: Channels (new or all videos, filter by channel or collection), Saved videos
  (in the order you set on the web) and each collection in the Mac sidebar. The player has
  speed remembered per channel, ±10 seconds (← and → on Mac, Space to pause), Up next with
  autoplay, a transcript that follows along and seeks when tapped, and chapters.
  Your place is saved as you watch and videos count as watched at 90%, same as the web.
  On iPhone, Picture in Picture is in the video's full-screen controls, and sound
  keeps playing with the screen locked.

## For developers

- `Stash/API`: sign-in (`/api/mobile-auth/email-sign-in`) and GraphQL (`/api/graphql`,
  token in the `Authorization` header).
- `Stash/Reader/reader.js` is the web app's reader, built from `packages/appreader`:
  `cd packages/appreader && yarn build-stash-app` (after `yarn install` at the repo root).
  Rebuild it when the web reader changes.
- The project uses Xcode 16's folder sync: new files in `Stash/` are picked up automatically.
