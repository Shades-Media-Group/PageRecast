# Fonts

Figma can only use fonts that are installed on your computer or available in Figma (which includes all of Google Fonts).

For each piece of text, PageRecast walks the page's CSS font list in order and uses the first family Figma has, picking the closest weight and the right italic. Generic families such as `system-ui`, `sans-serif` and `monospace` map to sensible Figma fonts. If nothing matches, the text uses Inter.

Every replacement is listed in the import report, with how many layers it affected.

## Choosing the replacement

Before you import, the review screen lists every font the page uses that Figma doesn't have, with the styles it uses and how often. Each one shows the family PageRecast would pick on its own. To use another, click the field and type: it suggests every family Figma has, and the text keeps its weight and italic in the family you pick. Clear the field to go back to the automatic pick.

Your picks are remembered on this computer and filled in the next time a page uses that font, including imports that skip the review screen. To see or forget them, open **Settings** and scroll to **Fonts**.

## Getting an exact match

1. Install the missing font on your computer (for web fonts, the site's font files or the same family from its foundry).
2. Restart Figma so it sees the font.
3. Import again.

To swap a font after importing, select the frame and use Figma's **Replace fonts** dialog.
