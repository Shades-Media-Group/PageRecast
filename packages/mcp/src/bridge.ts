/**
 * The local bridge between the MCP server and the PageRecast Figma plugin: a tiny
 * HTTP server on 127.0.0.1 that holds captures until the plugin, polling from its
 * UI iframe, downloads them. The protocol is documented in docs/guides/mcp.md.
 *
 * Nothing here reaches beyond this machine. A random pairing code, generated per
 * bridge, guards every file route; the Host check stops DNS rebinding, and CORS
 * answers only the plugin iframe's `null` origin and figma.com.
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const DEFAULT_PORT = 7357
export const PROTOCOL = 1
const APP = 'pagerecast-bridge'
/** The plugin iframe's opaque origin, and Figma itself. */
const ORIGINS = new Set(['null', 'https://www.figma.com', 'https://figma.com'])
const MAX_FILES = 20
const MAX_BYTES = 256 * 1024 * 1024
/** The plugin counts as connected when it polled this recently. */
const CONNECTED_MS = 10_000

export interface PendingFile {
  id: string
  name: string
  title: string
  url: string
  size: number
  createdAt: string
}

export interface Queued {
  file: PendingFile
  pairingCode: string
  bridgeUrl: string
  /** Whether the plugin polled in the last 10 seconds. */
  pluginConnected: boolean
}

export class BridgeError extends Error {}

/** `XXXX-XXXX-XXXX-XXXX` in Crockford base32 (no I, L, O or U): 80 random bits. */
export function pairingCode(): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  const chars = [...randomBytes(16)].map((b) => alphabet[b % 32])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

const sameCode = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export interface BridgeOptions {
  port?: number
  /** Where the owner of the port writes its pairing code for other MCP servers. */
  stateFile?: string
  version?: string
}

export const defaultStateFile = () => join(homedir(), '.pagerecast', 'bridge.json')

export interface Bridge {
  url: string
  pairingCode: string
  port: number
  add(bytes: Uint8Array, meta: Omit<PendingFile, 'id' | 'size' | 'createdAt'>): PendingFile
  pluginConnected(): boolean
  close(): Promise<void>
}

/** Starts the bridge on 127.0.0.1. Rejects with EADDRINUSE when the port is taken. */
export async function startBridge(options: BridgeOptions = {}): Promise<Bridge> {
  const code = pairingCode()
  const files = new Map<string, { meta: PendingFile; bytes: Uint8Array }>()
  let lastPoll = 0

  const add: Bridge['add'] = (bytes, meta) => {
    const file: PendingFile = {
      id: randomUUID(),
      ...meta,
      size: bytes.length,
      createdAt: new Date().toISOString(),
    }
    files.set(file.id, { meta: file, bytes })
    // ponytail: drop the oldest past 20; the plugin drains the queue on every poll.
    while (files.size > MAX_FILES) files.delete(files.keys().next().value!)
    return file
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) send(res, 500, { error: (error as Error).message })
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin
    if (origin !== undefined && !ORIGINS.has(origin))
      return send(res, 403, { error: 'This origin may not use the PageRecast bridge.' })
    if (origin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    // DNS rebinding: a page on evil.example resolving to 127.0.0.1 still sends its own Host.
    const port = (server.address() as { port: number }).port
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`)
      return send(res, 403, { error: 'Use http://127.0.0.1 or http://localhost.' })

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-PageRecast-Meta',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      })
      return res.end()
    }

    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    if (req.method === 'GET' && path === '/v1/status')
      return send(res, 200, { app: APP, protocol: PROTOCOL, version: options.version ?? '' })

    const match = /^\/v1\/files(?:\/([\w-]+))?$/.exec(path)
    if (!match) return send(res, 404, { error: 'No such route. See docs/guides/mcp.md.' })
    const auth = req.headers.authorization ?? ''
    const given = auth.startsWith('Bearer ') ? auth.slice(7).trim().toUpperCase() : ''
    if (!sameCode(given, code))
      return send(res, 401, {
        error: 'Wrong or missing pairing code. Ask the agent for the current one.',
      })

    const id = match[1]
    if (!id && req.method === 'GET') {
      lastPoll = Date.now()
      return send(res, 200, { files: [...files.values()].map((f) => f.meta) })
    }
    if (!id && req.method === 'POST') {
      const bytes = await body(req)
      let meta: Partial<PendingFile>
      try {
        meta =
          JSON.parse(decodeURIComponent(String(req.headers['x-pagerecast-meta'] ?? '{}'))) ?? {}
      } catch {
        return send(res, 400, { error: 'X-PageRecast-Meta must be URI-encoded JSON.' })
      }
      if (bytes === null) return send(res, 413, { error: 'The file is larger than 256 MB.' })
      if (!bytes.length) return send(res, 400, { error: 'The request has no file.' })
      const file = add(bytes, {
        name: String(meta.name ?? 'capture.recast'),
        title: String(meta.title ?? ''),
        url: String(meta.url ?? ''),
      })
      return send(res, 201, { file, pluginConnected: Date.now() - lastPoll < CONNECTED_MS })
    }
    const entry = id ? files.get(id) : undefined
    if (!entry) return send(res, 404, { error: 'No pending file with this id.' })
    if (req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(entry.bytes.length),
      })
      return res.end(entry.bytes)
    }
    if (req.method === 'DELETE') {
      files.delete(entry.meta.id)
      res.writeHead(204)
      return res.end()
    }
    return send(res, 405, { error: 'Method not allowed.' })
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? DEFAULT_PORT, '127.0.0.1', () => resolve())
  })
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}`
  if (options.stateFile) await writeState(options.stateFile, { port, pairingCode: code })
  return {
    url,
    port,
    pairingCode: code,
    add,
    pluginConnected: () => Date.now() - lastPoll < CONNECTED_MS,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

function send(res: ServerResponse, status: number, json: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(json))
}

/** The request body, or null past 256 MB. */
async function body(req: IncomingMessage): Promise<Uint8Array | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BYTES) return null
    chunks.push(chunk)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

interface BridgeState {
  port: number
  pairingCode: string
}

async function writeState(path: string, state: BridgeState) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(state), { mode: 0o600 })
}

