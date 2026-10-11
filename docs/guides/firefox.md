# Firefox

PageRecast for Firefox is built from the same code as the Chrome extension and makes the same `.recast` captures for the same Figma plugin. It needs Firefox 142 or later on desktop.

## Install

Install **PageRecast** from addons.mozilla.org. Click its toolbar icon, or press `Alt+Shift+P`, to open it in the sidebar.

To try a release build instead, download `pagerecast-firefox-extension-*.zip` from [Releases](https://github.com/Shades-Media-Group/PageRecast/releases), open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…** and pick the zip. Firefox removes temporary add-ons when it quits.

## What is different

Firefox has no debugging API for extensions, so PageRecast reads the page with standard add-on APIs instead. Most of a capture is the same, including the right-click menu, `Alt+Shift+C`, hover and focus states, per-site settings and copying several captures as one. These parts are not:

- **Theme:** the page is captured in the colour scheme it shows now. To capture it dark, switch Firefox (Settings → General → Website appearance) or your system to dark first. Light, Dark and Both are not offered.
- **Language:** the page is captured in the language it shows now. Open the page in the language you want, for example through the site's own language switcher.
- **Widths:** PageRecast resizes the Firefox window until the page is exactly the chosen width, then puts it back. When the window cannot get that wide or that narrow on your screen, the page is zoomed for the capture and the zoom is put back afterwards. You see the window change size while it works.
- **Mobile widths:** narrow widths get the site's narrow layout, but the page still sees a desktop browser, so sites that serve a separate phone version by browser type keep their desktop version.
- **No debugging bar:** Firefox shows no notice during a capture.

PageRecast asks Firefox for access to all websites so it can read the page you capture, take its screenshot and save the images a page uses behind a login. Nothing is sent anywhere.

Firefox does not let add-ons read its own pages (such as `about:` pages) or addons.mozilla.org.
