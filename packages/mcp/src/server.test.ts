import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { encodeFile, SCENE_FORMAT, SCENE_VERSION, type RecastFile } from '@pagerecast/scene'
import { createServer, SCENE_FORMAT_URI } from './server'

const file: RecastFile = {
  format: SCENE_FORMAT,
  version: SCENE_VERSION,
  generator: { name: 'PageRecast', version: '1.0.0', surface: 'extension' },
  source: { url: 'https://example.com/', title: 'Example', capturedAt: '2026-10-11T00:00:00.000Z' },
  assets: {},
  captures: [
    {
      id: 'c1',
      label: 'Desktop · 1440 · Light',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      theme: 'light',
      scope: 'page',
      width: 1440,
      height: 900,
      root: {
        type: 'frame',
        id: 'n0',
        key: 'html',
        name: 'Example',
        tag: 'html',
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        fills: [],
        clips: true,
        position: 'static',
        children: [],
      },
    },
  ],
}

const send = vi.fn(async () => ({
  file: {
    id: 'f1',
    name: 'example.com.recast',
    title: 'Example',
    url: 'https://example.com/',
    size: 1,
    createdAt: '',
  },
  pairingCode: 'ABCD-EFGH-JKMN-PQRS',
  bridgeUrl: 'http://127.0.0.1:7357',
  pluginConnected: false,
}))

let client: Client
let dir: string
let recast: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pagerecast-mcp-'))
  recast = join(dir, 'example.recast')
  await writeFile(recast, await encodeFile(file))
  await writeFile(join(dir, 'not.recast'), 'hello')
  const server = createServer({
    version: 'test',
    sceneFormat: '# The .recast format',
    bridge: { send },
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
})

const call = (name: string, args: Record<string, unknown>) =>
  client.callTool({ name, arguments: args }) as Promise<CallToolResult>
const text = (r: CallToolResult) => (r.content[0] as { text: string }).text

describe('MCP server', () => {
  it('lists the four tools with annotations', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'capture_page',
      'page_design_tokens',
      'recast_info',
      'send_to_figma',
    ])
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        title: expect.any(String),
        readOnlyHint: expect.any(Boolean),
        destructiveHint: false,
      })
    }
  })

  it.each([
    [{ url: 'example.com', widths: [100] }, /240/],
    [{ url: 'example.com', widths: [] }, /url|widths|1/],
    [{ url: 'example.com', theme: 'sepia' }, /theme/],
    [{ url: 'example.com', scope: 'element' }, /scope/],
    [{ url: 'example.com', wait_ms: 120_000 }, /wait_ms|60000/],
    [{ url: 'example.com', language: 'not a tag!' }, /BCP 47/],
    [{ url: 'example.com', out_path: '/tmp/x.json' }, /\.recast/],
    [{}, /url/],
  ])('refuses capture_page arguments %j', async (args, message) => {
    const result = await call('capture_page', args)
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(message)
  })

  it('wants exactly one source for tokens', async () => {
    const none = await call('page_design_tokens', {})
    expect(none.isError).toBe(true)
    expect(text(none)).toMatch(/exactly one of url or recast_path/)
    const both = await call('page_design_tokens', { url: 'example.com', recast_path: recast })
    expect(both.isError).toBe(true)
  })

  it('reads tokens from a capture, as DESIGN.md by default', async () => {
    const result = await call('page_design_tokens', { recast_path: recast })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toMatch(/^# Example design system/)
    const css = await call('page_design_tokens', { recast_path: recast, format: 'css' })
    expect(text(css)).toMatch(/:root/)
  })

  it('describes a capture', async () => {
    const result = await call('recast_info', { recast_path: recast })
    const json = JSON.parse(text(result))
    expect(json).toMatchObject({ path: recast, title: 'Example', url: 'https://example.com/' })
    expect(json.captures[0]).toMatchObject({ label: 'Desktop · 1440 · Light', layers: 1 })
  })

  it('says what to do with a missing or foreign file', async () => {
    const missing = await call('recast_info', { recast_path: join(dir, 'nope.recast') })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toMatch(/No readable file .* capture_page/)
    const foreign = await call('send_to_figma', { recast_path: join(dir, 'not.recast') })
    expect(foreign.isError).toBe(true)
    expect(text(foreign)).toMatch(/not a PageRecast capture/)
    expect(send).not.toHaveBeenCalled()
  })

  it('queues a capture for Figma and returns the pairing code', async () => {
    const result = JSON.parse(text(await call('send_to_figma', { recast_path: recast })))
    expect(send).toHaveBeenCalledWith(expect.any(Uint8Array), {
      name: 'example.com.recast',
      title: 'Example',
      url: 'https://example.com/',
    })
    expect(result).toMatchObject({ queued: 'f1', pairingCode: 'ABCD-EFGH-JKMN-PQRS' })
    expect(result.next).toMatch(/pairs it with code ABCD-EFGH-JKMN-PQRS/)
  })

  it('serves the .recast spec as a resource', async () => {
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri)).toEqual([SCENE_FORMAT_URI])
    const { contents } = await client.readResource({ uri: SCENE_FORMAT_URI })
    expect(contents[0]).toMatchObject({ mimeType: 'text/markdown', text: '# The .recast format' })
  })
})