/**
 * Queues a capture for the plugin. The first MCP server on this machine owns the
 * port; any other one posts to it with the code the owner wrote to `stateFile`.
 */
export class FigmaBridge {
  private bridge: Bridge | undefined
  constructor(private options: Required<BridgeOptions>) {}

  async send(bytes: Uint8Array, meta: Omit<PendingFile, 'id' | 'size' | 'createdAt'>) {
    if (!this.bridge) {
      try {
        this.bridge = await startBridge(this.options)
        process.stderr.write(
          `PageRecast bridge on ${this.bridge.url}. Pairing code: ${this.bridge.pairingCode}\n`,
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
        return this.post(bytes, meta)
      }
    }
    const file = this.bridge.add(bytes, meta)
    return {
      file,
      pairingCode: this.bridge.pairingCode,
      bridgeUrl: this.bridge.url,
      pluginConnected: this.bridge.pluginConnected(),
    } satisfies Queued
  }

  /** Hands the file to the bridge another PageRecast MCP server already runs. */
  private async post(bytes: Uint8Array, meta: Omit<PendingFile, 'id' | 'size' | 'createdAt'>) {
    const url = `http://127.0.0.1:${this.options.port}`
    const status = await fetch(`${url}/v1/status`)
      .then((r) => r.json() as Promise<{ app?: string }>)
      .catch(() => ({ app: undefined }))
    if (status.app !== APP)
      throw new BridgeError(
        `Port ${this.options.port} is taken by another program. Set PAGERECAST_BRIDGE_PORT to a free port in the MCP server's environment and the same port in the plugin, or import the file by dropping it on the plugin window.`,
      )
    let state: BridgeState
    try {
      state = JSON.parse(await readFile(this.options.stateFile, 'utf8')) as BridgeState
    } catch {
      throw new BridgeError(
        `Another PageRecast MCP server runs the bridge on port ${this.options.port}, but its pairing file ${this.options.stateFile} is unreadable. Restart that agent session, or import the file by dropping it on the plugin window.`,
      )
    }
    const response = await fetch(`${url}/v1/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.pairingCode}`,
        'Content-Type': 'application/octet-stream',
        'X-PageRecast-Meta': encodeURIComponent(JSON.stringify(meta)),
      },
      body: bytes as BodyInit,
    })
    const json = (await response.json()) as { file: PendingFile; pluginConnected: boolean } & {
      error?: string
    }
    if (!response.ok) throw new BridgeError(`The bridge refused the file: ${json.error}`)
    return {
      file: json.file,
      pairingCode: state.pairingCode,
      bridgeUrl: url,
      pluginConnected: json.pluginConnected,
    } satisfies Queued
  }

  async close() {
    await this.bridge?.close()
  }
}
