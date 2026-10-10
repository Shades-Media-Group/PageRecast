# Fonts

Figma can only use fonts that are installed on your computer or available in Figma (which includes all of Google Fonts).

For each piece of text, PageRecast walks the page's CSS font list in order and uses the first family Figma has, picking the closest weight and the right italic. Generic families such as `system-ui`, `sans-serif` and `monospace` map to sensible Figma fonts. If nothing matches, the text uses Inter.

Every replacement is listed in the import report, with how many layers it affected.

## Getting an exact match

1. Install the missing font on your computer (for web fonts, the site's font files or the same family from its foundry).
2. Restart Figma so it sees the font.
3. Import again.

To swap a font after importing, select the frame and use Figma's **Replace fonts** dialog.
