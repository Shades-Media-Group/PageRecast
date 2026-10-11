import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BridgeError, FigmaBridge, pairingCode, startBridge, type Bridge } from './bridge'

const meta = { name: 'example.com.recast', title: 'Exämple', url: 'https://example.com/' }
const bytes = new Uint8Array([0x1f, 0x8b, 1, 2, 3])
const open: { close(): Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((b) => b.close()))
})

async function bridge(): Promise<Bridge> {
  const b = await startBridge({ port: 0 })
  open.push(b)
  return b
}

const auth = (code: string) => ({ Authorization: `Bearer ${code}` })

describe('pairing code', () => {
  it('is four groups of four base32 characters, different every time', () => {
    const code = pairingCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
    expect(pairingCode()).not.toBe(code)
  })
})

describe('bridge', () => {
  it('answers its status without a code', async () => {
    const b = await bridge()
    const res = await fetch(`${b.url}/v1/status`)
    expect(await res.json()).toMatchObject({ app: 'pagerecast-bridge', protocol: 1 })
  })

  it('serves a queued file to a client with the code, then forgets it', async () => {
    const b = await bridge()
    expect(b.pluginConnected()).toBe(false)
    const queued = b.add(bytes, meta)

    const list = await fetch(`${b.url}/v1/files`, { headers: auth(b.pairingCode) })
    expect(await list.json()).toEqual({ files: [queued] })
    expect(b.pluginConnected()).toBe(true)

    const file = await fetch(`${b.url}/v1/files/${queued.id}`, { headers: auth(b.pairingCode) })
    expect(file.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)

    const del = await fetch(`${b.url}/v1/files/${queued.id}`, {
      method: 'DELETE',
      headers: auth(b.pairingCode),
    })
    expect(del.status).toBe(204)
    const after = await fetch(`${b.url}/v1/files`, { headers: auth(b.pairingCode) })
    expect(await after.json()).toEqual({ files: [] })
  })

  it('accepts a posted file and lower-case codes', async () => {
    const b = await bridge()
    const res = await fetch(`${b.url}/v1/files`, {
      method: 'POST',
      headers: {
        ...auth(b.pairingCode.toLowerCase()),
        'X-PageRecast-Meta': encodeURIComponent(JSON.stringify(meta)),
      },
      body: bytes,
    })
    expect(res.status).toBe(201)
    const { file } = (await res.json()) as { file: { id: string; title: string; size: number } }
    expect(file).toMatchObject({ title: 'Exämple', size: bytes.length })
  })

  it('rejects a missing or wrong code', async () => {
    const b = await bridge()
    b.add(bytes, meta)
    expect((await fetch(`${b.url}/v1/files`)).status).toBe(401)
    const wrong = await fetch(`${b.url}/v1/files`, { headers: auth(pairingCode()) })
    expect(wrong.status).toBe(401)
    expect(((await wrong.json()) as { error: string }).error).toMatch(/pairing code/)
  })

  it('answers the plugin iframe preflight and refuses other origins', async () => {
    const b = await bridge()
    const preflight = await fetch(`${b.url}/v1/files`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'null',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('null')
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/Authorization/)
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true')

    const evil = await fetch(`${b.url}/v1/status`, { headers: { Origin: 'https://evil.example' } })
    expect(evil.status).toBe(403)
  })

  it('refuses requests addressed to another host name (DNS rebinding)', async () => {
    const b = await bridge()
    const { request } = await import('node:http')
    const status = await new Promise<number>((resolve) => {
      request(`${b.url}/v1/status`, { headers: { Host: `evil.example:${b.port}` } }, (res) =>
        resolve(res.statusCode ?? 0),
      ).end()
    })
    expect(status).toBe(403)
  })
})

describe('FigmaBridge', () => {
  it('starts the bridge once, and a second server posts to it with the shared code', async () => {
    const stateFile = join(await mkdtemp(join(tmpdir(), 'pagerecast-bridge-')), 'bridge.json')
    // Find a free port, then let both servers aim at it.
    const probe = await startBridge({ port: 0 })
    const port = probe.port
    await probe.close()

    const first = new FigmaBridge({ port, stateFile, version: 'test' })
    const second = new FigmaBridge({ port, stateFile, version: 'test' })
    open.push(first, second)

    const a = await first.send(bytes, meta)
    const b = await second.send(bytes, { ...meta, title: 'Second' })
    expect(b.pairingCode).toBe(a.pairingCode)
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toEqual({
      port,
      pairingCode: a.pairingCode,
    })

    const list = await fetch(`${a.bridgeUrl}/v1/files`, { headers: auth(a.pairingCode) })
    const { files } = (await list.json()) as { files: { title: string }[] }
    expect(files.map((f) => f.title)).toEqual(['Exämple', 'Second'])
  })

  it('says what to do when another program holds the port', async () => {
    const { createServer } = await import('node:http')
    const other = createServer((_req, res) => res.end('hello'))
    await new Promise<void>((r) => other.listen(0, '127.0.0.1', () => r()))
    open.push({ close: () => new Promise<void>((r) => other.close(() => r())) })
    const port = (other.address() as { port: number }).port

    const b = new FigmaBridge({ port, stateFile: join(tmpdir(), 'unused.json'), version: 'test' })
    await expect(b.send(bytes, meta)).rejects.toThrow(BridgeError)
    await expect(b.send(bytes, meta)).rejects.toThrow(/PAGERECAST_BRIDGE_PORT/)
  })
})
