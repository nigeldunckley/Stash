# Stash — Home, Reader, Watch

Three interactive design studies for the native Mac, iPhone and iPad apps. These extend Stash’s existing folded-S mark, orange/zinc palette and Geist/Newsreader typography.

Open `index.html` in a browser. All fonts, images, styles and scripts are local; the standalone prototype needs no account, dependency installation or backend. Alternatively, from the repository root:

```sh
python3 -m http.server 8768 --bind 127.0.0.1 --directory design/concepts-2026-10-23
```

Then open <http://127.0.0.1:8768/>. Home, Reader and Watch are in the top review navigation. Use the device selector, appearance button, Compact/ Landscape control, and Reduce motion checkbox to compare treatments. The information button opens the design rationale and loading, empty, connection-error, larger-text and missing-image examples.

## The three proposals

- **Home:** continuation near the top, then an article and a video presented together as an editorial front page. Supporting stories, The Edition, and the channel shelf remain accessible. Open an article, resume the unfinished album piece, save for later, search, or explore the sample Edition.
- **Reader:** composed article typography, a contextual contents view, appearance controls, and Focus that expands the existing article surface. The ending offers Archive, Keep in Saved, and another article. Archive and Save offer Undo.
- **Watch:** a stable 16:9 stage, optional context, transcript search and timestamp seeking, explicit following, chapters, and an accessible reorderable queue. iPhone keeps video above its scrolling context. iPad uses a side panel in landscape and a panel below in portrait. Mac adds viewing Focus and its existing floating-player handoff.

Use `#home`, `#reader` or `#watch` for direct concept links. Query parameters support `device=mac|ipad|iphone`, `theme=dark|light`, and `layout=compact|landscape`. `capture=1` hides the review controls for clean screen exports.

## Interaction and motion

- Mac sidebar and reading-list changes: 250 ms. Viewing Focus: 300 ms. Feedback and contextual panels: 150–200 ms.
- Reading Focus changes the existing layout, keeping a visible article anchor in place. The video’s local time and play/pause state survive mini-player transitions.
- Reduce Motion respects both the review checkbox and the system preference. There is no decorative looping animation.
- Touch controls have a 44-point minimum height. Queue items support both dragging and explicit move buttons. Dialogs contain keyboard focus; Escape dismisses overlays before exiting Focus. Transcript tabs support arrow-key navigation.

## What is simulated

The content, publishers, bylines, dates, counts and transcript are illustrative fixtures. Titles are adapted from the native app’s existing sample library. Video playback is a local timer over a still image. Saving, archiving, queue changes and search affect only the current prototype session.

Native sharing, opening original URLs, Picture in Picture and the Mac floating window are explicitly described handoffs. The prototype does not claim to invoke native system UI or provider capabilities. It does not validate extraction quality, authenticated library data, synchronisation or network playback.

## Review outputs and verification

`screenshots/` contains nine primary dark screens, plus light Mac, landscape iPad and compact Mac variants. `home-board.png`, `reader-board.png` and `watch-board.png` compare platforms; `overview.png` shows the three Mac concepts.

Rendered browser checks cover all three concepts on Mac (1320×870), iPhone (402×874), portrait iPad (1024×1366), landscape iPad (1366×1024) and compact Mac (800×870). Checked archive/Undo, reading appearance, contents, Focus, transcript search/seek/Follow, queue reordering, mini-player position retention, save feedback, light appearance, reduced motion and the state previews. Browser console checks reported no script errors.

The Impeccable detector’s review-caption contrast findings were corrected. Its font warning is intentionally retained: Geist is Stash’s existing interface face. The neutral surround belongs to the review, not the app’s content palette. These are browser mockups, not signed native runtime validation.

`build-inline.py` packages the same prototype for the conversation renderer, with compressed embedded assets and host-provided Lucide icons. It takes the destination fragment path as its argument and requires `cwebp`. `inline-preview.html` is the generated conversation-renderer check; `index.html` is the dependency-free standalone version.

## Assets

Brand mark and fonts come from Stash. Font licences are included in `assets/`.

Illustrative photography was sourced from Unsplash:

| Local image | Image source |
| --- | --- |
| Coast | https://images.unsplash.com/photo-1518837695005-2083093ee35b |
| Architecture | https://images.unsplash.com/photo-1487958449943-2429e8be8625 |
| Studio | https://images.unsplash.com/photo-1598488035139-bdbb2231ce04 |
| Live music | https://images.unsplash.com/photo-1470225620780-dba8ba36b745 |
| Park | https://images.unsplash.com/photo-1441974231531-c6227db76b6e |
| Railway | https://images.unsplash.com/photo-1474487548417-781cb71495f3 |
| Cinema | https://images.unsplash.com/photo-1489599849927-2ee91cede3ba |
| Books | https://images.unsplash.com/photo-1507842217343-583bb7270b66 |

Platform direction follows [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials): content remains opaque and legible, with material treatment confined to functional chrome. Actual native materials and navigation transitions belong to the later SwiftUI implementation.
