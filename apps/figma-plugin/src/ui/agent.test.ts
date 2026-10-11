import { afterEach, describe, expect, it, vi } from 'vitest'
// The real bridge the MCP server runs, so client and server cannot drift apart.
import { startBridge, type Bridge } from '../../../../packages/mcp/src/bridge'
import { BridgeClient, cleanCode, listen, Unauthorized, type AgentState } from './agent'

const meta = { name: 'example.com.recast', title: 'Example', url: 'https://example.com/' }
let bridge: Bridge | undefined
afterEach(async () => {
  await bridge?.close()
  bridge = undefined
})

describe('agent bridge client', () => {
  it('finds a bridge, lists, takes and removes a file', async () => {
    bridge = await startBridge({ port: 0 })
    const client = new BridgeClient(bridge.url)
    expect(await client.found()).toBe(true)
    const queued = bridge.add(new Uint8Array([1, 2, 3]), meta)

    const code = bridge.pairingCode.toLowerCase().replace(/-/g, ' - ')
    expect(cleanCode(code)).toBe(bridge.pairingCode)
    expect(await client.list(code)).toEqual([queued])
    expect(await client.take(code, queued.id)).toEqual(new Uint8Array([1, 2, 3]))
    expect(await client.list(code)).toEqual([])
  })

  it('tells a wrong code apart from no bridge', async () => {
    bridge = await startBridge({ port: 0 })
    await expect(new BridgeClient(bridge.url).list('AAAA-AAAA-AAAA-AAAA')).rejects.toThrow(
      Unauthorized,
    )
    expect(await new BridgeClient('http://127.0.0.1:9').found()).toBe(false)
  })

  it('listens: pairs, imports when ready, and re-pairs after a restart', async () => {
    bridge = await startBridge({ port: 0 })
    const client = new BridgeClient(bridge.url)
    const states: AgentState[] = []
    let code = ''
    let ready = false
    const onFile = vi.fn()
    const onUnauthorized = vi.fn(() => (code = ''))
    const stop = listen({
      client,
      code: () => code,
      ready: () => ready,
      onState: (s) => states.push(s),
      onFile,
      onUnauthorized,
    })
    try {
      await vi.waitFor(() => expect(states.at(-1)).toEqual({ kind: 'pairing' }))
      code = bridge.pairingCode
      bridge.add(new Uint8Array([9]), meta)
      // A review on screen holds the file back.
      await vi.waitFor(() => expect(states.at(-1)).toEqual({ kind: 'connected' }), {
        timeout: 5_000,
      })
      expect(onFile).not.toHaveBeenCalled()
      ready = true
      await vi.waitFor(() => expect(onFile).toHaveBeenCalledOnce(), { timeout: 5_000 })
      expect(onFile.mock.calls[0]![1]).toEqual(new Uint8Array([9]))

      code = 'AAAA-AAAA-AAAA-AAAA'
      await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalled(), { timeout: 5_000 })
      expect(states.at(-1)).toMatchObject({ kind: 'pairing', error: expect.any(String) })
    } finally {
      stop()
    }
  }, 20_000)
})
