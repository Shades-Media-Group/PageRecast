import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { decode } from '@pagerecast/scene'

const root = fileURLToPath(new URL('..', import.meta.url))
const text = (r: CallToolResult) => (r.content[0] as { text: string }).text

test.beforeAll(() => {
  execFileSync('node', ['packages/mcp/build.mjs'], { cwd: root })
})

test('an agent captures a page over stdio, reads it back and hands it to the plugin', async () => {
  test.setTimeout(120_000)
  const home = await mkdtemp(join(tmpdir(), 'pagerecast-home-'))
  const out = join(home, 'kitchen-sink.recast')
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'packages/mcp/dist/pagerecast-mcp.mjs')],
    cwd: root,
    // A private home for the bridge's pairing file, and a port no other run uses.
    env: {
      ...(process.env as Record<string, string>),
      HOME: home,
      PAGERECAST_BRIDGE_PORT: String(20_000 + Math.floor(Math.random() * 20_000)),
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'e2e', version: '0' })
  await client.connect(transport)
  try {
    const captured = (await client.callTool(
      {
        name: 'capture_page',
        arguments: {
          url: 'e2e/fixtures/kitchen-sink.html',
          widths: [1440, 390],
          theme: 'both',
          max_height: 1200,
          out_path: out,
        },
      },
      undefined,
      { timeout: 110_000 },
    )) as CallToolResult
    expect(captured.isError, text(captured)).toBeFalsy()
    const summary = JSON.parse(text(captured))
    expect(summary.path).toBe(out)
    expect(summary.frames.map((f: { width: number; theme: string }) => [f.width, f.theme])).toEqual(
      [
        [1440, 'light'],
        [1440, 'dark'],
        [390, 'light'],
        [390, 'dark'],
      ],
    )
    expect(summary.frames.every((f: { layers: number }) => f.layers > 10)).toBe(true)
    expect(summary.frames.every((f: { height: number }) => f.height <= 1200)).toBe(true)
    expect((await decode(new Uint8Array(await readFile(out)))).captures).toHaveLength(4)

    const info = (await client.callTool({
      name: 'recast_info',
      arguments: { recast_path: out },
    })) as CallToolResult
    expect(JSON.parse(text(info)).captures[3].label).toBe('Mobile · 390 · Dark')

    const tokens = (await client.callTool({
      name: 'page_design_tokens',
      arguments: { recast_path: out },
    })) as CallToolResult
    expect(text(tokens)).toContain('design system')

    // The plugin's side of the bridge: poll with the pairing code, download, acknowledge.
    const sent = JSON.parse(
      text(
        (await client.callTool({
          name: 'send_to_figma',
          arguments: { recast_path: out },
        })) as CallToolResult,
      ),
    )
    const headers = { Authorization: `Bearer ${sent.pairingCode}`, Origin: 'null' }
    const list = await fetch(`${sent.bridgeUrl}/v1/files`, { headers })
    expect(list.headers.get('access-control-allow-origin')).toBe('null')
    const { files } = (await list.json()) as { files: { id: string; title: string }[] }
    expect(files).toEqual([expect.objectContaining({ id: sent.queued })])
    const bytes = await fetch(`${sent.bridgeUrl}/v1/files/${sent.queued}`, { headers })
    const file = await decode(new Uint8Array(await bytes.arrayBuffer()))
    expect(file.captures).toHaveLength(4)
    const ack = await fetch(`${sent.bridgeUrl}/v1/files/${sent.queued}`, {
      method: 'DELETE',
      headers,
    })
    expect(ack.status).toBe(204)
  } finally {
    await client.close()
  }
})
