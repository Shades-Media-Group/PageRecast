import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { FrameNode, SceneNode, TextNode } from '@pagerecast/scene'
import type { WalkResult } from '@pagerecast/capture'

const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).href

let bundle = ''
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../packages/capture/src/global.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    write: false,
  })
  bundle = result.outputFiles[0]!.text
})

function all(node: SceneNode): SceneNode[] {
  return node.type === 'frame' ? [node, ...node.children.flatMap(all)] : [node]
}

async function capture(page: Page, states = false): Promise<WalkResult> {
  await page.addScriptTag({ content: bundle })
  return page.evaluate((states) => {
    const api = window.__pagerecast!
    const restore = api.prepare(document, { hideOverlays: true, freezeAnimations: true })
    try {
      return api.walk(document, { scope: 'page', states })
    } finally {
      restore()
    }
  }, states)
}

test('captures the kitchen sink faithfully', async ({ page }) => {
  await page.goto(fixture('kitchen-sink.html'))
  const result = await capture(page)
  const nodes = all(result.root)
  const texts = nodes.filter((n): n is TextNode => n.type === 'text')
  const textOf = (t: TextNode) => t.runs.map((r) => r.text).join('')

  // Root is the page with the body background.
  expect(result.root.width).toBe(1280)
  expect(result.root.fills[0]).toMatchObject({ type: 'solid' })

  // Inline styles become runs of one text node.
  const heading = texts.find((t) => textOf(t) === 'Hello bold world')!
  // <strong> inside <h1> computes to `bolder`, which is 900.
  expect(heading.runs.map((r) => [r.text, r.style.fontWeight])).toEqual([
    ['Hello ', 700],
    ['bold', 900],
    [' world', 700],
  ])

  // Wrapped paragraphs report their line count.
  const paragraph = texts.find((t) => textOf(t).startsWith('A paragraph'))!
  expect(paragraph.lines).toBeGreaterThan(1)

  // The header is a flex row with a gradient fill.
  const header = nodes.find((n): n is FrameNode => n.type === 'frame' && n.tag === 'header')!
  expect(header.layout).toMatchObject({
    direction: 'row',
    justify: 'space-between',
    align: 'center',
    gap: [24, 24],
  })
  expect(header.fills[0]).toMatchObject({ type: 'linear', angle: 90 })

  // Card styling.
  const card = nodes.find((n): n is FrameNode => n.type === 'frame' && n.name === 'Section')!
  expect(card.radius).toEqual([16, 16, 16, 16])
  expect(card.stroke).toMatchObject({
    widths: [2, 2, 2, 2],
    color: { r: 0, g: 128 / 255, b: 0, a: 1 },
  })
  expect(card.shadows?.[0]).toMatchObject({ y: 8, blur: 24, spread: -4 })

  // Pseudo-element content is captured as real text.
  expect(texts.some((t) => textOf(t) === 'NEW')).toBe(true)

  // Images, SVGs with resolved currentColor, and inputs.
  const image = nodes.find((n) => n.type === 'image')!
  expect(image).toMatchObject({ width: 40, height: 40, name: 'Image "Red pixel"' })
  expect(image).not.toHaveProperty('position')
  // object-position and background-position keep the visible crop.
  const cropped = nodes.find((n) => n.type === 'image' && n.name.includes('Cropped'))
  expect(cropped).toMatchObject({ fit: 'fill', position: [0.5, 0] })
  const cover = nodes.find((n) => n.type === 'frame' && n.html === 'div.cover') as FrameNode
  expect(cover.fills.at(-1)).toMatchObject({ type: 'image', fit: 'fill', position: [0.5, 1] })
  const svg = nodes.find((n) => n.type === 'svg')!
  const markup = (result.assets[(svg as { asset: string }).asset] as { markup: string }).markup
  expect(markup).toContain('rgb(0, 128, 255)')
  expect(texts.some((t) => textOf(t) === 'Email address')).toBe(true)

  // Gradient text keeps its gradient.
  const gradientText = texts.find((t) => textOf(t) === 'Gradient headline')!
  expect(gradientText.paint).toMatchObject({ type: 'linear' })

  // Rotation is recovered with the untransformed size.
  const rotated = nodes.find((n) => n.rotation)!
  expect(rotated.rotation).toBe(45)
  expect(Math.round(rotated.width)).toBe(100)

  // Hidden content and the link label.
  expect(texts.some((t) => textOf(t) === 'Never captured')).toBe(false)
  expect(nodes.some((n) => n.name === 'Link "Pricing"')).toBe(true)

  // The page is restored afterwards.
  expect(await page.locator('pr-pseudo').count()).toBe(0)
})

test('records interaction states only when asked', async ({ page }) => {
  await page.goto(fixture('states.html'))
  const off = all((await capture(page)).root)
  expect(off.some((n) => 'states' in n)).toBe(false)

  const nodes = all((await capture(page, true)).root)
  const frame = (html: string) =>
    nodes.find((n): n is FrameNode => n.type === 'frame' && n.html === html)!
  const red = { r: 1, g: 0, b: 0, a: 1 }

  // Hover changes the button and, through `.btn:hover .dot`, its child.
  const button = frame('button.btn')
  const dot = frame('span.dot')
  expect(button.states?.hover?.[button.key]?.fills).toEqual([{ type: 'solid', color: red }])
  expect(button.states?.hover?.[dot.key]?.fills).toEqual([
    { type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } },
  ])
  // Focus-visible draws an outline; active presses (opacity) while hovering.
  expect(button.states?.focus?.[button.key]?.outline).toEqual({
    width: 2,
    offset: 2,
    color: { r: 0, g: 128 / 255, b: 0, a: 1 },
    style: 'solid',
  })
  expect(button.states?.active?.[button.key]).toMatchObject({
    opacity: 0.5,
    fills: [{ color: red }],
  })

  // Text links: colour and underline inside @media; `li:hover > a` via the ancestor.
  const link = frame('a.link')
  const hover = Object.values(link.states?.hover ?? {})[0]
  expect(hover).toEqual({
    color: { r: 128 / 255, g: 0, b: 128 / 255, a: 1 },
    decoration: 'underline',
  })
  const item = nodes.find((n): n is FrameNode => n.type === 'frame' && n.key.endsWith('/li1/a1'))!
  expect(Object.values(item.states?.hover ?? {})[0]?.color).toEqual({
    r: 1,
    g: 128 / 255,
    b: 0,
    a: 1,
  })

  // CSS nesting and tabindex elements.
  const nested = frame('div.nested')
  expect(nested.states?.hover?.[nested.key]?.fills).toBeDefined()

  // No state rules, or only `:not(:hover)`: nothing recorded.
  expect(nodes.some((n) => n.type === 'frame' && n.html === 'button.plain' && n.states)).toBe(false)
  expect(nodes.some((n) => n.type === 'frame' && n.html === 'a.calm' && n.states)).toBe(false)

  // The page is left as it was.
  expect(await page.locator('[data-pr-state], style[data-pagerecast-states]').count()).toBe(0)
})
