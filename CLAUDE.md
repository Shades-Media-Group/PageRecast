# PageRecast: working notes for agents

PageRecast is a Chrome extension and a Figma plugin that turn web pages into editable Figma layers. It is free, open source and local-only. Product truth lives in [PRODUCT.md](PRODUCT.md); the panel design contract lives in `apps/figma-plugin/.impeccable/surfaces/`.

## Commands

```bash
yarn verify        # typecheck, lint, unit tests, build: run before every commit
yarn test:e2e      # Playwright: walker fixture and the real extension
node scripts/brand.mjs   # regenerate every logo file from one geometry
```

Use Node 22 (`.nvmrc`).

## Non-negotiables

- Free forever: no payments, plans, limits, accounts or upgrade prompts anywhere.
- Nothing leaves the user's machine. No analytics, no remote logging.
- In the product (both apps, store listings) the credit is "Free and open source. Built by Shades Media Group". The README credits Cristian Brinza.
- Never name or compare against other products in anything public: README, docs, UI, commits, listings.
- Conventional commits, one logical change each, no AI attribution lines.

## Design rules (the panels must read as hand-built, never templated)

The panels follow the grammar of Figma's own inspector with small pill controls:

- Full-bleed sections with hairline dividers, 32 px rows, text tabs. Keep each screen's structure; lift it, don't rebuild it.
- Type: 11 px labels and meta, 12 px body, titles and controls, 20 px only for a screen's one figure (the frames on the canvas). Weights 400 and 600.
- Pills: a segmented control is a pill track with a raised pill; several choices at once are pill chips, selected in ink (`Chips`). Radii: 999 pills, 8 inputs and code, 12 the stage, previews and drop zones.
- One red primary action per view, a pill with a soft red shadow (plain on dark, never a glow).
- The credit, version and source links close Settings only. Settings end with Reset all preferences (off at the defaults, two clicks). Saved settings are migrated, never dropped.

Never ship any of these. Each one is a known AI-generated tell:

- Skeleton illustrations: grey bars standing in for text, fake browser chrome with three dots, mock "app windows". Show real content (the actual capture, the actual tab) or nothing.
- Monospace for numbers, sizes or metadata. Numbers use tabular figures in the UI font (`.num`). Monospace is only for code the user typed.
- Icons decorating every row or list item. An icon must carry meaning (device type, file type) or go.
- Lists wrapped in rounded bordered cards, cards inside cards, tinted callout boxes.
- Eyebrow labels, small caps or tracked uppercase above headings; section numbers.
- Gradient text, glass, glow, decorative blur, hard offset shadows.
- An icon in a circle as the centrepiece of an empty state.
- Colour on inactive states. Red (`--red`) is only for the primary action and selection; rose only inside the logomark.
- Unicode glyphs or emoji as icons. Every icon comes from `packages/icons`, same grid and stroke.

Before committing any UI change: render both apps in light and dark (Playwright screenshots), run `impeccable detect` on the changed files, and look at the screenshots against this list.

## Versions and releases

The root `package.json` version is the only version. The extension manifest and both UIs read it at build time. See [docs/releasing.md](docs/releasing.md).
