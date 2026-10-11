# Import options

The options appear on the review screen in the plugin, and under **Settings** (the sliders icon at the top).

| Option                      | What it does                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto Layout**             | Turns flex rows and columns into Auto Layout, but only where the result lands exactly where the page put it. Anything else stays freely positioned.                               |
| **Components**              | Turns repeated cards, list rows and links into a main component with instances that keep their own text, links and images.                                                        |
| **Interaction states**      | Turns elements captured with hover, focus and active looks into component sets with a `State` property.                                                                           |
| **HTML layer names**        | Names layers after their markup (`div.card`) instead of their role (`Card`, `Link "Pricing"`).                                                                                    |
| **Use the file's styles**   | Applies colour variables, colour styles and text styles that already exist in the file when a value matches exactly.                                                              |
| **Create colour variables** | Turns colours used more than once into variables. With light and dark captures they get Light and Dark modes.                                                                     |
| **Create text styles**      | Turns type used more than once into local text styles.                                                                                                                            |
| **Links**                   | Keeps links on text as Figma hyperlinks.                                                                                                                                          |
| **Screenshot reference**    | Places a locked screenshot beside each frame so you can compare.                                                                                                                  |
| **Smaller images**          | Off by default, so images keep every pixel the page loaded. On, each image is scaled down to twice the size it shows at, which keeps big photos from making the Figma file heavy. |

## Options for one import

The options on the review screen apply to that import. **Remember for** (the site's name, at the end of the options) is on by default and makes them the site's options for its next import; turn it off to change them for this import only. A file combining several pages from the extension is one import, with one set of options.

## Settings per site

Each site remembers the options you last imported it with, unless you turned off **Remember for** on the review screen. **New sites** applies to sites you haven't imported yet. Change or forget a site's options in **Settings**.

## Importing without the review screen

Turn off **Review before importing** in Settings and a paste imports straight away with the site's options. Hold `⌘` (or `Ctrl`) while pasting to see the review screen anyway.

## Starting over

Every choice is saved on your computer and used next time, in the plugin and in the extension. **Reset all preferences**, near the end of the plugin's settings and the extension's capture settings, puts everything back to the defaults, including what each site remembers. It stays off until something differs from the defaults, and asks for a second click before it resets.
