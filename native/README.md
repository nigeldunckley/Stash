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

- **Home** puts unfinished articles and videos first, followed by a short view of new posts,
  new videos and unread saves. The Edition has a smaller link while the issue is available.
- **Read** has Feeds and Saved, with Highlights, Discover, Archive and The Edition under More
  on iPhone. **Watch** has Latest and Saved, with a separate menu for collections. Home, Read,
  Watch and Settings keep their places in the iPhone tab bar.
- **Saved** supports All, Unread and In progress, plus search. Add link opens the same save
  form throughout the app. Failed saves keep the address; accepted links show when the
  article is being prepared.
- **Reader** has font, text size and line width controls, Share, Open original and the item's
  actions. On Mac, the list and reader share a resizable split once the content area reaches
  800 points. Drag the divider or use its accessibility adjustment. Smaller windows show
  the list or reader individually. Focus hides the list and sidebar without reloading the page.
- **Feeds** keeps Unseen/All and the source filter visible. More contains Cards/Wire,
  Sort through feeds and Mark all seen. Mark all seen waits five seconds before sending,
  so Undo cancels it during that interval; the server has no bulk operation to make posts unseen.
- **Discover** shows new suggestions first. Expired trials are grouped below them, with
  Keep and Stop following actions. Suggestions retain their source explanations.
- **Watch** keeps the player, position and current queue when moving between the full player,
  mini player, floating window and Picture in Picture. Up next can be reordered for the current
  session. It advances through the queue once and stops at the end. Failed position saves
  remain queued for retry. Transcript, chapters and speed per channel remain available.
- Sign-in stays in the Keychain. Articles, highlights and reading/watching positions use the
  existing server. Successful changes refresh other library views without resetting navigation.

## Motion and accessibility

Native iPhone navigation uses the system transition. Mac article changes fade over 150ms;
list changes take 200ms, Focus and sidebar changes 250ms, and player changes 300ms.
Save feedback lasts 280ms, with no rotation or blur trail. Archive removes the row and briefly
marks its destination. Reduce Motion uses fades and disables repeating loading effects.

iPhone controls have at least a 44-point target. Reader text follows Dynamic Type as well as
its own text-size setting. Rows expose selection to VoiceOver; errors have retry controls,
and feedback with Undo stays visible while VoiceOver is running.

Useful Mac shortcuts: ⌘N adds a link, ⌘+ / ⌘− changes reader text size, ⌥⌘F toggles Focus,
and Esc leaves Focus. Feeds and Saved retain their existing arrow-key navigation and item actions.

## For developers

- `Stash/API`: sign-in (`/api/mobile-auth/email-sign-in`) and GraphQL (`/api/graphql`,
  token in the `Authorization` header).
- `Stash/Reader/reader.js` is the web app's reader, built from `packages/appreader`:
  `cd packages/appreader && yarn build-stash-app` (after `yarn install` at the repo root).
  Rebuild it when the web reader changes.
- `Stash/API/Edition.swift` is a port of the web's `lib/edition` (schedule and ranking).
  Keep the two in step if either changes; both store issues in personalization `edition`.
- The project uses Xcode 16's folder sync: new files in `Stash/` are picked up automatically.
- Look and feel: `Stash/Views/Theme.swift` holds the colours (`Color.st…`, copied from the
  web's `stitches.config.ts`), the type scale and corner radii. Shared pieces (rows, the
  segmented control, text buttons, the capture field, empty boxes, counts and headings) are
  in `Stash/Views/Components`. Use these rather than system fonts or controls.
- `Stash/Fonts` has Geist, Geist Mono and Newsreader (SIL OFL, licences alongside), cut to
  static weights from the web's variable fonts and registered at launch by `StashFonts`.

## Checks and isolated preview

Run `native/scripts/test-native.sh` from the repository. It compiles the production list,
queue and save-form logic into a standalone test harness, then checks the reader's JavaScript
request/reply bridge. It needs Swift and Node and does not contact the server.

For a Mac visual preview without signing in, build Debug with a separate bundle identifier
and the `STASH_PREVIEW` compilation condition:

```sh
xcodebuild -project native/Stash.xcodeproj -scheme Stash -configuration Debug \
  -destination 'platform=macOS' -derivedDataPath /tmp/stash-preview \
  PRODUCT_BUNDLE_IDENTIFIER=com.nigeldunckley.stash.preview PRODUCT_NAME='Stash Preview' \
  'SWIFT_ACTIVE_COMPILATION_CONDITIONS=DEBUG STASH_PREVIEW' CODE_SIGNING_ALLOWED=NO build
codesign --force --deep --sign - '/tmp/stash-preview/Build/Products/Debug/Stash Preview.app'
```

The Preview menu switches between minimum, compact and standard Mac window sizes.

The preview uses in-memory sample articles and intercepts native GraphQL requests locally. Unknown
operations fail locally. It does not read or update the personal library or the sign-in token.
The same fixture mode can be enabled with `--preview` in a Debug build. Release builds do not
include it. Use the normal bundle identifier and compilation conditions for the real app.

### Visual checks, 21 October 2026

Checked the isolated Mac preview at 640-point and 1,240-point window widths: Home,
compact sidebar navigation, Saved, split reader, Focus, font size and line width,
accessible divider adjustment, save validation/correction/success, archive and Undo,
and Feeds controls. Checked that Up next stops at the end, that returning to Watch
keeps the current video and position, and that expanding a paused video stays paused.

The iOS Simulator release target compiles. An iPhone runtime check is still needed:
the installed Xcode bundle does not contain Simulator.app. These checks used sample
library data, not the signed-in personal library.
