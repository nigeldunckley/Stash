# Stash logo

The folded reading slip forms an S, with a bookmark notch at its lower end. It connects the name to saving articles and returning to them later.

The logo preserves Stash's International Orange (`#FF4F00`), near-black (`#09090B`), rounded app mark and contemporary sans-serif lettering. The existing interface uses Geist.

`stash-logo-concept.png` is the original generated design concept. The production mark is a clean vector interpretation of its folded S and bookmark geometry; the app wordmark uses the project's own Geist font.

`stash-logo-legibility-concept.png` is the image-generated reference for the heavier lower sweep. The production vector widens that sweep so its black edge survives at small app-icon and favicon sizes while retaining the orange triangular counter and bookmark notch.

The shared web logo component now uses this mark throughout navigation, sign-in and other logo placements. The landing logo, browser favicons, Apple touch icons and PWA icons use the same geometry. Maskable icons keep the symbol inside their safe zone, and dark backgrounds use a light wordmark.

Production assets are in `packages/web/public/static/brand/`: `stash-mark.svg`, `stash-logo.svg` and `stash-logo-light.svg`. The standalone wordmarks embed the project's OFL-licensed Geist font. Its license is in `packages/web/public/static/fonts/Geist/OFL.txt`.

The canonical geometry is `packages/web/components/elements/images/StashBrand.ts`. After changing it, run `node packages/web/scripts/generate-stash-brand.cjs` from the repository root with the web package's dependencies installed. The script regenerates the public assets and icons. Native iOS/Android clients and browser extension packages are outside this web branding update.

Generated using the built-in image generation tool. The complete generation prompt is in `generation-prompt.txt`.
