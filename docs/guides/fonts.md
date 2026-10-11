# Fonts

Figma can only use fonts that are installed on your computer or available in Figma (which includes all of Google Fonts).

For each piece of text, PageRecast walks the page's CSS font list in order and uses the first family Figma has, picking the closest weight and the right italic. Generic families such as `system-ui`, `sans-serif` and `monospace` map to sensible Figma fonts. If nothing matches, the text uses Inter.

No font is replaced without telling you: the review screen shows every replacement before you import, and the import report lists them again, with how many layers each affected.

## Missing fonts on the review screen

Before you import, the review screen lists every font the page uses that Figma doesn't have, with the styles it uses and how often. Beside each one is the family the import will use, marked **(automatic)** while it is PageRecast's own pick.

- **Use another family:** click the field and type. It suggests every family Figma has, and the text keeps its weight and italic in the family you pick. Clear the field to go back to the automatic pick.
- **Get the real font:** **Get font** opens the font's Google Fonts page when the site loads it from Google Fonts, and otherwise a web search for it.
- **Check again:** after installing a font, press **Check again**. Fonts Figma now has leave the list and import as themselves. If a font you installed is still listed, close and reopen PageRecast (or restart Figma) and paste the capture again; your picks are kept.

You can import at any point: fonts still missing use the family shown beside them.

Your picks are remembered on this computer and filled in the next time a page uses that font, including imports that skip the review screen. To see or forget them, open **Settings** and scroll to **Fonts**.

## Getting an exact match

1. Install the missing font on your computer (for web fonts, the site's font files or the same family from its foundry).
2. Press **Check again** on the review screen, or restart Figma so it sees the font.
3. Import.

To swap a font after importing, select the frame and use Figma's **Replace fonts** dialog.
