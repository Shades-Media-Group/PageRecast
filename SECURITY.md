# Security policy

## Supported versions

Security fixes go into the latest release of the Chrome extension and the Figma plugin. Both update automatically from their stores.

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a vulnerability

Please report security issues privately, not in public issues:

1. Open [a private security advisory](https://github.com/Shades-Media-Group/PageRecast/security/advisories/new), or
2. Email **security@shades.md**.

Include what you found, how to reproduce it, and the version from the extension or plugin footer. You'll get an answer within three working days. Once a fix ships we credit you in the release notes, unless you'd rather stay anonymous.

## How PageRecast handles your data

- Captures from the extension are made and stored on your computer. There are no accounts and no analytics.
- The plugin's Web tab sends only the page address you type, and the capture settings, to `pagerecast.shades.md/api/render`. That service refuses localhost and private addresses, opens the public page in Cloudflare Browser Rendering without cookies, and stores and logs nothing.
- The extension uses Chrome's `debugger` permission only while a capture runs, on the tab you capture, and detaches as soon as it finishes.
- Besides that service, the Figma plugin's network use is downloading images a capture references and, when agent imports are on, the bridge on `127.0.0.1`.

See [PRIVACY.md](PRIVACY.md) for the full policy.
