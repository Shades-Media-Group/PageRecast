# Publishing to the Chrome Web Store, Firefox Add-ons and the Figma Community

The first-time setup for maintainers, using the Shades Media Group accounts. Later updates follow [releasing.md](releasing.md).

Everything here is copy you can paste. Assets are in [`assets/store`](../assets/store).

---

## Before you start

- A Google account for Shades Media Group with **2-Step Verification** on (the Web Store requires it to publish).
- A Mozilla account for Shades Media Group with **two-step authentication** on (addons.mozilla.org requires it to submit).
- A Figma account for Shades Media Group with **two-factor authentication** on (the Community requires it to publish), and the **Figma desktop app**.
- The release zips from the latest [GitHub Release](https://github.com/Shades-Media-Group/PageRecast/releases), or `yarn build && yarn package`.

---

## Chrome Web Store

### 1. Register as a developer (once)

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) signed in with the Shades account.
2. Accept the developer agreement and pay the one-time registration fee.
3. In **Account**, set the publisher name to **Shades Media Group**, add and verify the contact email (`support@shades.md`), and complete the trader declaration (Shades publishes as a business, so choose trader and enter the business address and contact).

### 2. Create the item

1. **Add new item** and upload `pagerecast-chrome-extension-X.Y.Z.zip`.
2. **Store listing**

| Field                        | Value                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Name                         | PageRecast — Website to Figma, HTML to design (from `apps/extension/_locales`, one per language)            |
| Summary                      | Import any website into Figma as editable layers, even behind a login. HTML to design at every width. Free. |
| Category                     | Developer Tools                                                                                             |
| Language                     | English; French, Romanian, Russian, Spanish and Chinese come from `_locales`                                |
| Icon                         | `assets/brand/png/icon-128.png`                                                                             |
| Screenshots (1280 × 800)     | `assets/store/chrome-screenshot-1.png` … `-3.png`                                                           |
| Small promo tile (440 × 280) | `assets/store/chrome-promo-small.png`                                                                       |
| Marquee (1400 × 560)         | `assets/store/chrome-promo-marquee.png`                                                                     |
| Homepage                     | https://github.com/Shades-Media-Group/PageRecast                                                            |
| Support                      | https://github.com/Shades-Media-Group/PageRecast/issues                                                     |

**Description**

```
Import any website into Figma as editable layers: HTML to design, web to Figma, at every width and in light and dark. Free, with no limits and no account.

HOW IT WORKS
1. Open a page and click PageRecast.
2. Choose the widths (desktop, tablet, mobile or any width), light or dark, and the language.
3. Capture, then paste into the PageRecast plugin in Figma.

CAPTURE ANYTHING YOU CAN SEE
• Pages behind a login, staging sites and localhost
• The full page, the visible area, or one element you click
• Several widths and both colour schemes in one go
• Any URL, without opening it first

WHAT YOU GET IN FIGMA
• Frames, text with every style, images and SVG vectors
• Auto Layout where it matches the page
• Colour variables with Light and Dark modes, and text styles
• A screenshot beside each frame to compare

PRIVATE BY DESIGN
Captures are made and kept on your computer. There is no server, no account and no tracking.

Free and open source. Built by Shades Media Group.
Source code: https://github.com/Shades-Media-Group/PageRecast
```

3. **Privacy practices**

| Field              | Answer                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single purpose     | Capture the current web page so it can be imported into Figma as editable design layers.                                                                                                                                           |
| `debugger`         | Used only while the user captures a page: it sets the page to the chosen width, colour scheme and language, reads the page's layout and styles, and takes a screenshot for reference. It detaches as soon as the capture finishes. |
| `tabs`             | Shows the title, address and icon of the page that will be captured, and opens a web address the user asks to capture.                                                                                                             |
| `sidePanel`        | The extension's interface is shown in Chrome's side panel.                                                                                                                                                                         |
| `storage`          | Saves the user's capture settings on their device.                                                                                                                                                                                 |
| `unlimitedStorage` | Keeps the user's recent captures, which include page screenshots, on their device.                                                                                                                                                 |
| Remote code        | No, I am not using remote code.                                                                                                                                                                                                    |
| Data usage         | Tick nothing. Certify that data is not sold, not used for unrelated purposes and not used for creditworthiness.                                                                                                                    |
| Privacy policy     | https://pagerecast.shades.md/privacy/                                                                                                                                                                                              |

4. **Distribution:** Public, all regions. Then **Submit for review**. Extensions that use `debugger` get a manual review, which usually takes a few days.

---

## Firefox Add-ons (addons.mozilla.org)

### 1. Set up the developer account (once)

