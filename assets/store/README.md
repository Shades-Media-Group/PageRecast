# Store and README images

Every image here, plus `assets/brand/readme-banner-*.png` and `assets/brand/social-preview.png`, is rendered by `node scripts/store-assets.mjs` from real screenshots in `source/`:

- `source/ext-*.png`: the PageRecast side panel, built from this repository, capturing the PageRecast website in Chromium.
- `source/plugin-*.png`: the PageRecast plugin interface, built from this repository, reviewing and importing that same capture. The import report numbers in `plugin-done-*.png` are illustrative.

The script uses the `ext-*` and `plugin-*` shots only. Nothing in these images is generated artwork; regenerate them after interface changes.
