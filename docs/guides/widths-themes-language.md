# Widths, themes and languages

Each site remembers the area, widths and theme you last captured it with. A site you haven't captured yet starts from the settings you used most recently.

## Widths

Choose any combination of **Desktop (1440)**, **Laptop (1280)**, **Tablet (768)** and **Mobile (390)**, or add your own width between 240 and 3840 pixels. Each width becomes its own frame in Figma.

PageRecast resizes the page itself rather than the window, so your browser stays as it is. Widths under 600 px also use a mobile browser identity, which makes responsive sites switch to their phone layouts.

## Themes

Choose **Light**, **Dark** or **Both**. Dark sets the page's `prefers-color-scheme` to dark, which works on any site with a dark mode that follows the system setting. With **Both**, the plugin can create colour variables with a Light and a Dark mode from the pair.

## Language

Pick a language to capture the page as a visitor with that browser language would see it. The page reloads once in that language before capturing. This works on sites that choose their language from the browser; sites that use a language switcher or a path such as `/de/` need that page opened directly.

## Area

- **Full page:** the whole page, top to bottom.
- **Visible:** only what is in the window right now.
- **Element:** after pressing Capture, hover the page and click the part you want. Arrow Up and Arrow Down move to the parent or first child; Escape cancels.
