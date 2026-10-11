# pagerecast-mcp

A Model Context Protocol server for PageRecast. AI agents such as Claude Code, Claude Desktop, Codex CLI and Cursor use it to capture web pages as `.recast` files, read the design tokens a page uses, and hand captures to the PageRecast Figma plugin, which turns them into editable layers.

It runs on your machine over stdio. Pages open in a local headless Chromium and captures reach Figma through a bridge on `127.0.0.1`. Nothing is sent to any PageRecast server: no account, no server, no telemetry.

## Set up

Needs Node 22 or later and a Chromium (`npx playwright install chromium`, or Google Chrome).

```bash
claude mcp add pagerecast -- npx -y pagerecast-mcp     # Claude Code
codex mcp add pagerecast -- npx -y pagerecast-mcp      # Codex CLI
```

Claude Desktop, Cursor and other clients take the usual `mcpServers` entry:

```json
{
  "mcpServers": {
    "pagerecast": { "command": "npx", "args": ["-y", "pagerecast-mcp"] }
  }
}
```

## Tools

- `capture_page`: capture a URL, local HTML file or `localhost` page at chosen widths and themes; returns the file path and a summary of each frame.
- `page_design_tokens`: the page's colours, type scale, spacing, radii and shadows as a `DESIGN.md`, CSS custom properties or W3C Design Tokens JSON.
- `recast_info`: what a `.recast` file holds.
- `send_to_figma`: queue a capture for the Figma plugin, paired with a one-time code.

The `.recast` format specification is available as the resource `pagerecast://docs/scene-format`.

Set `PAGERECAST_BROWSER` to use a specific Chrome or Chromium, and `PAGERECAST_BRIDGE_PORT` to move the Figma bridge off port 7357 for testing (the plugin looks on 7357 only).

The full guide, including the bridge protocol: <https://github.com/Shades-Media-Group/PageRecast/blob/main/docs/guides/mcp.md>.

## Licence

MIT. Free and open source. Built by Shades Media Group.
