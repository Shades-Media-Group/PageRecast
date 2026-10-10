# Troubleshooting

**"PageRecast can't capture this page."** Chrome doesn't let extensions read `chrome://` pages, other extensions' pages or the Chrome Web Store. Open the website itself.

**"Close DevTools on this tab, then capture again."** Chrome allows one debugger per tab. Close the DevTools window for that tab.

**Parts of the page are missing.** Turn on **Load lazy content** so PageRecast scrolls the page first. For content that appears on hover or click, open it before capturing.

**A cookie banner or pop-up is in the capture.** Turn on **Hide cookie banners**, or close the pop-up yourself before capturing.

**Text wraps differently in Figma.** The font was replaced or renders slightly wider. See [Fonts](fonts.md).

**Images are grey placeholders.** The image couldn't be loaded from its server. Capture again with the extension rather than importing HTML, since the extension reads images from the browser.

**Paste does nothing in Figma.** Click inside the PageRecast window first so it has focus, then paste.

**Very large pages are slow.** Imports of several thousand layers take a few seconds per thousand. Capturing one width at a time or using the visible area keeps them quick.

Still stuck? [Open an issue](https://github.com/Shades-Media-Group/PageRecast/issues/new/choose) with the page and your PageRecast version.
