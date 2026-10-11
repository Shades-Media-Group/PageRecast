import { describe, expect, it } from 'vitest'
import type { FrameNode, ImageNode, SceneNode, TextNode } from '@pagerecast/scene'
import { differences, findPatterns, hash, signatures } from './patterns'

const black = { r: 0, g: 0, b: 0, a: 1 }
const style = {
  fontFamily: ['Arial'],
  fontWeight: 400,
  italic: false,
  fontSize: 16,
  lineHeight: null,
  letterSpacing: 0,
  color: black,
  decoration: 'none' as const,
  transform: 'none' as const,
}

let ids = 0
function text(content: string, x: number, y: number, extra: Partial<TextNode> = {}): TextNode {
  return {
    type: 'text',
    id: `t${ids++}`,
    key: `k${ids}/#text`,
    name: content,
    tag: 'h3',
    x,
    y,
    width: content.length * 8,
    height: 20,
    style,
    runs: [{ text: content, style }],
    align: 'left',
    lines: 1,
    ...extra,
  }
}
function image(asset: string, x: number, y: number): ImageNode {
  return {
    type: 'image',
    id: `i${ids++}`,
    key: `k${ids}`,
    name: 'Image',
    tag: 'img',
    x,
    y,
    width: 200,
    height: 120,
    asset,
    fit: 'crop',
  }
}
function frame(
  x: number,
  y: number,
  children: SceneNode[],
  extra: Partial<FrameNode> = {},
): FrameNode {
  return {
    type: 'frame',
    id: `f${ids++}`,
    key: `k${ids}`,
    name: 'Card',
    tag: 'article',
    x,
    y,
    width: 200,
    height: 180,
    fills: [{ type: 'solid', color: black }],
    radius: [8, 8, 8, 8],
    clips: true,
    position: 'static',
    children,
    ...extra,
  }
}
const card = (x: number, title: string, asset: string, extra: Partial<FrameNode> = {}) =>
  frame(x, 0, [image(asset, x, 0), text(title, x + 16, 140)], extra)
const page = (children: SceneNode[]) =>
  frame(0, 0, children, { width: 1000, height: 1000, name: 'Page', tag: 'body' })
const assets = { a: { kind: 'image' as const, mime: 'image/png', width: 1, height: 1 } }

describe('hash', () => {
  it('is stable and distinguishes close strings', () => {
    expect(hash('card')).toBe(hash('card'))
    expect(hash('card')).not.toBe(hash('cards'))
  })
})

describe('signatures', () => {
  it('ignores text content, image assets and position, not styles or sizes', () => {
    const a = card(0, 'Alpha', 'a')
    const b = card(300, 'A longer title', 'b')
    const sigs = signatures(page([a, b]), assets)
    expect(sigs.get(a)).toBe(sigs.get(b))

    const taller = card(600, 'Alpha', 'a', { height: 184 })
    const rounder = card(600, 'Alpha', 'a', { radius: [12, 12, 12, 12] })
    const sigs2 = signatures(page([a, taller, rounder]), assets)
    expect(sigs2.get(taller)).not.toBe(sigs2.get(a))
    expect(sigs2.get(rounder)).not.toBe(sigs2.get(a))
  })

  it('tolerates sub-pixel size differences', () => {
    const a = card(0, 'Alpha', 'a', { width: 333.33 })
    const b = card(300, 'Beta', 'b', { width: 333.36 })
    const sigs = signatures(page([a, b]), assets)
    expect(sigs.get(a)).toBe(sigs.get(b))
  })

  it('compares text and images strictly inside elements with states', () => {
    const link = (label: string) =>
      frame(0, 0, [text(label, 0, 0)], {
        tag: 'a',
        states: { hover: { x: { opacity: 0.5 } } },
      })
    const a = link('One')
    const b = link('Two')
    const sigs = signatures(page([a, b]), assets)
    expect(sigs.get(a)).not.toBe(sigs.get(b))
  })
})

describe('findPatterns', () => {
  it('groups repeated cards and lists the first occurrence first', () => {
    const cards = [card(0, 'One', 'a'), card(220, 'Two', 'b'), card(440, 'Three', 'a')]
    const patterns = findPatterns(page([...cards, text('Footer', 0, 900)]), assets)
    const pattern = patterns.get(cards[0]!)
    expect(pattern?.nodes).toEqual(cards)
    expect(patterns.get(cards[2]!)).toBe(pattern)
  })

  it('needs at least two occurrences and skips elements with states', () => {
    const lone = card(0, 'One', 'a')
    const buttons = [0, 100].map((x) =>
      frame(x, 500, [text('Go', x, 500)], { tag: 'button', states: { hover: {} } }),
    )
    expect(findPatterns(page([lone, ...buttons]), assets).size).toBe(0)
  })

  it('does not nest occurrences, and drops patterns that only repeat inside one', () => {
    const tag = (x: number) => frame(x, 10, [text('New', x, 10)], { width: 40, height: 20 })
    const withTag = (x: number) => frame(x, 0, [tag(x + 4), text('Title', x, 40)])
    const outer = [withTag(0), withTag(300)]
    const patterns = findPatterns(page(outer), assets)
    expect(patterns.size).toBe(2)
    expect([...new Set(patterns.values())]).toHaveLength(1)

    // The same tag also standing alone twice makes it a pattern of its own.
    const loose = [tag(700), tag(800)]
    const both = findPatterns(page([...outer, ...loose]), assets)
    expect(both.get(loose[0]!)?.nodes).toEqual(loose)
  })
})

describe('differences', () => {
  it('lists the text, link and image overrides', () => {
    const main = card(0, 'One', 'a')
    const other = card(220, 'Two', 'b')
    ;(other.children[1] as TextNode).style = { ...style, href: 'https://x.test/' }
    const diffs = differences(main, other)
    expect(diffs).toEqual([
      { node: main.children[0], asset: 'b' },
      { node: main.children[1], text: 'Two', name: 'Two', href: 'https://x.test/' },
    ])
    expect(differences(main, card(500, 'One', 'a'))).toEqual([])
  })
})
