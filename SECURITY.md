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

- Captures are made and stored on your computer. There is no PageRecast server and no analytics.
- The extension uses Chrome's `debugger` permission only while a capture runs, on the tab you capture, and detaches as soon as it finishes.
- The Figma plugin's only network use is downloading images a capture references.

See [PRIVACY.md](PRIVACY.md) for the full policy.
