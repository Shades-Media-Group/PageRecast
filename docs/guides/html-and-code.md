# HTML files and code

You can import HTML without the extension.

- **Code tab:** paste HTML with `<style>` blocks, choose a width, and press **Render and review**.
- **File tab:** drop or choose an `.html` file, a `.zip` of a site folder, or a page your browser saved as a single file (`.mhtml` or `.mht`). Drop several files to import them together.

The HTML is rendered inside the plugin window at the width you choose, then imported like a capture. Scripts don't run, so pages that build their content with JavaScript should be captured with the extension instead. Images load from their URLs if the server allows it.

## Zip archives and saved pages

A `.zip` brings its own files: the plugin opens the `index.html` nearest the top of the archive (or the first HTML file) and uses the stylesheets, images and fonts next to it, so nothing has to be online. A `.mhtml` file works the same way with the files the browser saved inside it. Files the archive doesn't contain load from their URLs, as for a plain `.html` file. Archives can hold up to 64 MB of unpacked files.
