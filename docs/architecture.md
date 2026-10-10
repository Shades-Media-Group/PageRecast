# Architecture

```
Chrome tab ──► extension side panel
                 │ Chrome DevTools Protocol (chrome.debugger)
                 │  · Emulation: width, mobile identity, colour scheme, language
                 │  · Runtime.evaluate: the capture engine runs in the page
                 │  · Page: screenshots, cached resources
                 ▼
             .recast capture  ── copy ─► clipboard ─► Figma plugin UI
                              ── save ─► file      ─►   │ decodes, prepares images
                                                       ▼
                                                  plugin main thread
                                                  builds frames, text, vectors,
                                                  images, Auto Layout, variables
```

## Packages

- **`packages/scene`**: the format both apps share, its types and codec.
- **`packages/capture`**: the engine that turns a rendered page into a scene. It runs in the captured tab, and inside a script-free iframe in the plugin for HTML import, so both paths produce the same output.
  - `prepare` materialises `::before` and `::after` as real elements, hides consent banners and settles animations.
  - `walk` reads computed styles and geometry, keeps inline formatting as text runs, serialises SVG with resolved styles, records flex layout and orders children by paint order.
  - `assemble` merges captures and deduplicates assets.
- **`packages/ui`** and **`packages/icons`**: the shared interface.

## Why the DevTools Protocol

Emulating a width, a phone, a colour scheme or a language needs the browser's own emulation. Attaching through `chrome.debugger` also lets the engine run without host permissions and read images from the page cache, which is what makes pages behind a login import correctly. Chrome shows a notice while it is attached; the extension detaches as soon as a capture ends.

## Import fidelity

The plugin keeps Auto Layout only when every child lands within 1.5 px of where the page put it; otherwise the frame stays freely positioned. Fonts resolve through each CSS font stack. Images larger than 4096 px are scaled down, and screenshots are cut into strips so they keep full detail.

## Tests

- Unit tests (Vitest) cover the CSS parsers, gradient and rotation maths, font matching, the codec and the icon set.
- Playwright runs the capture engine on a fixture page in Chromium, and loads the built extension to capture a page at two widths from the side panel.