1. Sign in to the [Add-on Developer Hub](https://addons.mozilla.org/developers/) with a Mozilla account for Shades Media Group, with **two-step authentication** on (required to submit).
2. In **Edit My Profile**, set the display name to **Shades Media Group** and the homepage to https://shades.md.
3. Accept the developer agreement when the first upload asks for it. There is no fee.

### 2. Submit the add-on

1. **Submit a New Add-on**, choose **On this site** (listed), and upload `pagerecast-firefox-extension-X.Y.Z.zip`.
2. Platforms: tick **Firefox** only. Leave **Firefox for Android** unticked: it has no sidebar.
3. When asked whether the add-on uses minified or generated code, answer **Yes** and upload the source archive (see [Source code](#source-code)).
4. **Listing**

| Field          | Value                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Name           | PageRecast — Website to Figma, HTML to design (from `apps/extension/_locales`, one per language)               |
| Add-on URL     | `pagerecast`                                                                                                   |
| Summary        | Import any website into Figma as editable layers, even behind a login. HTML to design at every width. Free.    |
| Categories     | Web Development                                                                                                |
| Support email  | support@shades.md                                                                                              |
| Support site   | https://github.com/Shades-Media-Group/PageRecast/issues                                                        |
| Homepage       | https://github.com/Shades-Media-Group/PageRecast                                                               |
| License        | MIT License                                                                                                    |
| Privacy policy | Yes: paste the text of [PRIVACY.md](../PRIVACY.md), or link https://pagerecast.shades.md/privacy/              |
| Icon           | `assets/brand/png/icon-128.png`                                                                                |
| Screenshots    | `assets/store/chrome-screenshot-1.png` … `-3.png` (the panel is the same; retake them in Firefox when you can) |

**Description**: the Chrome Web Store description above, with the **HOW IT WORKS** block replaced by this one, because Firefox captures the theme and language the page shows:

```
HOW IT WORKS
1. Open a page and click PageRecast. It opens in the sidebar.
2. Choose the widths: desktop, tablet, mobile or any width.
3. Capture, then paste into the PageRecast plugin in Figma.
```

and the **Several widths and both colour schemes in one go** line replaced by `• Several widths in one go`.

5. **Notes to reviewer**

```
Build from source: Node 22 and Yarn 1. Run "yarn install --frozen-lockfile" and then "yarn build:firefox". The add-on is written to apps/extension/dist-firefox. The bundles are minified by esbuild and Vite; nothing is obfuscated and no code is loaded remotely.

<all_urls> is used only while the user captures a page: scripting.executeScript runs the capture engine (capture.js) in that tab, tabs.captureTab takes its screenshot, and images the page shows are read so the capture works offline. Nothing is sent anywhere; there is no server and no analytics. The window is resized (or the page zoomed) to each width the user picks, then restored.
```

6. **Submit Version.** Listed add-ons are signed straight away and reviewed by a person afterwards.

### Source code

Mozilla needs the source for every version, because the bundles are minified. Make it from the release tag:

```bash
git archive --format zip -o pagerecast-source-X.Y.Z.zip vX.Y.Z
```

Upload it in the version's **Source code** field, and paste the build steps from the reviewer notes above.

---

## Figma Community

### 1. Get the plugin's ID (once)

The manifest now carries the permanent Community ID `1690893819753299295`. For a fresh fork, Figma issues a new one:

1. In Figma desktop, **Plugins → Development → New plugin…**, choose **Figma design**, name it **PageRecast**, and save it anywhere.
2. Copy the `id` from the generated `manifest.json`.
3. Put it in `apps/figma-plugin/manifest.json`, commit (`chore(figma-plugin): set the Community plugin id`), and run `yarn build`.
4. **Plugins → Development → Import plugin from manifest…** and pick `apps/figma-plugin/manifest.json`.

### 2. Publish

1. **Plugins → Development → Manage plugins in development**, then **Publish** next to PageRecast.
2. Fill in:

| Field                   | Value                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| Name                    | PageRecast — Import websites to Figma (HTML, CSS, web to design)        |
| Tagline                 | Import any website into Figma as editable layers. HTML to design, free. |
| Icon (128 × 128)        | `assets/brand/png/app-icon-128.png`                                     |
| Cover art (1920 × 1080) | `assets/store/figma-cover.png`                                          |
| Tags                    | import, website, html, web to figma, capture                            |
| Support contact         | support@shades.md                                                       |
| Publisher               | Shades Media Group                                                      |

**Description**

```
Import any website into Figma as editable layers: HTML to design, web to Figma, at every width and in light and dark. Free, with no limits and no account.

HOW TO IMPORT A WEBSITE
1. Install the PageRecast Chrome extension.
2. Open the page in Chrome, choose widths and theme, and capture.
3. Copy, then paste here with ⌘V.

PRIVATE OR LOGGED-IN PAGES
The extension captures exactly what your browser shows: dashboards after you sign in, staging, localhost.

IMPORT FILES AND CODE
Drop a .recast or .html file, or paste HTML and CSS in the Code tab.

WHAT YOU GET
• Frames, text with every style, images and SVG vectors
• Auto Layout where it matches the page
• Colour variables with Light and Dark modes, text styles, or your file's own styles
• Fonts matched through each CSS font stack, with a report of any replacements
• Options remembered per site

Nothing leaves your computer. Free and open source, built by Shades Media Group.
https://github.com/Shades-Media-Group/PageRecast
```

3. Answer the data question: the plugin collects no data. The network access reason is already in the manifest.
4. **Submit for review.** Figma reviews new plugins in about a week.

---

## After all three are live

1. Put the store links in [README.md](../README.md) (the install badges, including one for Firefox Add-ons), in [guides/firefox.md](guides/firefox.md), and in `EXTENSION_URL` in `apps/figma-plugin/src/ui/App.tsx`.
2. Commit as `docs: link the store listings` and push.
