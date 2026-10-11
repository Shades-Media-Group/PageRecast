# The API

The `pagerecast` package is also a library. Scripts, build steps and other tools can capture pages, read and write `.recast` files and extract design tokens with the same code the [command line](cli.md) runs. Everything happens on your machine: the library opens the page you name in a local headless Chromium and returns data, nothing else.

## Install

```bash
npm install pagerecast
```

It is an ES module for Node 22 or later, with TypeScript types included. Capturing needs a Chromium, found the same way as the command line: the `browser` option, then the `PAGERECAST_BROWSER` environment variable, then Playwright's Chromium (`npx playwright install chromium`), then Google Chrome.

## Example

```ts
import { writeFile } from 'node:fs/promises'
import { capture, encode, info, tokens } from 'pagerecast'

const file = await capture('https://example.com', { widths: [1440, 390], theme: 'both' })
await writeFile('example.recast', await encode(file)) // drop this on the Figma plugin
await writeFile('DESIGN.md', tokens(file, 'md'))

for (const c of info(file).captures) console.log(c.label, c.layers)
```

## Functions

### `capture(url, options?): Promise<RecastFile>`

Opens `url` in headless Chromium and captures it like the extension: one capture per width and theme, each with a screenshot reference. `url` is an http(s) URL, a bare host such as `example.com`, a `file://` URL or a path to a local HTML file.

| Option         | Default         | Meaning                                                         |
| -------------- | --------------- | --------------------------------------------------------------- |
| `widths`       | `[1440]`        | Viewport widths, 240 to 3840. Under 600 captures as a phone.    |
| `theme`        | `'light'`       | `'light'`, `'dark'` or `'both'` (`prefers-color-scheme`)        |
| `scope`        | `'page'`        | `'page'` for the whole page, `'viewport'` for the first screen  |
| `language`     | browser default | A BCP 47 tag such as `'de-DE'`                                  |
| `waitMs`       | `0`             | Wait at each width before reading the page, up to 60000 ms      |
| `hide`         | `[]`            | CSS selectors of elements to leave out, such as `['.chat']`     |
| `maxHeight`    | `0`             | Cut full-page captures off at this height in px; 0 for no limit |
| `preload`      | `true`          | Scroll through the page to load lazy content first              |
| `hideOverlays` | `true`          | Hide cookie and consent banners                                 |
| `screenshot`   | `true`          | Add a screenshot reference to each capture                      |
| `browser`      | see Install     | Path to the Chrome or Chromium to run                           |
| `onProgress`   |                 | `(label: string) => void`, called as the capture moves on       |

The browser starts fresh, without cookies, so pages behind a login show their logged-out state. The extension captures your own signed-in tab instead.

### `encode(file): Promise<Uint8Array>`

The bytes of a `.recast` file: gzip-compressed JSON, the format the plugin opens.

### `decode(input): Promise<RecastFile>`

Reads `.recast` bytes, plain JSON text or a clipboard payload (`pagerecast:1:…`) and checks it with the plugin's own decoder. Throws with a readable message when the input is not a capture or comes from a newer format version.

### `tokens(file, format?): string`

The design tokens the capture repeats, as text. `format` is `'md'` (default, a `DESIGN.md` for AI coding tools), `'css'` (custom properties) or `'w3c'` (W3C Design Tokens JSON). The [command line guide](cli.md#design-tokens) describes what each token is and how colours are named. Light and dark values pair up when the file has both themes, so capture with `theme: 'both'` for themed tokens.

### `info(file): RecastInfo`

A summary: `title`, `url`, `capturedAt`, `generator`, `assets` counts, and per capture its `label`, `width`, `height`, `theme`, `scope`, `screenshot`, and layer counts (`layers`, `frames`, `text`, `images`, `svg`, `raster`).

### Helpers

- `toUrl(input)`: what `capture` does with its first argument: keeps URLs, turns paths to local files into `file://` URLs and bare hosts into `https://`.
- `recastFileName(url)`: a file name for a capture, such as `example.com.recast`.

## Types and errors

The package exports `RecastFile` and the scene types (`Capture`, `SceneNode`, `Asset`, `Viewport`, `Theme`, `Scope`), plus `CaptureOptions`, `RecastInfo`, `CaptureSummary` and `TokenFormat`. The [`.recast` format](../scene-format.md) documents every field.

An option outside its range throws `OptionError`, whose message names the option and the allowed values. A page that does not load rejects with the browser's error, such as `net::ERR_NAME_NOT_RESOLVED`.

## For AI agents

Agents that speak the Model Context Protocol can use these functions as tools through [the MCP server](mcp.md).
