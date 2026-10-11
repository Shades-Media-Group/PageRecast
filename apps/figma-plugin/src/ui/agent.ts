/**
 * The plugin's side of the agent bridge (docs/guides/mcp.md#bridge-protocol):
 * an AI agent's PageRecast MCP server holds captures on 127.0.0.1, and this
 * window, while listening, polls for them and imports each one.
 */

export const BRIDGE_URL = 'http://127.0.0.1:7357'
const POLL_MS = 2_000
/** Slower while no agent runs, so an idle plugin stays quiet. */
const SEARCH_MS = 4_000

export interface BridgeFile {
  id: string
  name: string
  title: string
  url: string
  size: number
  createdAt: string
}

export type AgentState =
  | { kind: 'off' }
  /** No agent's bridge answers on this computer. */
  | { kind: 'searching' }
  /** A bridge answers and needs the pairing code. */
  | { kind: 'pairing'; error?: string }
  | { kind: 'connected'; last?: string }

export class Unauthorized extends Error {}

/** Normalises what the user types to XXXX-XXXX-XXXX-XXXX: any separators, any case. */
export const cleanCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/(.{4})(?=.)/g, '$1-')

export class BridgeClient {
  constructor(
    private base = BRIDGE_URL,
    private fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** Whether a PageRecast bridge answers. */
  async found(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.base}/v1/status`)
      const body = (await res.json()) as { app?: string }
      return body.app === 'pagerecast-bridge'
    } catch {
      return false
    }
  }

  private async call(code: string, path: string, init: RequestInit = {}) {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cleanCode(code)}` },
    })
    if (res.status === 401) throw new Unauthorized('The pairing code does not match.')
    if (!res.ok) throw new Error(`The bridge answered ${res.status}.`)
    return res
  }

  /** Files waiting for this window, oldest first. Throws Unauthorized on a wrong code. */
  async list(code: string): Promise<BridgeFile[]> {
    const res = await this.call(code, '/v1/files')
    return ((await res.json()) as { files: BridgeFile[] }).files
  }

  /** Downloads a file and removes it from the queue, so it imports once. */
  async take(code: string, id: string): Promise<Uint8Array> {
    const res = await this.call(code, `/v1/files/${encodeURIComponent(id)}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    await this.call(code, `/v1/files/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return bytes
  }
}

export interface ListenOptions {
  client?: BridgeClient
  code: () => string
  /** False while a review or an import is on screen; files wait until then. */
  ready: () => boolean
  onState: (state: AgentState) => void
  onFile: (file: BridgeFile, bytes: Uint8Array) => void
  /** The stored code stopped working: the agent session restarted. */
  onUnauthorized: () => void
}

/** Polls until the returned function is called. */
export function listen(options: ListenOptions): () => void {
  const client = options.client ?? new BridgeClient()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = async () => {
    let delay = POLL_MS
    const code = options.code()
    try {
      if (!code) {
        const found = await client.found()
        options.onState(found ? { kind: 'pairing' } : { kind: 'searching' })
        if (!found) delay = SEARCH_MS
      } else {
        const files = await client.list(code)
        if (stopped) return
        const next = files[0]
        if (next && options.ready()) {
          const bytes = await client.take(code, next.id)
          if (stopped) return
          options.onState({ kind: 'connected', last: next.title || next.name })
          options.onFile(next, bytes)
        } else options.onState({ kind: 'connected' })
      }
    } catch (error) {
      if (error instanceof Unauthorized) {
        options.onUnauthorized()
        options.onState({
          kind: 'pairing',
          error: 'The agent has a new pairing code. Enter the code it shows now.',
        })
      } else {
        options.onState({ kind: 'searching' })
        delay = SEARCH_MS
      }
    }
    if (!stopped) timer = setTimeout(tick, delay)
  }

  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
