# Privacy policy

_Last updated: 11 October 2026_

PageRecast is a browser extension for Chrome and Firefox and a Figma plugin, made by Shades Media Group. This policy covers all of them.

## The short version

PageRecast does not collect, transmit, sell or share any personal data. Everything happens on your computer.

## What the Chrome extension accesses

- **The page you choose to capture.** When you press Capture, the extension reads the layout, styles, text and images of the current tab (or a URL you type) using Chrome's `debugger` permission. It attaches only for that capture and detaches when it ends.
- **Tab titles, addresses and icons**, to show which page will be captured.
- **Local storage on your device**, to keep your settings and recent captures. You can delete any capture from the panel; removing the extension deletes all of them.

The extension makes no requests to any server of ours. Images in a capture are read from your browser's cache or loaded the same way the page loads them.

## The Firefox extension

The Firefox version accesses the same things, but reads the page with Firefox's `tabs` and `scripting` permissions and access to all websites (`<all_urls>`) instead of the `debugger` permission. It uses that access only on the tab you capture, to read the page, take its screenshot and load its images. As in Chrome, nothing leaves your device.

## What the Figma plugin accesses

- **The capture you paste or open**, to build layers in the current Figma file.
- **Images referenced by a capture**, which it downloads directly from the websites they belong to.
- **Figma's plugin storage**, to remember your import settings.

## Data we receive

None. There are no accounts, analytics, crash reports or tracking of any kind.

## Children

PageRecast is a design tool and is not directed at children.

## Changes

Changes to this policy are published in this file and noted in the [changelog](CHANGELOG.md).

## Contact

support@shades.md · [Shades Media Group](https://shades.md)

This policy is also published at https://pagerecast.shades.md/privacy/.
