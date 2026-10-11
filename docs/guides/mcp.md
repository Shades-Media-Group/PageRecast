# AI agents (MCP)

`pagerecast-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI agents capture web pages, read their design tokens and hand captures to the Figma plugin. Claude Code, Claude Desktop, Codex CLI, Cursor and any other MCP client can run it.

It runs on your machine, started by your agent over stdio. Pages open in a local headless Chromium, files are written to your disk, and captures reach Figma through a bridge on `127.0.0.1`. Nothing is sent to a PageRecast server, because there is none, and there is no account.

## Set up

You need Node 22 or later and a Chromium: Playwright's (`npx playwright install chromium`) or Google Chrome. To use another browser, set `PAGERECAST_BROWSER` to its path in the server's environment.

### Claude Code

```bash
claude mcp add pagerecast -- npx -y pagerecast-mcp
```

Add `--scope project` to share it with your team through the project's `.mcp.json`, or `--scope user` for every project.

### Claude Desktop

Open **Settings → Developer → Edit Config** and add the server to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "pagerecast": {
      "command": "npx",
      "args": ["-y", "pagerecast-mcp"]
    }
  }
}
```

If the server does not start, Claude Desktop may not see the Node you installed with a version manager. Give the full path to `npx` instead, from `which npx`.

### Codex CLI

```bash
codex mcp add pagerecast -- npx -y pagerecast-mcp
```

Or add it to `~/.codex/config.toml`. A capture can take longer than Codex's default 60 second tool timeout, so raise it:

```toml
[mcp_servers.pagerecast]
command = "npx"
args = ["-y", "pagerecast-mcp"]
startup_timeout_sec = 60
tool_timeout_sec = 180
```

### Cursor

Create `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "pagerecast": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "pagerecast-mcp"]
    }
  }
}
```

### Any other client, and `.mcp.json`

Most clients read the same `mcpServers` shape. [`packages/mcp/example.mcp.json`](../../packages/mcp/example.mcp.json) is a ready file: copy it to your project root as `.mcp.json`. It also shows where the optional environment variables go.

From a clone of this repository, `yarn build` (or `node packages/mcp/build.mjs`) builds the server, and any client can run it with `node /path/to/PageRecast/packages/mcp/dist/pagerecast-mcp.mjs`.

## Tools

| Tool                 | Does                                                                                   | Changes anything                    |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------- |
| `capture_page`       | Captures a page into a `.recast` file and returns its path and a summary of the frames | Writes the file                     |
| `page_design_tokens` | Returns the page's design tokens as a `DESIGN.md`, CSS custom properties or W3C JSON   | No                                  |
| `recast_info`        | Summarises a `.recast` file: source, frames, sizes, layer counts, assets               | No                                  |
| `send_to_figma`      | Queues a `.recast` file for the Figma plugin and returns the pairing code              | Queues the file on the local bridge |

### `capture_page`

| Input        | Type                             | Default                              |
| ------------ | -------------------------------- | ------------------------------------ |
| `url`        | string, required                 |                                      |
| `widths`     | 1 to 8 integers, 240 to 3840     | `[1440]`                             |
| `theme`      | `light`, `dark` or `both`        | `light`                              |
| `scope`      | `page` or `viewport`             | `page`                               |
| `language`   | BCP 47 tag such as `de-DE`       | browser default                      |
| `wait_ms`    | 0 to 60000, waited at each width | 0                                    |
| `hide`       | CSS selectors to leave out       | none                                 |
| `max_height` | px, 0 for the whole page         | 0                                    |
| `out_path`   | path ending in `.recast`         | a new file in the system temp folder |

`url` takes an http(s) URL, a bare host, a `file://` URL or a path to a local HTML file, so an agent can capture the page it is building on `localhost`. The result stays small on purpose; the layers stay in the file:

```json
{
  "path": "/var/folders/…/pagerecast/example.com-mg5x1a2b.recast",
  "url": "https://example.com/",
  "title": "Example Domain",
  "sizeKb": 41,
  "frames": [
    {
      "label": "Desktop · 1440 · Light",
      "width": 1440,
      "height": 900,
      "theme": "light",
      "layers": 9,
      "text": 3,
      "images": 0
    }
  ]
}
```

The browser starts without cookies, so pages behind a login show their logged-out state. For those, use the extension on your own signed-in tab.

### `page_design_tokens`

