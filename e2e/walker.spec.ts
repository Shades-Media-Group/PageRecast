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

async function capture(page: Page): Promise<WalkResult> {
  await page.addScriptTag({ content: bundle })
  return page.evaluate(() => {
    const api = window.__pagerecast!
    const restore = api.prepare(document, { hideOverlays: true, freezeAnimations: true })
    try {
      return api.walk(document, { scope: 'page' })
    } finally {
      restore()
    }
  })
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
