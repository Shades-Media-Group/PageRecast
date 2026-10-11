import { describe, expect, it } from 'vitest'
import { CLIPBOARD_PREFIX, SceneError, decode, encodeClipboard, encodeFile } from './codec'
import { SCENE_FORMAT, SCENE_VERSION, type RecastFile } from './types'

const file: RecastFile = {
  format: SCENE_FORMAT,
  version: SCENE_VERSION,
  generator: { name: 'PageRecast', version: '1.0.0', surface: 'extension' },
  source: {
    url: 'https://example.com/',
    title: 'Example — ünïcödé',
    capturedAt: '2026-10-10T00:00:00.000Z',
  },
  assets: {},
  captures: [
    {
      id: 'c1',
      label: 'Desktop · 1440 · Light',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      theme: 'light',
      scope: 'page',
      width: 1440,
      height: 2000,
      root: {
        type: 'frame',
        id: 'n0',
        key: 'html',
        name: 'Example',
        tag: 'html',
        x: 0,
        y: 0,
        width: 1440,
        height: 2000,
        fills: [],
        clips: true,
        position: 'static',
        children: [],
      },
    },
  ],
}

describe('scene codec', () => {
  it('round-trips a file through gzip', async () => {
    const bytes = await encodeFile(file)
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b])
    expect(await decode(bytes)).toEqual(file)
  })

  it('round-trips a clipboard payload', async () => {
    const text = await encodeClipboard(file)
    expect(text.startsWith(CLIPBOARD_PREFIX)).toBe(true)
    expect(await decode(text)).toEqual(file)
  })

  it('accepts plain JSON text', async () => {
    expect(await decode(JSON.stringify(file))).toEqual(file)
  })

  it('rejects unrelated input with a readable error', async () => {
    await expect(decode('{"hello":1}')).rejects.toThrow(SceneError)
    await expect(decode('not json')).rejects.toThrow('This is not a PageRecast capture.')
  })

  it('rejects captures from a newer format version', async () => {
    await expect(decode(JSON.stringify({ ...file, version: 99 }))).rejects.toThrow(
      'newer PageRecast',
    )
  })

  it('keeps valid states and drops malformed ones', async () => {
    const button = {
      ...file.captures[0]!.root,
      id: 'n1',
      key: 'html/button1',
      states: { hover: { 'html/button1': { fills: [], opacity: 0.8 } } },
    }
    const broken = {
      ...button,
      id: 'n2',
      key: 'html/button2',
      states: { hover: { k: { x: 'a' } } },
    }
    const withStates = structuredClone(file)
    withStates.captures[0]!.root.children = [button, broken as unknown as typeof button]
    const decoded = await decode(JSON.stringify(withStates))
    const [kept, dropped] = decoded.captures[0]!.root.children as (typeof button)[]
    expect(kept!.states).toEqual(button.states)
    expect(dropped!.states).toBeUndefined()
  })
})
