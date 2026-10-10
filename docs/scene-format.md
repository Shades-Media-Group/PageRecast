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
| `image`  | `asset`, `fit` (`fill`, `fit`, `crop`, `tile`), `radius`                                                                                                              |
| `svg`    | `asset` pointing to SVG markup with styles resolved                                                                                                                   |
| `raster` | `asset` with a snapshot, and `reason`: canvas, video, iframe, icon font or form control                                                                               |

Paints are `solid`, `linear` (CSS angle), `radial` (normalised centre and radii), `conic` (start angle and centre) or `image`.

## Assets

`assets` maps ids to either `{ "kind": "image", "mime", "width", "height", "data" }` (base64) or `{ "kind": "image", "url" }` for images the plugin should download, or `{ "kind": "svg", "markup" }`.

## Compatibility

New optional fields can be added in a minor release. Removing or changing the meaning of a field raises the format `version` and needs a major release.
