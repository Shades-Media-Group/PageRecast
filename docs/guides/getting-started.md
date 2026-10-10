# Getting started

PageRecast has two parts that work together: a **Chrome extension** that captures a page, and a **Figma plugin** that turns the capture into layers.

## 1. Install the extension

Install **PageRecast** from the Chrome Web Store. It works in Chrome, Edge, Brave, Arc and other Chromium browsers.

To run the latest build instead, download `pagerecast-chrome-extension-*.zip` from [Releases](https://github.com/Shades-Media-Group/PageRecast/releases), unzip it, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick the unzipped folder.

Pin the extension so its icon stays in the toolbar. `Alt+Shift+P` opens it too.

## 2. Install the Figma plugin

Open **PageRecast** on the Figma Community and choose **Open in…** or **Save**.

To run a release build instead, download `pagerecast-figma-plugin-*.zip`, unzip it, and in Figma desktop choose **Plugins → Development → Import plugin from manifest…**, then pick `manifest.json`.

## 3. Capture a page

1. Open the page in Chrome and click the PageRecast icon. The side panel opens.
2. Choose the **area** (full page, visible area or one element), the **widths** and the **theme**.
3. Press **Capture this page**, or `⌘ Enter` / `Ctrl Enter`.

The first time, Chrome shows a bar saying PageRecast started debugging the browser. That is how PageRecast reads the page at other widths; the bar goes away when the capture ends.

## 4. Paste into Figma

1. Press **Copy for Figma** in the side panel.
2. In Figma, run **PageRecast** and paste with `⌘ V` / `Ctrl V`.
3. Check the frames and options, then press **Import into Figma**.

The import is selected on the canvas when it finishes, with a report of what was created and any fonts that were replaced.

You can also press **Download** to save a `.recast` file and drop it into the plugin later.
