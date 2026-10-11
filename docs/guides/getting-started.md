# Getting started

PageRecast has two parts that work together: a **Chrome extension** that captures a page, and a **Figma plugin** that turns the capture into layers.

## 1. Install the extension

Install **PageRecast** from the Chrome Web Store. It works in Chrome, Edge, Brave, Arc and other Chromium browsers.

To run the latest build instead, download `pagerecast-chrome-extension-*.zip` from [Releases](https://github.com/Shades-Media-Group/PageRecast/releases), unzip it, open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and pick the unzipped folder.

Using Firefox? See [Firefox](firefox.md).

Pin the extension so its icon stays in the toolbar. `Alt+Shift+P` opens it too.

## 2. Install the Figma plugin

Open **PageRecast** on the Figma Community and choose **Open in…** or **Save**.

To run a release build instead, download `pagerecast-figma-plugin-*.zip`, unzip it, and in Figma desktop choose **Plugins → Development → Import plugin from manifest…**, then pick `manifest.json`.

## 3. Capture a page

1. Open the page in Chrome and click the PageRecast icon. The side panel opens.
2. Choose the **area** (full page, visible area or one element), the **widths** and the **theme**.
3. Press **Capture this page**, or `⌘ Enter` / `Ctrl Enter`.

You can also start from the page itself: right-click it and choose **Capture this page with PageRecast** or **Pick an element to capture**, or press `Alt+Shift+C`. The side panel opens and captures with your saved settings. Change the shortcut at `chrome://extensions/shortcuts`.

The first time, Chrome shows a bar saying PageRecast started debugging the browser. That is how PageRecast reads the page at other widths; the bar goes away when the capture ends.

## 4. Paste into Figma

1. Press **Copy for Figma** in the side panel.
2. In Figma, run **PageRecast** and paste with `⌘ V` / `Ctrl V`.
3. Check the frames and options, then press **Import into Figma**.

The import is selected on the canvas when it finishes, with a report of what was created and any fonts that were replaced.

You can also press **Download** to save a `.recast` file and drop it into the plugin later. Dropping or choosing several `.recast` and `.html` files at once imports them together, one row per page.

### Several pages at once

To bring several captures into Figma with one paste, press **Select** above **Recent**, tick the captures you want and press **Copy N for Figma**. They are combined into one capture, and the plugin imports every frame together, each named after its page. The download button beside it saves the combined `.recast` file.

To capture pages you don't have open, paste their URLs into the field under **Page**, separated by spaces, commas or new lines, and press the arrow. PageRecast opens and captures each one in turn with your settings, then ticks them all, ready for **Copy N for Figma**.

### Start from Figma

The plugin's **Web** tab takes a URL, the widths, the theme and a language. **Import page** sends the address and those settings to PageRecast's server, which opens the public page in a browser of its own, captures it with the same engine as the extension and returns the layers to the review screen. It stores and logs nothing, and needs no extension. It takes up to 45 seconds, four widths and both themes at a time; addresses on `localhost` or a private network are refused before anything is sent.

For pages behind a login, on staging or on `localhost`, **Capture in browser** opens `pagerecast.shades.md/capture/` in your browser with those settings in the link. The page finds the extension, you press **Capture**, and the capture is copied for you: paste it back in the plugin. The settings travel in the part of the link after `#`, which browsers never send to a server, and the page talks only to the extension in your browser.

That route needs the Chrome extension (or Edge, Brave, Arc). Without it the page says so and links to the store.

The **MCP** tab lets AI agents send captures straight into the plugin: see [AI agents (MCP)](mcp.md). The **API** tab has the commands for capturing from code: see [the API](api.md).
