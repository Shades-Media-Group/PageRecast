# The command line

The `pagerecast` command captures pages without opening Chrome, which suits scripts, CI jobs and batches of pages. It runs the extension's capture engine in headless Chromium on your machine and writes the same `.recast` files. It also turns any capture into design tokens.

Nothing leaves your machine: the command loads the page you name and writes files, nothing else.

## Install

```bash
npm install -g pagerecast
```

You need Node 22 or later and a Chromium. PageRecast tries, in order: `--browser <path>`, the `PAGERECAST_BROWSER` environment variable, Playwright's Chromium (`npx playwright install chromium`), then Google Chrome.

From a clone of this repository, `yarn cli <command>` builds and runs the current source.

The same package is a library for scripts ([the API](api.md)), and AI agents can run it through [the MCP server](mcp.md).

## Capture

```bash
pagerecast capture https://example.com
pagerecast capture https://example.com --widths 1440,768,390 --theme both --out home.recast
pagerecast capture ./build/index.html --scope viewport
```

Each width and theme becomes one capture in the file, with a screenshot reference, exactly as from the extension. The options match the side panel:

- `--widths`: viewport widths from 240 to 3840, separated by commas. Widths under 600 use a phone's browser identity and a 844 px tall screen; wider ones a 900 px tall window.
- `--theme light`, `dark` or `both`: sets `prefers-color-scheme`. With `both`, the plugin can create colour variables with Light and Dark modes.
- `--scope page` or `viewport`: the whole page or the first screen. Picking an element needs the extension.
- `--language de-DE`: reloads the page once with that browser language.
- `--no-preload`, `--no-hide-overlays`, `--no-screenshot`: turn off scrolling for lazy content, hiding consent banners and the screenshot reference.
- `--hide ".chat-widget, .promo-bar"`: leave out every element matching these CSS selectors, such as chat bubbles or promotion bars.
- `--wait 2000`: wait this many milliseconds at each width before reading the page, for content that arrives late.
- `--max-height 10000`: cut full-page captures off at this height, for very long pages.

The command checks the file with the same decoder the plugin uses before writing it. Import it by dropping it on the plugin window.

Pages behind a login are easier with the extension, which captures your own signed-in tab. The command line starts a fresh browser with no cookies.

## Design tokens

```bash
pagerecast tokens home.recast --format md --out DESIGN.md
pagerecast tokens home.recast --format css --out tokens.css
pagerecast tokens https://example.com --format w3c --out tokens.json
```

Given a URL instead of a file, the page is captured first in both themes. Tokens are the values a page repeats:

- **Colours** from fills, text and borders, used at least twice and named by role: `text/01`, `surface/01`, `border/01`, most used first. These are the names the plugin gives its colour variables. When the file has light and dark captures, each colour's dark value is the colour the same elements wear in the dark capture.
- **Typography**: font, weight, size, line height and letter spacing, used at least twice, largest first, named by size and weight (`16-regular`, `32-bold`).
- **Spacing** from Auto Layout gaps and paddings, used at least twice, numbered from the smallest.
- **Radii** and **shadows**, numbered from the smallest. Pill radii become `radius-full`.

Type, spacing, radii and shadows are read from the light captures (or the dark ones when there are no light captures), at every width.

### Formats

**`md`** writes a short `DESIGN.md`: tables for the palette and the type scale, the spacing, radii and shadow scales, and usage rules. Put it at the root of a project so an AI coding tool builds new screens with the page's values instead of inventing them.

**`css`** writes custom properties:

```css
:root {
  color-scheme: light dark;
  --color-text-01: #1a1a1a;
  --font-16-regular: 400 16px/24px 'Helvetica', sans-serif;
  --space-1: 8px;
  --radius-1: 12px;
  --shadow-1: 0px 1px 3px 0px #0000001f;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text-01: #f0f0f0;
  }
}
```

Typography tokens are `font` shorthands; a non-zero letter spacing adds `--font-<name>-tracking`.

**`w3c`** writes [W3C Design Tokens Community Group](https://www.designtokens.org/) JSON in the 2025.10 format: colours as sRGB objects, dimensions as `{ "value", "unit" }`, and `typography` and `shadow` composites. The format has no themes yet, so PageRecast uses this convention:

- Each colour's `$value` is the default theme: light when the file has a light capture.
- Every colour lists all themes under `$extensions["md.shades.pagerecast"].modes`, for example `{ "light": {…}, "dark": {…} }`.
- The root's `$extensions["md.shades.pagerecast"]` names the `modes` and the `defaultMode`.
- Every token records how many elements use it as `uses`.
- A `normal` line height is written as `1.2`, because the format needs a number.

## Inspect a file

```bash
pagerecast info home.recast
```

Prints the page, when and how it was captured, a row per capture (size, scope, layer counts by type, screenshot) and the assets.
