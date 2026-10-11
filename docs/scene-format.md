# The `.recast` format

A `.recast` file is gzip-compressed JSON. The same document, gzipped and base64-encoded behind the prefix `pagerecast:1:`, is what the extension puts on the clipboard. The plugin accepts both, plus plain JSON.

The TypeScript definition in [`packages/scene/src/types.ts`](../packages/scene/src/types.ts) is the authority; this page explains it.

## Top level

```json
{
  "format": "pagerecast/scene",
  "version": 1,
  "generator": { "name": "PageRecast", "version": "1.0.0", "surface": "extension" },
  "source": { "url": "https://example.com/", "title": "Example", "capturedAt": "2026-10-10T12:00:00.000Z" },
  "captures": [ … ],
  "assets": { … }
}
```

`version` is the format version, separate from the app version. A reader refuses files with a higher format version than it knows.

## Captures

One entry per width and theme.

| Field             | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `id`, `label`     | Identifier and a label such as `Desktop · 1440 · Light` |
| `viewport`        | `width`, `height`, `deviceScaleFactor`, `mobile`        |
| `theme`           | `light` or `dark`                                       |
| `scope`           | `page`, `viewport` or `element`                         |
| `width`, `height` | Size of what was captured                               |
| `root`            | The root frame node                                     |
| `screenshot`      | Asset id of a PNG of the same area, optional            |

## Nodes

Coordinates are CSS pixels relative to the capture's top-left. Colours are sRGB with channels from 0 to 1. Every node has `id`, `key` (a DOM path that matches across themes), `name`, `tag`, optional `html` (`div#hero.card`), `x`, `y`, `width`, `height`, and optional `opacity`, `blend`, `rotation` (degrees, clockwise) and `a11y`.

| Type     | Extra fields                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frame`  | `fills`, `stroke`, `radius` (TL, TR, BR, BL), `shadows`, `blur`, `backdropBlur`, `clips`, `position`, `layout` (flex), `grow`, `alignSelf`, `children` in paint order |
| `text`   | `runs` (text plus a full style each), `style` (the first run's), `align`, `lines`, `shadows`, `paint` for gradient text                                               |
| `image`  | `asset`, `fit` (`fill`, `fit`, `crop`, `tile`), `position`, `radius`                                                                                                  |
| `svg`    | `asset` pointing to SVG markup with styles resolved                                                                                                                   |
| `raster` | `asset` with a snapshot, and `reason`: canvas, video, iframe, icon font or form control                                                                               |

Paints are `solid`, `linear` (CSS angle), `radial` (normalised centre and radii), `conic` (start angle and centre) or `image`.

`position` is optional on `image` nodes and `image` paints. It records where a `fill` (CSS `cover`) or `fit` (CSS `contain`) image sits in its box, as CSS percentages over 1: `[0.5, 0]` is `object-position: 50% 0` (or `background-position: top` on a `cover` background). It is left out when the image is centred, `[0.5, 0.5]`, and a reader that ignores it draws the image centred. The plugin crops off-centre images so the same part of the image shows as on the page.

## Interaction states

When the capture runs with states on, a frame for an interactive element (`a[href]`, `button`, `input`, `select`, `textarea`, `summary`, roles `button`, `link` and `tab`, or `tabindex` of 0 or more) may carry `states`. It holds one entry per state that looks different: `hover`, `focus` (`:focus` and `:focus-visible`) and `active` (pressed, which also counts as hovered). Each entry maps the `key` of a node in the element's subtree, the element's own included, to the fields that change:

```json
"states": {
  "hover": {
    "html/body1/button1": { "fills": [{ "type": "solid", "color": { "r": 1, "g": 0, "b": 0, "a": 1 } }] },
    "html/body1/button1/#text": { "color": { "r": 1, "g": 1, "b": 1, "a": 1 }, "decoration": "underline" }
  },
  "focus": {
    "html/body1/button1": { "outline": { "width": 2, "offset": 2, "color": { "r": 0, "g": 0.5, "b": 0, "a": 1 }, "style": "solid" } }
  }
}
```

| Field                                              | Meaning                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `x`, `y`, `width`, `height`, `rotation`, `opacity` | Same meaning as on the node                                      |
| `fills`, `stroke`, `radius`, `shadows`             | Frames only; `null` for `stroke` or `radius` removes the default |
| `outline`                                          | `width`, `offset`, `color`, `style`, or `null` when it goes away |
| `color`, `decoration`                              | Text only; applies to every run                                  |

Only differences are recorded, and a state that changes nothing is left out. States come from the page's own stylesheets, so rules in cross-origin stylesheets and hover effects made with JavaScript are not seen. The Figma plugin turns each such element into a component set with a `State` property and places an instance of `State=Default` where the element was.

## Assets

`assets` maps ids to either `{ "kind": "image", "mime", "width", "height", "data" }` (base64) or `{ "kind": "image", "url" }` for images the plugin should download, or `{ "kind": "svg", "markup" }`.

## Font sources

`fontSources` is optional and maps a web font family to where the page loaded it from: the first `url()` of its `@font-face` rule, or the Google Fonts stylesheet that names it. Rules in cross-origin stylesheets cannot be read, so the map can be incomplete. The plugin uses it to send someone missing a font to the right place to get it.

```json
"fontSources": {
  "Space Grotesk": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700",
  "Söhne": "https://example.com/fonts/soehne-buch.woff2"
}
```

## Compatibility

New optional fields can be added in a minor release. Removing or changing the meaning of a field raises the format `version` and needs a major release.
