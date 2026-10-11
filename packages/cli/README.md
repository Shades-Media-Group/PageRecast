# pagerecast

Capture any web page as a `.recast` file that the PageRecast Figma plugin turns into editable layers, and extract the design tokens a page uses, from the command line.

It runs the same capture engine as the PageRecast Chrome extension, in headless Chromium on your machine. Nothing is sent anywhere: no account, no server, no telemetry.

## Install

```bash
npm install -g pagerecast      # or run it once with: npx pagerecast
```

Needs Node 22 or later and a Chromium. PageRecast uses Playwright's Chromium if it is installed (`npx playwright install chromium`), then Google Chrome; `--browser <path>` or the `PAGERECAST_BROWSER` environment variable picks any other Chrome or Chromium.

## Capture a page

```bash
pagerecast capture https://example.com --widths 1440,390 --theme both
```

This writes `example.com.recast` with one capture per width and theme, each with a screenshot reference. Drop the file into the PageRecast plugin in Figma.

| Option                      | Default              | Meaning                                              |
| --------------------------- | -------------------- | ---------------------------------------------------- |
| `--widths 1440,390`         | `1440`               | Viewport widths, 240 to 3840. Under 600 is a phone.  |
| `--theme light\|dark\|both` | `light`              | The page's `prefers-color-scheme`                    |
| `--scope page\|viewport`    | `page`               | The whole page, or the first screen                  |
| `--language de-DE`          | browser default      | Load the page as a visitor with this language would  |
| `--out file.recast`         | named after the page | Where to write                                       |
| `--no-preload`              |                      | Skip scrolling through the page to load lazy content |
| `--no-hide-overlays`        |                      | Keep cookie and consent banners                      |
| `--no-screenshot`           |                      | Leave out the screenshot reference                   |
| `--browser <path>`          |                      | The Chrome or Chromium to run                        |

The URL can also be a local HTML file or a `file://` URL. Localhost and staging servers work as long as this machine can reach them.

## Extract design tokens

```bash
pagerecast tokens example.com.recast --format md --out DESIGN.md
pagerecast tokens https://example.com --format css --out tokens.css
```

From a URL, the page is captured first in light and dark (the capture options above apply). Formats:

- `md`: a concise `DESIGN.md` with the palette, type scale, spacing, radii, shadows and usage notes, written for AI coding tools to follow.
- `css`: custom properties on `:root`, with dark values in a `prefers-color-scheme: dark` block.
- `w3c`: W3C Design Tokens Community Group JSON. Light and dark values sit under `$extensions["md.shades.pagerecast"].modes`.

Colours are named like the variables the Figma plugin creates (`text/01`, `surface/01`, `border/01`), so a token file and a Figma import agree.

## Inspect a file

```bash
pagerecast info example.com.recast
```

Lists each capture with its size, scope, layer counts and screenshot, and the file's assets.

## Use it from code

```ts
import { capture, encode, tokens } from 'pagerecast'

const file = await capture('https://example.com', { widths: [1440, 390], theme: 'both' })
const bytes = await encode(file) // a .recast file
const designMd = tokens(file, 'md')
```

Typed, ES module only. The library guide lists every function and option: <https://github.com/Shades-Media-Group/PageRecast/blob/main/docs/guides/api.md>. For AI agents there is an MCP server, `pagerecast-mcp`.

## Licence

MIT. Free and open source. Built by Shades Media Group. Source and the `.recast` format: <https://github.com/Shades-Media-Group/PageRecast>.
