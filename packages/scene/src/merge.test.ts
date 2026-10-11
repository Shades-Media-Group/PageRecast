import { describe, expect, it } from 'vitest'
import type { RecastFile } from './types'
import { mergeFiles } from './merge'

const file = (title: string): RecastFile => ({
  format: 'pagerecast/scene',
  version: 1,
  generator: { name: 'PageRecast', version: '1.0.0', surface: 'extension' },
  source: { url: `https://example.com/${title}`, title, capturedAt: '' },
  captures: [
    {
      id: 'c1',
      label: 'Desktop · 1440 · Light',
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
      theme: 'light',
      scope: 'page',
      width: 1440,
      height: 900,
      screenshot: 'c1-screenshot',
      root: {
        type: 'frame',
        id: 'n1',
        key: 'body',
        name: 'body',
        tag: 'body',
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
        clips: false,
        position: 'static',
        fills: [{ type: 'image', asset: 'c1-a1', fit: 'fill' }],
        children: [
          {
            type: 'image',
            id: 'n2',
            key: 'img',
            name: 'img',
            tag: 'img',
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            asset: 'c1-a1',
            fit: 'fill',
          },
        ],
      },
    },
  ],
  assets: {
    'c1-a1': { kind: 'svg', markup: `<svg>${title}</svg>` },
    'c1-screenshot': { kind: 'image', mime: 'image/png', width: 1, height: 1, data: title },
  },
})

describe('mergeFiles', () => {
  it('keeps a single file as it is', () => {
    const one = file('home')
    expect(mergeFiles([one])).toBe(one)
  })

  it('makes ids unique and keeps every reference pointing at its own asset', () => {
    const merged = mergeFiles([file('home'), file('pricing')])
    expect(merged.source.title).toBe('2 pages')
    expect(merged.captures.map((c) => c.id)).toEqual(['p1-c1', 'p2-c1'])
    expect(merged.captures.map((c) => c.label)).toEqual([
      'home · Desktop · 1440 · Light',
      'pricing · Desktop · 1440 · Light',
    ])
    expect(Object.keys(merged.assets)).toHaveLength(4)
    for (const [index, capture] of merged.captures.entries()) {
      const page = index === 0 ? 'home' : 'pricing'
      expect(merged.assets[capture.screenshot!]).toMatchObject({ data: page })
      const fill = capture.root.fills[0]!
      expect(fill.type === 'image' && merged.assets[fill.asset]).toMatchObject({
        markup: `<svg>${page}</svg>`,
      })
      const child = capture.root.children[0]!
      expect(child.type === 'image' && merged.assets[child.asset]).toMatchObject({
        markup: `<svg>${page}</svg>`,
      })
    }
  })
})
