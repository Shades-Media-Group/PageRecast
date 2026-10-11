# PageRecast guides

1. [Getting started](getting-started.md): install both apps and import your first page in two minutes.
2. [Pages behind a login, staging and localhost](private-pages.md)
3. [Widths, themes and languages](widths-themes-language.md)
4. [Import options](import-options.md): Auto Layout, variables, styles, naming and per-site settings.
5. [Fonts](fonts.md): how fonts are matched and what to do when one is replaced.
6. [HTML files and code](html-and-code.md): import without the extension.
7. [Firefox](firefox.md): what differs from Chrome.
8. [Troubleshooting](troubleshooting.md)
9. [The command line](cli.md): capture pages and extract design tokens without opening Chrome.
10. [The API](api.md): the same from JavaScript or TypeScript.
11. [AI agents (MCP)](mcp.md): let Claude Code, Codex, Cursor and other agents capture pages and send them to Figma.

## Command line

`pagerecast` captures pages from a terminal with the extension's engine, and turns any capture into design tokens as CSS variables, W3C Design Tokens JSON or a `DESIGN.md` for AI coding tools. Everything runs locally.

```bash
npx pagerecast capture https://example.com --widths 1440,390 --theme both
npx pagerecast tokens example.com.recast --format md --out DESIGN.md
```

See [the command line guide](cli.md).

Developers: see the [`.recast` format](../scene-format.md) and the [architecture](../architecture.md).
