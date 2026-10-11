# Changelog

All notable changes to PageRecast are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Added

- `pagerecast-mcp`, an MCP server for AI agents (Claude Code, Claude Desktop, Codex CLI, Cursor and others) with the tools `capture_page`, `page_design_tokens`, `recast_info` and `send_to_figma`, and the `.recast` specification as a resource. It runs locally over stdio.
- A local bridge on `127.0.0.1` that holds captures for the Figma plugin, guarded by a per-session pairing code, with its protocol documented for the plugin.
- The `pagerecast` package is now also a library with types: `capture`, `encode`, `decode`, `tokens` and `info`.
- `PAGERECAST_BROWSER` picks the Chrome or Chromium the command line, the library and the MCP server run.

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

[Unreleased]: https://github.com/Shades-Media-Group/PageRecast/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Shades-Media-Group/PageRecast/releases/tag/v1.0.0
