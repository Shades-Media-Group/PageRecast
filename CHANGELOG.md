# Changelog

All notable changes to PageRecast are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). See [docs/releasing.md](docs/releasing.md).

## [Unreleased]

## [1.0.0] - 2026-10-10

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
