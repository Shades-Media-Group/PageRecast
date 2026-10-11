# Changelog

All notable changes to PageRecast are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Added

- **Website languages:** Italian, Turkish, Hindi, Japanese and Traditional Chinese, for eleven in all.
- **Display and accessibility panel on the website:** a 20 px dot in the corner opens it. Readers choose light, dark or the system theme, and can turn on larger text, more contrast, reduced motion, underlined links and easier reading.
  - Choices stay in the browser.
  - A one-time notice says the site sets no cookies.

## [1.2.0] - 2026-10-11

PageRecast now speaks English, French, Romanian, Russian, Spanish and Chinese.

### Added

- **Six languages** in the extension and the Figma plugin. The interface follows your browser or Figma language, or pick one under Interface language in settings.
- **Localised store listings:** the extension's name, summary and shortcuts appear in your language.

### Changed

- Russian uses Inter for Cyrillic, and Chinese uses the system CJK font, so every language renders in a matching typeface.
- Labels and buttons make room for longer translations.

## [1.1.1] - 2026-10-11

### Fixed

- The Figma plugin manifest lists only `"*"` under network access. Figma rejected 1.1.0's manifest, which also listed the local bridge separately.

## [1.1.0] - 2026-10-11

PageRecast now captures interaction states, builds components and design
systems in Figma, runs in Firefox, and works from the command line and from AI
agents. Still free, open source and local.

### Added

- **Figma plugin:** tabs for Web, Extension, File, Code, MCP and API. Import a page by URL through the extension, or let agents send captures over a local bridge.
- **Interaction states:** hover, focus and active styles become component variants.
- **Components:** repeated cards, rows and buttons become one component with instances.
- **Your library first:** colours, text styles, spacing and radii match the variables and styles already in the file or its team libraries before anything new is created.
- **Spacing and radius variables**, bound to Auto Layout gaps, paddings and corner radii.
- **Update an earlier import** in place instead of adding a copy.
- **Missing fonts:** see every font Figma lacks before importing, choose its replacement, get the font and check again.
- **Every option per import**, with an option to remember it for the site.
- **More files:** several at once, zipped site folders, `.mhtml` pages and `.eml` emails.
- **Extension:** right-click capture, `Alt+Shift+C`, per-site settings, a tray to copy several captures as one, a list of URLs in one go, hide by CSS selector, wait before capture and a maximum page height.
- **Firefox** version of the extension.
- **Real thumbnails** of every captured width in the extension, and a large frame preview in the plugin.
- **Command line and library:** `pagerecast capture`, `tokens` and `info`, and the same as a typed API.
- **Design tokens** as W3C JSON, CSS variables or a `DESIGN.md` for coding agents.
- **`pagerecast-mcp`:** an MCP server for Claude Code, Claude Desktop, Codex CLI and Cursor.
- A one-time rating request after the fifth import, a gallery of ready captures, and a privacy page on the website.

### Fixed

- Frames keep their size when Auto Layout is applied.
- WebP and AVIF images import instead of showing placeholders.
- Light and dark colours import on Figma plans that allow one mode per collection.
- Variable web fonts such as "Inter Variable" match the installed family.
- Off-centre image crops are kept.

### Changed

- Listing names now say what PageRecast does: "Website to Figma, HTML to design" and "Import websites to Figma (HTML, CSS, web to design)".
- The panels follow one grid, with header actions instead of a toolbar.

## [1.0.0] - 2026-10-11

The first public release: a Chrome extension that captures pages and a Figma
plugin that rebuilds them as editable layers. Free, open source and local.

### Added

- Capture the full page, the visible area or one picked element, including pages behind a login, staging and localhost.
- Capture several widths at once (desktop, laptop, tablet, mobile or any custom width) in light, dark or both.
- Capture in another language, and capture any URL without opening it first.
- Hide cookie banners, load lazy content and freeze animations before capturing.
- Copy a capture for Figma or save it as a `.recast` file; recent captures are kept on the device.
- Rebuild frames, text with every inline style, images, SVG vectors, gradients, borders, radii, shadows, blur and rotation in Figma.
- Turn flex layouts into Auto Layout where the result matches the page.
- Create colour variables with Light and Dark modes, text styles, or reuse the styles already in the file.
- Match fonts through each CSS font stack and report every substitution.
- Import `.html` files and pasted HTML and CSS without the extension.
- Remember import options per site, with defaults for new sites.
- Place a locked screenshot beside each frame for comparison.

[Unreleased]: https://github.com/Shades-Media-Group/PageRecast/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/Shades-Media-Group/PageRecast/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Shades-Media-Group/PageRecast/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Shades-Media-Group/PageRecast/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Shades-Media-Group/PageRecast/releases/tag/v1.0.0
