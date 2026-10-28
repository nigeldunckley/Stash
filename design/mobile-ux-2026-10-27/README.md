# Stash mobile redesign

Approved iPhone and iPad concepts for Home, Read, and Watch are in `mockups/`.
They are visual direction, not app assets; the native UI keeps the existing Stash
typography, colours, content models, and light/dark appearance support. iOS now
defaults to the approved dark appearance; Settings can switch to Light or System.

The implementation uses the available window width for Home, article-list splits,
the optional reader inspector, Watch grids, and the player context rail. iPad keeps
its sidebar destinations when its window narrows; iPhone keeps four main tabs.
The iPhone Home uses a compact continuation row and editorial lead, the reader adds
reachable bottom controls, and Watch keeps a stable stage above its context. A
full-width iPad window shows a persistent sidebar and two-column Home composition;
a narrow iPad window uses a destination menu without replacing the current page.
Mockup photography and copy are illustrative: the app uses each item's actual image
and text, or a typographic cover when an image is unavailable.

Run `native/scripts/test-native.sh` and build the `Stash` scheme for iPhone and iPad
simulators to check changes. Launch a Debug build with `--preview` for isolated
fixture content without signing in.
