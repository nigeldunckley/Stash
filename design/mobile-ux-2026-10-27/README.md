# Stash mobile redesign

Approved iPhone and iPad concepts for Home, Read, and Watch are in `mockups/`.
They are visual direction, not app assets; the native UI keeps the existing Stash
typography, colours, content models, and light/dark appearance support.

The implementation uses the available window width for Home, article-list splits,
the optional reader inspector, Watch grids, and the player context rail. iPad keeps
its sidebar destinations when its window narrows; iPhone keeps four main tabs.
The iPhone Home uses a continuation carousel and editorial lead, the reader adds
reachable bottom controls, and Watch keeps a stable stage above its context.

Run `native/scripts/test-native.sh` and build the `Stash` scheme for iPhone and iPad
simulators to check changes. Launch a Debug build with `--preview` for isolated
fixture content without signing in.