Takes `recast_path` (fast) or `url` (captures first, in light and dark), and `format`: `md` (default), `css` or `w3c`. Returns the text. `md` is a short `DESIGN.md` written for coding agents: the palette by role with dark values, the type scale, spacing, radii, shadows and usage rules. The [command line guide](cli.md#design-tokens) explains each format.

### `recast_info`

Takes `recast_path`. Returns the page title and URL, when and by what it was captured, and per frame its label, size, theme, scope, layer counts by type and whether it has a screenshot, plus asset counts.

### `send_to_figma`

Takes `recast_path`. Puts the file on the [bridge](#the-figma-bridge) and returns the queue id, the `pairingCode`, the bridge URL and `pluginConnected`, which says whether the plugin polled in the last 10 seconds.

### Errors

Every error comes back as a tool result the agent can read, with the next step in it: an option out of range names the range, a missing file points back to `capture_page`, a page that does not load suggests checking the URL and raising `wait_ms`, and a missing browser says how to install one.

### Resource

`pagerecast://docs/scene-format` serves the [`.recast` format](../scene-format.md) specification as Markdown, for agents that want to read a capture's JSON themselves.

## Environment

| Variable                 | Default | Meaning                                                                                          |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `PAGERECAST_BROWSER`     |         | Path to the Chrome or Chromium to run                                                            |
| `PAGERECAST_BRIDGE_PORT` | `7357`  | Port of the Figma bridge on `127.0.0.1`; the plugin looks on 7357 only, so change it for testing |

## The Figma bridge

An agent cannot click inside Figma, so `send_to_figma` leaves the file where the plugin can collect it: a small HTTP server on `127.0.0.1` that the MCP server starts on the first `send_to_figma` and stops when the agent session ends. The plugin, while open, polls it from its window and imports what is waiting.

Pairing keeps other software away from your captures. Each bridge makes a random pairing code such as `7F0Y-5AC6-3PXH-R78Q`; the agent shows it to you once, you type it into the plugin, and from then on files arrive on their own until the agent session ends.

In the plugin, open the **MCP** tab and turn on **Listen for agent imports**. When an agent is running, the plugin asks for its pairing code once; captures then import as they arrive, through the same review as a pasted capture. When the bridge cannot be reached (see [limits](#limits)), drop the file at the returned path on the plugin window. That always works.

### Can a Figma plugin reach localhost?

Yes, with conditions. What Figma documents:

- A plugin can reach only the domains in its manifest's `networkAccess.allowedDomains`. Local servers such as `http://localhost:7357` are valid entries; listing one in `allowedDomains` requires a `reasoning` string. `devAllowedDomains` applies only while a plugin runs in development, so a published plugin must use `allowedDomains`.
- Figma documents `"*"` as access to "any external network resources" and lists local servers as a separate case, so it does not say that `"*"` covers localhost. The plugin should list `http://localhost:7357` and `http://127.0.0.1:7357` explicitly.
- Plugin iframes have a `null` origin and CORS applies, so the bridge must answer that origin. It does.

What Figma does not control, and what this protocol cannot fix:

- **Figma in a browser.** Chrome 142 and later asks the user before a public site reaches a local or loopback address (Local Network Access), and a cross-origin iframe, which the plugin window is, can only ask when its embedder delegates the permission. Whether Figma's web app delegates it is up to Figma, so in the browser the bridge may need the user to allow access, or may be blocked. Other browsers are untested.
- **Figma desktop.** It embeds Chromium, and loopback access depends on how Figma configures it. It is the expected home of the bridge, but it has not been tested against a published plugin yet.

HTTPS with a certificate for localhost is not an option: browsers already treat `http://127.0.0.1` and `http://localhost` as secure, and installing a certificate would ask far more of the user than a pairing code.

So the bridge is a convenience, never the only path: when it cannot connect, the plugin keeps working with dropped files, and `send_to_figma` always returns the file path for that.

### Limits

- The plugin must be open in Figma to receive files; they wait in the bridge until it is.
- At most 20 files wait at once (the oldest is dropped), each up to 256 MB, in memory only. They disappear when the agent session ends.
- Each agent session that owns the bridge makes a new pairing code, so the plugin asks again after a restart.
- Port 7357 must be free: the plugin looks there only. `PAGERECAST_BRIDGE_PORT` moves the bridge for tests.

## Bridge protocol

This is the contract the Figma plugin implements. Version 1.

**Base URL** `http://127.0.0.1:7357` (`http://localhost:7357` also works). The plugin uses port 7357; `PAGERECAST_BRIDGE_PORT` moves the server for tests.

**Authentication** Every `/v1/files` route needs `Authorization: Bearer <pairing code>`. The code is four groups of four Crockford base32 characters joined by hyphens, such as `7F0Y-5AC6-3PXH-R78Q`; letters may be lower case. A wrong or missing code returns `401`.

### Endpoints

| Method and path         | Auth | Request                                           | Response                                                                     |
| ----------------------- | ---- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /v1/status`        | no   |                                                   | `200 {"app":"pagerecast-bridge","protocol":1,"version":"1.0.0"}`             |
| `GET /v1/files`         | yes  |                                                   | `200 {"files":[PendingFile, …]}`, oldest first                               |
| `GET /v1/files/{id}`    | yes  |                                                   | `200` `application/octet-stream`: the `.recast` bytes (gzip-compressed JSON) |
| `DELETE /v1/files/{id}` | yes  |                                                   | `204`                                                                        |
| `POST /v1/files`        | yes  | body: `.recast` bytes; header `X-PageRecast-Meta` | `201 {"file":PendingFile,"pluginConnected":false}`                           |

```ts
interface PendingFile {
  id: string // UUID
  name: string // suggested file name, such as "example.com.recast"
  title: string // page title
  url: string // page URL
  size: number // bytes
  createdAt: string // ISO 8601
}
```

`X-PageRecast-Meta` is `encodeURIComponent(JSON.stringify({ name, title, url }))`. `POST` is how a second MCP server on the same machine adds files to a bridge another one owns; the plugin only reads.

Errors are JSON `{"error": "…"}` with `400` (bad body or header), `401` (pairing code), `403` (origin or host refused), `404` (no such route or file), `405` (method) and `413` (over 256 MB).

### What the plugin does

1. **Look for a bridge.** While **Listen for agent imports** is on, `GET /v1/status`. No answer means no agent is running: say so quietly and try again every few seconds.
2. **Pair.** With a bridge and no stored code, ask for the pairing code. Keep it in `figma.clientStorage`.
3. **Poll.** Every 2 seconds while the window is open, `GET /v1/files`. Each poll also tells the agent the plugin is connected.
4. **Import.** For each file, oldest first: `GET /v1/files/{id}`, pass the bytes to the same `decode` and import flow a dropped file goes through, then `DELETE /v1/files/{id}` as soon as it is downloaded, so it imports once. While a review or an import is on screen, files wait in the bridge.
5. **Re-pair.** On `401`, forget the stored code and ask again: the agent session restarted.

The plugin makes the requests from its UI iframe (`apps/figma-plugin/src/ui/agent.ts`), where dropped and pasted files are already handled. Its `fetch` sends `Origin: null` and, because of the `Authorization` header, a CORS preflight that the bridge answers.

### The plugin's network access

`apps/figma-plugin/manifest.json` allows `"*"`, which covers the bridge. Figma rejects a manifest that lists other domains next to `"*"`, so the bridge is not listed separately:

```json
"networkAccess": {
  "allowedDomains": ["*"],
  "reasoning": "Captures reference images on the websites they came from; the plugin downloads those images so they appear in the imported design. It also collects captures that a local AI agent queued on this computer (127.0.0.1). Nothing is sent anywhere."
}
```

### Security

- The bridge listens on `127.0.0.1` only, so other machines cannot reach it.
- The pairing code is the boundary: 80 random bits per bridge, compared in constant time. CORS is not a boundary, because every sandboxed iframe on the web shares the `null` origin.
- Requests must name `127.0.0.1:<port>` or `localhost:<port>` as their host, which defeats DNS rebinding.
- Browser requests are answered only for the `null` origin, `https://www.figma.com` and `https://figma.com`; any other `Origin` gets `403`. Requests without an `Origin`, from local programs, are allowed and still need the code.
- Preflights allow `GET`, `POST` and `DELETE` with `Authorization`, `Content-Type` and `X-PageRecast-Meta`, and answer `Access-Control-Allow-Private-Network: true` for browsers that send Private Network Access preflights.
- Files live in memory only. The process that owns the port writes `{port, pairingCode}` to `~/.pagerecast/bridge.json`, readable only by you, so a second agent session on the same machine posts its files to the same bridge and shows the same code.
