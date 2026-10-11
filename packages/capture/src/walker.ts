import type {
  Accessibility,
  BlendMode,
  Color,
  FlexLayout,
  FrameNode,
  ImageFit,
  NodeStates,
  Outline,
  Paint,
  SceneNode,
  Scope,
  StateOverride,
  Stroke,
  TextNode,
  TextRun,
  TextStyle,
} from '@pagerecast/scene'
import {
  parseBlur,
  parseColor,
  parseGradient,
  parseShadows,
  parseTransform,
  parseUrl,
  splitTopLevel,
} from './css'
import { INTERACTIVE, collectStateRules, markState } from './states'

export type PendingAsset =
  | { kind: 'image'; url: string }
  | { kind: 'image'; dataUrl: string; width: number; height: number }
  | { kind: 'svg'; markup: string }

/** An area the capture could not describe; the extension fills it with a screenshot. */
export interface RasterRequest {
  asset: string
  x: number
  y: number
  width: number
  height: number
}

export interface WalkOptions {
  scope: Scope
  /** Required when scope is `element`. */
  target?: Element | null
  maxNodes?: number
  /** Record hover, focus and active looks of interactive elements. Off by default. */
  states?: boolean
}

export interface WalkResult {
  root: FrameNode
  width: number
  height: number
  assets: Record<string, PendingAsset>
  rasters: RasterRequest[]
  fonts: string[]
  truncated: boolean
}

const SKIP = new Set([
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'template',
  'head',
  'title',
  'base',
  'source',
  'track',
  'param',
  'map',
  'area',
  'datalist',
])
const RASTER: Record<string, 'canvas' | 'video' | 'iframe'> = {
  canvas: 'canvas',
  video: 'video',
  iframe: 'iframe',
  embed: 'iframe',
  object: 'iframe',
}
const TEXT_INPUTS = new Set([
  '',
  'text',
  'email',
  'search',
  'password',
  'number',
  'url',
  'tel',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
])
const ICON_FONT =
  /icon|awesome|material symbols|material-symbols|glyph|feather|remixicon|bootstrap-icons|ionicons/i
const BLENDS = new Set<BlendMode>([
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])
/** At most this many elements are re-measured in their states, to keep capture fast. */
const MAX_STATE_ELEMENTS = 60
/** Elements with bigger subtrees (a tabindex on <main>) are not worth re-measuring. */
const MAX_STATE_SUBTREE = 200
const STATES = ['hover', 'focus', 'active'] as const
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function flatten(nodes: SceneNode[], into = new Map<string, SceneNode>()) {
  for (const node of nodes) {
    into.set(node.key, node)
    if (node.type === 'frame') flatten(node.children, into)
  }
  return into
}

const HEADINGS: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 }
const TAG_NAMES: Record<string, string> = {
  header: 'Header',
  nav: 'Nav',
  main: 'Main',
  footer: 'Footer',
  section: 'Section',
  article: 'Article',
  aside: 'Aside',
  button: 'Button',
  a: 'Link',
  img: 'Image',
  picture: 'Image',
  input: 'Input',
  textarea: 'Text area',
  select: 'Select',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  p: 'Paragraph',
  form: 'Form',
  label: 'Label',
  figure: 'Figure',
  figcaption: 'Caption',
  table: 'Table',
  tr: 'Row',
  td: 'Cell',
  th: 'Header cell',
  blockquote: 'Quote',
  dialog: 'Dialog',
  body: 'Body',
  html: 'Page',
  video: 'Video',
  canvas: 'Canvas',
  iframe: 'Embed',
  hr: 'Divider',
  'pr-pseudo': 'Pseudo',
}

export function walk(doc: Document, options: WalkOptions): WalkResult {
  const win = doc.defaultView!
  const maxNodes = options.maxNodes ?? 6000
  const assets: Record<string, PendingAsset> = {}
  const assetIds = new Map<string, string>()
  const rasters: RasterRequest[] = []
  const fonts = new Set<string>()
  const colorCache = new Map<string, Color | null>()
  let count = 0
  let truncated = false
  // State capture: the joined selector of every rewritten state rule, the
  // re-measure budget, and outlines (read only here, never on default nodes).
  let stateSelector = ''
  let stateBudget = MAX_STATE_ELEMENTS
  let measuring = false
  let outlines = new Map<string, Outline>()

  const scrollX = win.scrollX
  const scrollY = win.scrollY
  const docEl = doc.documentElement
  // A capture is as wide as the layout viewport it was taken at. Phones zoom out
  // to fit content that overflows sideways (innerWidth grows); the frame keeps
  // the designed width and clips the overflow. Without overflow, innerWidth also
  // counts the scrollbar, which the full-width frame should include.
  const overflows = docEl.scrollWidth > docEl.clientWidth + 1
  const pageWidth = overflows ? docEl.clientWidth : win.innerWidth
  const pageHeight = Math.max(docEl.scrollHeight, doc.body?.scrollHeight ?? 0, win.innerHeight)

  let origin = { x: 0, y: 0, width: pageWidth, height: pageHeight }
  if (options.scope === 'viewport')
    origin = { x: scrollX, y: scrollY, width: win.innerWidth, height: win.innerHeight }
  if (options.scope === 'element' && options.target) {
    const r = options.target.getBoundingClientRect()
    origin = { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
  }

  // Colours in spaces the parser does not cover (oklch, lab, display-p3…) go
  // through a canvas, which converts them to sRGB.
  const ctx = doc.createElement('canvas').getContext('2d', { willReadFrequently: true })
  function color(value: string): Color | null {
    if (colorCache.has(value)) return colorCache.get(value)!
    let result = parseColor(value)
    if (!result && ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = value
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      result = a ? { r: r! / 255, g: g! / 255, b: b! / 255, a: a! / 255 } : null
    }
    colorCache.set(value, result)
    return result
  }

  function assetFor(key: string, make: () => PendingAsset): string {
    let id = assetIds.get(key)
    if (!id) {
      id = `a${assetIds.size + 1}`
      assetIds.set(key, id)
      assets[id] = make()
    }
    return id
  }

  function raster(
    reason: 'canvas' | 'video' | 'iframe' | 'icon-font' | 'form-control' | 'unsupported',
    box: Box,
    base: Base,
  ): SceneNode {
    const asset = `r${rasters.length + 1}`
    rasters.push({
      asset,
      x: box.x + origin.x,
      y: box.y + origin.y,
      width: box.width,
      height: box.height,
    })
    return { ...base, ...box, type: 'raster', asset, reason }
  }

  interface Box {
    x: number
    y: number
    width: number
    height: number
  }
  interface Base {
    id: string
    key: string
    name: string
    tag: string
    opacity?: number
    blend?: BlendMode
    rotation?: number
    a11y?: Accessibility
    html?: string
  }

  function boxOf(el: Element, cs: CSSStyleDeclaration): { box: Box; rotation: number } {
    const rect = el.getBoundingClientRect()
    const t = parseTransform(cs.transform)
    if (t.rotation === 0 && t.scaleX === 1 && t.scaleY === 1) {
      return {
        box: {
          x: rect.left + scrollX - origin.x,
          y: rect.top + scrollY - origin.y,
          width: rect.width,
          height: rect.height,
        },
        rotation: 0,
      }
    }
    // Rotated or scaled: keep the untransformed size, centred on the painted box.
    const html = el as HTMLElement
    const width = (html.offsetWidth ?? rect.width) * Math.abs(t.scaleX)
    const height = (html.offsetHeight ?? rect.height) * Math.abs(t.scaleY)
    const cx = rect.left + rect.width / 2 + scrollX - origin.x
    const cy = rect.top + rect.height / 2 + scrollY - origin.y
    return { box: { x: cx - width / 2, y: cy - height / 2, width, height }, rotation: t.rotation }
  }

  function intersects(box: Box): boolean {
    if (options.scope === 'page') return true
    return (
      box.x < origin.width &&
      box.y < origin.height &&
      box.x + box.width > 0 &&
      box.y + box.height > 0
    )
  }

  function accessibility(el: Element): Accessibility | undefined {
    const a11y: Accessibility = {}
    const role = el.getAttribute('role')
    if (role) a11y.role = role
    const label = el.getAttribute('aria-label')
    if (label) a11y.label = label.trim()
    const alt = el.getAttribute('alt')
    if (alt) a11y.alt = alt.trim()
    const heading =
      HEADINGS[el.localName] ??
      (role === 'heading' ? Number(el.getAttribute('aria-level')) || 2 : undefined)
    if (heading) a11y.heading = heading
    return Object.keys(a11y).length ? a11y : undefined
  }

  function className(el: Element): string | null {
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? '')
    for (const c of cls.split(/\s+/)) {
      // Skip generated class names (css-1x2y3z, sc-abc, _a1b2c3, tailwind utilities).
      if (!c || /^(css|sc|jsx|svelte|emotion|chakra)-|^_|[0-9a-f]{5,}|[:[\]/]/.test(c)) continue
      if (
        /^(flex|grid|p[trblxy]?-|m[trblxy]?-|w-|h-|text-|bg-|border|rounded|gap-|items-|justify-|font-)/.test(
          c,
        )
      )
        continue
      return c
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (m) => m.toUpperCase())
        .trim()
    }
    return null
  }

  function htmlName(el: Element): string {
    const id = el.id ? `#${el.id}` : ''
    const cls = (typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? ''))
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((c) => `.${c}`)
      .join('')
    return `${el.localName}${id}${cls}`
  }

  function nameFor(el: Element, a11y?: Accessibility): string {
    const tag = el.localName
    let base = TAG_NAMES[tag]
    if (HEADINGS[tag]) base = `Heading ${HEADINGS[tag]}`
    if (!base) base = className(el) ?? (el.id ? el.id : tag === 'svg' ? 'Vector' : 'Frame')
    const label =
      a11y?.label ??
      a11y?.alt ??
      (tag === 'a' || tag === 'button' ? (el.textContent ?? '').trim().slice(0, 32) : '')
    return label ? `${base} "${label.replace(/\s+/g, ' ')}"` : base
  }

  function radiusOf(
    cs: CSSStyleDeclaration,
    box: Box,
  ): [number, number, number, number] | undefined {
    const values = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ]
    const max = Math.min(box.width, box.height) / 2
    const radii = values.map((v) => {
      const first = (v || '0').split(' ')[0]!
      const n = first.endsWith('%')
        ? (parseFloat(first) / 100) * Math.min(box.width, box.height)
        : parseFloat(first)
      return Math.min(Number.isFinite(n) ? n : 0, max)
    }) as [number, number, number, number]
    return radii.some((r) => r > 0) ? radii : undefined
  }

  function strokeOf(cs: CSSStyleDeclaration): Stroke | undefined {
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
    const widths = sides.map((s) => {
      const style = cs.getPropertyValue(`border-${s.toLowerCase()}-style`)
      return style === 'none' || style === 'hidden'
        ? 0
        : parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) || 0
    }) as [number, number, number, number]
    if (widths.every((w) => w === 0)) return undefined
    const colors = sides.map(
      (s) =>
        color(cs.getPropertyValue(`border-${s.toLowerCase()}-color`)) ?? { r: 0, g: 0, b: 0, a: 1 },
    )
    const visible = colors.map((c, i) => (widths[i]! > 0 ? c : null)).filter(Boolean) as Color[]
    if (visible.every((c) => c.a === 0)) return undefined
    const firstStyle = cs.getPropertyValue(
      `border-${sides[widths.findIndex((w) => w > 0)]!.toLowerCase()}-style`,
    )
    const same = visible.every(
      (c) =>
        c.r === visible[0]!.r &&
        c.g === visible[0]!.g &&
        c.b === visible[0]!.b &&
        c.a === visible[0]!.a,
    )
    return {
      widths,
      color: visible[0]!,
      style: firstStyle === 'dashed' ? 'dashed' : firstStyle === 'dotted' ? 'dotted' : 'solid',
      ...(same ? {} : { sides: colors as [Color, Color, Color, Color] }),
    }
  }

  function backgroundPaints(cs: CSSStyleDeclaration, box: Box, forText = false): Paint[] {
    const paints: Paint[] = []
    const bg = color(cs.backgroundColor)
    if (bg && bg.a > 0 && !forText) paints.push({ type: 'solid', color: bg })
    const image = cs.backgroundImage
    if (image && image !== 'none') {
      const sizes = splitTopLevel(cs.backgroundSize)
      const repeats = splitTopLevel(cs.backgroundRepeat)
      const layers = splitTopLevel(image)
      // CSS lists the top layer first; scene paints go bottom to top.
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i]!
        const gradient = parseGradient(layer, box.width, box.height, color)
        if (gradient) {
          paints.push(gradient)
          continue
        }
        const url = parseUrl(layer)
        if (!url) continue
        const size = sizes[i] ?? sizes[0] ?? 'auto'
        const repeat = repeats[i] ?? repeats[0] ?? 'repeat'
        const fit: ImageFit =
          size === 'contain'
            ? 'fit'
            : size === 'cover'
              ? 'fill'
              : repeat.startsWith('no-repeat')
                ? 'fill'
                : 'tile'
        const asset = assetFor(url, () => ({ kind: 'image', url }))
        paints.push({ type: 'image', asset, fit })
      }
    }
    return paints
  }

  function flexLayout(cs: CSSStyleDeclaration): FlexLayout | undefined {
    if (cs.display !== 'flex' && cs.display !== 'inline-flex') return undefined
    if (cs.flexDirection.endsWith('reverse')) return undefined
    const justifyMap: Record<string, FlexLayout['justify']> = {
      normal: 'start',
      'flex-start': 'start',
      start: 'start',
      left: 'start',
      center: 'center',
      'flex-end': 'end',
      end: 'end',
      right: 'end',
      'space-between': 'space-between',
    }
    const justify = justifyMap[cs.justifyContent]
    if (!justify) return undefined
    const alignMap: Record<string, FlexLayout['align']> = {
      normal: 'stretch',
      stretch: 'stretch',
      'flex-start': 'start',
      start: 'start',
      'self-start': 'start',
      center: 'center',
      'flex-end': 'end',
      end: 'end',
      'self-end': 'end',
      baseline: 'baseline',
      'first baseline': 'baseline',
    }
    const px = (v: string) => (v === 'normal' ? 0 : parseFloat(v) || 0)
    return {
      direction: cs.flexDirection.startsWith('column') ? 'column' : 'row',
      wrap: cs.flexWrap === 'wrap',
      gap: [px(cs.rowGap), px(cs.columnGap)],
      padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)],
      justify,
      align: alignMap[cs.alignItems] ?? 'stretch',
    }
  }

  function textStyle(el: Element, cs: CSSStyleDeclaration): TextStyle {
    const families = splitTopLevel(cs.fontFamily)
      .map((f) => f.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
    if (families[0]) fonts.add(families[0])
    const decoration = cs.textDecorationLine.includes('underline')
      ? 'underline'
      : cs.textDecorationLine.includes('line-through')
        ? 'line-through'
        : 'none'
    const transform =
      (['uppercase', 'lowercase', 'capitalize'] as const).find((t) => t === cs.textTransform) ??
      'none'
    const href = el.closest('a')?.href
    return {
      fontFamily: families,
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      italic: cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique'),
      fontSize: parseFloat(cs.fontSize) || 16,
      lineHeight: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight) || null,
      letterSpacing: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
      color: color(
        cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color
          ? cs.webkitTextFillColor
          : cs.color,
      ) ?? { r: 0, g: 0, b: 0, a: 1 },
      decoration,
      transform,
      ...(href ? { href } : {}),
    }
  }

  function isVisualInline(el: Element, cs: CSSStyleDeclaration): boolean {
    const bg = color(cs.backgroundColor)
    return (
      (bg !== null && bg.a > 0) ||
      cs.backgroundImage !== 'none' ||
      strokeOf(cs) !== undefined ||
      (cs.boxShadow !== 'none' && cs.boxShadow !== '') ||
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) > 0
    )
  }

  /** True when an element holds only text and plain inline elements. */
  function isTextBlock(el: Element): boolean {
    let hasText = false
    let ownText = false
    let interactive = false
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        if ((child.textContent ?? '').trim()) hasText = ownText = true
        continue
      }
      if (child.nodeType !== 1) continue
      const childEl = child as Element
      if (childEl.localName === 'br') continue
      if (SKIP.has(childEl.localName)) continue
      const ccs = win.getComputedStyle(childEl)
      if (ccs.display === 'none') continue
      if (
        ccs.display !== 'inline' ||
        ['img', 'svg', 'input', 'select', 'textarea', 'button', 'pr-pseudo'].includes(
          childEl.localName,
        )
      )
        return false
      if (isVisualInline(childEl, ccs) || ICON_FONT.test(ccs.fontFamily)) return false
      if (!isTextBlock(childEl)) {
        if ((childEl.textContent ?? '').trim()) return false
        continue
      }
      hasText = true
      if (stateSelector && childEl.matches(INTERACTIVE)) interactive = true
    }
    // With states on, `<li><a>Item</a></li>` keeps the link as its own element so
    // it can carry states. Links inside running text stay runs of the paragraph.
    return hasText && !(interactive && !ownText)
  }

  function collapse(text: string, cs: CSSStyleDeclaration): string {
    if (cs.whiteSpace.startsWith('pre') || cs.whiteSpace === 'break-spaces') return text
    return text.replace(/[\t\n\r ]+/g, ' ')
  }

  function collectRuns(el: Element, runs: TextRun[]) {
    const cs = win.getComputedStyle(el)
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        const text = collapse(child.textContent ?? '', cs)
        if (text) runs.push({ text, style: textStyle(el, cs) })
      } else if (child.nodeType === 1) {
        const childEl = child as Element
        if (childEl.localName === 'br') runs.push({ text: '\n', style: textStyle(el, cs) })
        else if (!SKIP.has(childEl.localName) && win.getComputedStyle(childEl).display !== 'none')
          collectRuns(childEl, runs)
      }
    }
  }

  function normaliseRuns(runs: TextRun[]): TextRun[] {
    // Merge neighbours with identical styles, then trim the block's outer whitespace.
    const merged: TextRun[] = []
    for (const run of runs) {
      const last = merged[merged.length - 1]
      if (last && JSON.stringify(last.style) === JSON.stringify(run.style)) last.text += run.text
      else merged.push({ ...run })
    }
    for (let i = 1; i < merged.length; i++) {
      if (merged[i - 1]!.text.endsWith(' ') && merged[i]!.text.startsWith(' '))
        merged[i]!.text = merged[i]!.text.slice(1)
    }
    if (merged[0]) merged[0].text = merged[0].text.replace(/^ +/, '')
    const last = merged[merged.length - 1]
    if (last) last.text = last.text.replace(/ +$/, '')
    return merged.filter((r) => r.text.length > 0)
  }

  function textGeometry(
    target: Node,
    blockCs: CSSStyleDeclaration,
    contentBox: Box | null,
  ): { box: Box; lines: number } | null {
    const range = doc.createRange()
    range.selectNodeContents(target)
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
    range.detach?.()
    if (rects.length === 0) return null
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity
    const tops: number[] = []
    for (const r of rects) {
      left = Math.min(left, r.left)
      top = Math.min(top, r.top)
      right = Math.max(right, r.right)
      bottom = Math.max(bottom, r.bottom)
      if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top)
    }
    const lines = tops.length
    let box: Box = {
      x: left + scrollX - origin.x,
      y: top + scrollY - origin.y,
      width: right - left,
      height: bottom - top,
    }
    // Multi-line text keeps the block's content width so it wraps the same way.
    if (lines > 1 && contentBox && blockCs.display !== 'inline')
      box = { ...box, x: contentBox.x, width: contentBox.width }
    return { box, lines }
  }

  function textNode(
    el: Element,
    target: Node,
    runs: TextRun[],
    cs: CSSStyleDeclaration,
    contentBox: Box | null,
    key: string,
  ): TextNode | null {
    const clean = normaliseRuns(runs)
    if (clean.length === 0) return null
    const geometry = textGeometry(target, cs, contentBox)
    if (!geometry || !intersects(geometry.box)) return null
    const style = clean[0]!.style
    const align =
      cs.textAlign === 'center'
        ? 'center'
        : cs.textAlign === 'right' || cs.textAlign === 'end'
          ? 'right'
          : cs.textAlign === 'justify'
            ? 'justify'
            : 'left'
    const shadows = parseShadows(cs.textShadow, color)
    let paint: Paint | undefined
    const clip = cs.getPropertyValue('-webkit-background-clip') || cs.backgroundClip
    if (clip === 'text') paint = backgroundPaints(cs, geometry.box, true)[0]
    count++
    const characters = clean.map((r) => r.text).join('')
    return {
      type: 'text',
      id: `n${count}`,
      key,
      name: characters.slice(0, 40).replace(/\s+/g, ' '),
      tag: el.localName,
      ...geometry.box,
      style,
      runs: clean,
      align,
      lines: geometry.lines,
      ...(shadows.length ? { shadows } : {}),
      ...(paint ? { paint } : {}),
    }
  }

  function serializeSvg(svg: SVGSVGElement, width: number, height: number): string {
    const clone = svg.cloneNode(true) as SVGSVGElement
    const originals = [svg, ...Array.from(svg.querySelectorAll('*'))]
    const copies = [clone, ...Array.from(clone.querySelectorAll('*'))]
    const props = [
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-dasharray',
      'opacity',
      'fill-opacity',
      'stroke-opacity',
      'fill-rule',
      'clip-rule',
      'stop-color',
      'stop-opacity',
      'font-family',
      'font-size',
      'font-weight',
    ]
    originals.forEach((original, i) => {
      const copy = copies[i]
      if (!copy) return
      const ocs = win.getComputedStyle(original)
      if (ocs.display === 'none') {
        copy.remove()
        return
      }
      for (const prop of props) {
        let value = ocs.getPropertyValue(prop)
        if (!value || (value === 'none' && prop !== 'fill' && prop !== 'stroke')) continue
        if (value === 'currentcolor' || value === 'currentColor') value = ocs.color
        if (/^(fill|stroke|stop-color)$/.test(prop) && value.startsWith('url(')) continue
        copy.setAttribute(prop, value)
      }
      copy.removeAttribute('class')
      copy.removeAttribute('style')
    })
    // Inline <use> references so the markup stands alone.
    for (const use of Array.from(clone.querySelectorAll('use'))) {
      const ref = use.getAttribute('href') ?? use.getAttribute('xlink:href')
      const target = ref?.startsWith('#') ? doc.getElementById(ref.slice(1)) : null
      if (!target) continue
      const g = doc.createElementNS(
        'http://www.w3.org/2000/svg',
        target.localName === 'symbol' ? 'svg' : 'g',
      )
      for (const attr of ['x', 'y', 'width', 'height']) {
        const v = use.getAttribute(attr)
        if (v) g.setAttribute(attr, v)
      }
      const viewBox = target.getAttribute('viewBox')
      if (viewBox) g.setAttribute('viewBox', viewBox)
      for (const attr of ['fill', 'stroke', 'stroke-width', 'opacity']) {
        const v = use.getAttribute(attr)
        if (v) g.setAttribute(attr, v)
      }
      for (const child of Array.from(target.childNodes)) g.appendChild(child.cloneNode(true))
      use.replaceWith(g)
    }
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(Math.round(width * 100) / 100))
    clone.setAttribute('height', String(Math.round(height * 100) / 100))
    if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
    return new XMLSerializer().serializeToString(clone)
  }

  function paintOrder(el: Element, cs: CSSStyleDeclaration): number {
    if (cs.position === 'static') return 0
    const z = parseInt(cs.zIndex, 10)
    return Number.isNaN(z) || z === 0 ? 0.5 : z
  }

  function visitChildren(
    parent: Element,
    parentKey: string,
    out: SceneNode[],
    parentCs: CSSStyleDeclaration,
    contentBox: Box | null,
  ) {
    const ordered: { node: SceneNode; order: number; index: number }[] = []
    const tagCount = new Map<string, number>()
    let index = 0
    let textIndex = 0
    for (const child of Array.from(parent.childNodes)) {
      if (count >= maxNodes) {
        truncated = true
        break
      }
      if (child.nodeType === 3) {
        const text = collapse(child.textContent ?? '', parentCs)
        if (!text.trim()) continue
        const node = textNode(
          parent,
          child,
          [{ text, style: textStyle(parent, parentCs) }],
          parentCs,
          contentBox,
          `${parentKey}/#text${textIndex++}`,
        )
        if (node) ordered.push({ node, order: 0, index: index++ })
        continue
      }
      if (child.nodeType !== 1) continue
      const el = child as Element
      const n = (tagCount.get(el.localName) ?? 0) + 1
      tagCount.set(el.localName, n)
      const nodes: SceneNode[] = []
      const order = visit(el, `${parentKey}/${el.localName}${n}`, nodes)
      for (const node of nodes) ordered.push({ node, order, index: index++ })
    }
    ordered.sort((a, b) => a.order - b.order || a.index - b.index)
    for (const { node } of ordered) out.push(node)
  }

  /** Visits an element; returns its paint order among siblings. */
  function visit(el: Element, key: string, out: SceneNode[]): number {
    const tag = el.localName
    if (SKIP.has(tag)) return 0
    const cs = win.getComputedStyle(el)
    if (cs.display === 'none') return 0
    const order = paintOrder(el, cs)
    if (cs.display === 'contents') {
      visitChildren(el, key, out, cs, null)
      return order
    }
    const opacity = parseFloat(cs.opacity)
    if (opacity === 0) return order

    const { box, rotation } = boxOf(el, cs)
    const a11y = accessibility(el)
    count++
    const base: Base = {
      id: `n${count}`,
      key,
      name: nameFor(el, a11y),
      tag,
      ...(opacity < 1 ? { opacity } : {}),
      ...(BLENDS.has(cs.mixBlendMode as BlendMode) ? { blend: cs.mixBlendMode as BlendMode } : {}),
      ...(rotation ? { rotation } : {}),
      ...(a11y ? { a11y } : {}),
      html: htmlName(el),
    }
    const hidden = cs.visibility === 'hidden' || cs.visibility === 'collapse'
    const visible = intersects(box) && !hidden

    if (tag === 'svg') {
      if (visible && box.width > 0 && box.height > 0) {
        const markup = serializeSvg(el as SVGSVGElement, box.width, box.height)
        const asset = assetFor(markup, () => ({ kind: 'svg', markup }))
        out.push({ ...base, ...box, type: 'svg', asset })
      }
      return order
    }
    if (tag === 'img') {
      const img = el as HTMLImageElement
      const url = img.currentSrc || img.src
      if (visible && url && img.naturalWidth > 0 && box.width > 0) {
        const fit: ImageFit =
          cs.objectFit === 'contain' || cs.objectFit === 'scale-down' ? 'fit' : 'fill'
        const asset = assetFor(url, () => ({ kind: 'image', url }))
        const radius = radiusOf(cs, box)
        out.push({ ...base, ...box, type: 'image', asset, fit, ...(radius ? { radius } : {}) })
      }
      return order
    }
    const rasterReason = RASTER[tag]
    if (rasterReason) {
      if (!visible || box.width === 0 || box.height === 0) return order
      if (tag === 'canvas') {
        try {
          const canvas = el as HTMLCanvasElement
          const dataUrl = canvas.toDataURL('image/png')
          const asset = assetFor(`canvas:${key}`, () => ({
            kind: 'image',
            dataUrl,
            width: canvas.width,
            height: canvas.height,
          }))
          out.push({ ...base, ...box, type: 'image', asset, fit: 'fill' })
          return order
        } catch {
          // Tainted canvas: fall through to a screenshot.
        }
      }
      out.push(raster(rasterReason, box, base))
      return order
    }
    if (
      tag === 'input' &&
      !TEXT_INPUTS.has((el as HTMLInputElement).type) &&
      (el as HTMLInputElement).type !== 'submit' &&
      (el as HTMLInputElement).type !== 'button'
    ) {
      if (visible && box.width > 0) out.push(raster('form-control', box, base))
      return order
    }
    if (
      visible &&
      ICON_FONT.test(cs.fontFamily) &&
      (el.textContent ?? '').trim().length > 0 &&
      el.children.length === 0
    ) {
      out.push(raster('icon-font', box, base))
      return order
    }

    const radius = radiusOf(cs, box)
    const stroke = strokeOf(cs)
    const shadows = parseShadows(cs.boxShadow, color)
    const blur = parseBlur(cs.filter)
    const backdropBlur = parseBlur(
      cs.backdropFilter || cs.getPropertyValue('-webkit-backdrop-filter'),
    )
    const clip = cs.getPropertyValue('-webkit-background-clip') || cs.backgroundClip
    const fills = hidden || clip === 'text' ? [] : backgroundPaints(cs, box)
    const clips =
      tag === 'html' ||
      ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX) ||
      ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowY)
    const layout = flexLayout(cs)
    const position =
      (['static', 'relative', 'absolute', 'fixed', 'sticky'] as const).find(
        (p) => p === cs.position,
      ) ?? 'static'
    const grow = parseFloat(cs.flexGrow)
    const alignSelfMap: Record<string, FlexLayout['align']> = {
      stretch: 'stretch',
      'flex-start': 'start',
      start: 'start',
      center: 'center',
      'flex-end': 'end',
      end: 'end',
    }
    const frame: FrameNode = {
      ...base,
      ...box,
      type: 'frame',
      fills,
      clips,
      position,
      children: [],
      ...(stroke && !hidden ? { stroke } : {}),
      ...(radius ? { radius } : {}),
      ...(shadows.length && !hidden ? { shadows } : {}),
      ...(blur ? { blur } : {}),
      ...(backdropBlur ? { backdropBlur } : {}),
      ...(layout ? { layout } : {}),
      ...(grow > 0 ? { grow } : {}),
      ...(alignSelfMap[cs.alignSelf] ? { alignSelf: alignSelfMap[cs.alignSelf] } : {}),
    }

    if (stateSelector) {
      const outline = outlineOf(cs)
      if (outline) outlines.set(key, outline)
    }

    const padding = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(
      (v) => parseFloat(v) || 0,
    )
    const borders = stroke?.widths ?? [0, 0, 0, 0]
    const contentBox: Box = {
      x: box.x + padding[3]! + borders[3],
      y: box.y + padding[0]! + borders[0],
      width: Math.max(0, box.width - padding[1]! - padding[3]! - borders[1] - borders[3]),
      height: Math.max(0, box.height - padding[0]! - padding[2]! - borders[0] - borders[2]),
    }

    if ((tag === 'input' || tag === 'textarea') && visible) {
      const field = el as HTMLInputElement
      const value = field.value || field.placeholder
      if (value && field.type !== 'password') {
        const placeholderCs = field.value ? cs : win.getComputedStyle(el, '::placeholder')
        const style = textStyle(el, field.value ? cs : placeholderCs)
        count++
        frame.children.push({
          type: 'text',
          id: `n${count}`,
          key: `${key}/#value`,
          name: value.slice(0, 40),
          tag,
          x: contentBox.x,
          y: contentBox.y,
          width: contentBox.width,
          height: contentBox.height,
          style,
          runs: [{ text: value, style }],
          align: 'left',
          lines: 1,
        })
      }
    } else if (tag === 'select' && visible) {
      const select = el as HTMLSelectElement
      const text = select.selectedOptions[0]?.textContent?.trim()
      if (text) {
        const style = textStyle(el, cs)
        count++
        frame.children.push({
          type: 'text',
          id: `n${count}`,
          key: `${key}/#value`,
          name: text.slice(0, 40),
          tag,
          x: contentBox.x,
          y: contentBox.y,
          width: contentBox.width,
          height: contentBox.height,
          style,
          runs: [{ text, style }],
          align: 'left',
          lines: 1,
        })
      }
    } else if (isTextBlock(el)) {
      const runs: TextRun[] = []
      collectRuns(el, runs)
      const node = textNode(el, el, runs, cs, contentBox, `${key}/#text`)
      if (node && !hidden) frame.children.push(node)
    } else {
      visitChildren(el, key, frame.children, cs, contentBox)
    }

    if (stateSelector && !measuring && visible && stateBudget > 0 && el.matches(INTERACTIVE)) {
      const states = captureStates(el, key, frame)
      if (states) frame.states = states
    }

    const paintsSomething =
      frame.fills.length > 0 ||
      frame.stroke ||
      frame.shadows ||
      frame.blur ||
      frame.backdropBlur ||
      (frame.opacity ?? 1) < 1 ||
      frame.blend
    const meaningful =
      paintsSomething ||
      frame.layout ||
      frame.clips ||
      frame.rotation ||
      a11y ||
      tag === 'html' ||
      tag === 'body' ||
      frame.states
    if (!meaningful && frame.children.length <= 1) {
      // A pure wrapper: hoist its children instead of adding an empty frame.
      count--
      for (const child of frame.children) out.push(child)
      return order
    }
    if (!visible && frame.children.length === 0) {
      count--
      return order
    }
    out.push(frame)
    return order
  }

  function outlineOf(cs: CSSStyleDeclaration): Outline | undefined {
    const width = parseFloat(cs.outlineWidth) || 0
    const outlineColor = color(cs.outlineColor)
    if (cs.outlineStyle === 'none' || width === 0 || !outlineColor || outlineColor.a === 0)
      return undefined
    return {
      width,
      offset: parseFloat(cs.outlineOffset) || 0,
      color: outlineColor,
      style:
        cs.outlineStyle === 'dashed' || cs.outlineStyle === 'dotted' ? cs.outlineStyle : 'solid',
    }
  }

  /** Re-walks an element in each state and keeps what differs from `base`. */
  function captureStates(el: Element, key: string, base: FrameNode): NodeStates | undefined {
    if (el.getElementsByTagName('*').length > MAX_STATE_SUBTREE) return undefined
    const before = flatten([base])
    const beforeOutlines = outlines
    const states: NodeStates = {}
    let measured = false
    for (const state of STATES) {
      const undo = markState(el, state)
      const saved = { count, rasters: rasters.length, truncated }
      const after: SceneNode[] = []
      outlines = new Map()
      try {
        // Skip the re-walk when no state rule matches anything in the subtree.
        if (!el.matches(stateSelector) && !el.querySelector(stateSelector)) continue
        measured = true
        measuring = true
        visit(el, key, after)
      } finally {
        measuring = false
        count = saved.count
        rasters.length = saved.rasters
        truncated = saved.truncated
        undo()
      }
      const overrides: Record<string, StateOverride> = {}
      for (const node of flatten(after).values()) {
        const old = before.get(node.key)
        if (!old || old.type !== node.type) continue
        const o: StateOverride = {}
        for (const k of ['x', 'y', 'width', 'height'] as const)
          if (Math.abs(node[k] - old[k]) > 0.01) o[k] = node[k]
        if ((node.rotation ?? 0) !== (old.rotation ?? 0)) o.rotation = node.rotation ?? 0
        if ((node.opacity ?? 1) !== (old.opacity ?? 1)) o.opacity = node.opacity ?? 1
        if (node.type === 'frame' && old.type === 'frame') {
          if (!same(node.fills, old.fills)) o.fills = node.fills
          if (!same(node.stroke, old.stroke)) o.stroke = node.stroke ?? null
          if (!same(node.radius, old.radius)) o.radius = node.radius ?? null
          if (!same(node.shadows ?? [], old.shadows ?? [])) o.shadows = node.shadows ?? []
          const outline = outlines.get(node.key)
          if (!same(outline, beforeOutlines.get(node.key))) o.outline = outline ?? null
        }
        if (node.type === 'text' && old.type === 'text') {
          if (!same(node.style.color, old.style.color)) o.color = node.style.color
          if (node.style.decoration !== old.style.decoration) o.decoration = node.style.decoration
        }
        if (Object.keys(o).length) overrides[node.key] = o
      }
      if (Object.keys(overrides).length) states[state] = overrides
    }
    outlines = beforeOutlines
    if (measured) stateBudget--
    return Object.keys(states).length ? states : undefined
  }

  // State rules go in before the walk; they match nothing until an element is
  // marked. Transitions are off so a marked element reads its end state at once.
  let stateStyle: HTMLStyleElement | null = null
  if (options.states) {
    const rules = collectStateRules(doc)
    stateSelector = rules.selectors
      .filter((selector) => {
        try {
          docEl.matches(selector)
          return true
        } catch {
          return false
        }
      })
      .join(',')
    if (stateSelector) {
      stateStyle = doc.createElement('style')
      stateStyle.setAttribute('data-pagerecast-states', '')
      stateStyle.textContent = `*,*::before,*::after{transition:none!important}\n${rules.css}`
      ;(doc.head ?? docEl).appendChild(stateStyle)
    }
  }

  const rootEl = options.scope === 'element' && options.target ? options.target : docEl
  const nodes: SceneNode[] = []
  try {
    visit(rootEl, rootEl.localName, nodes)
  } finally {
    stateStyle?.remove()
  }
  let root = nodes[0]
  if (!root || root.type !== 'frame' || nodes.length > 1) {
    root = {
      type: 'frame',
      id: 'n0',
      key: 'root',
      name: 'Page',
      tag: rootEl.localName,
      x: 0,
      y: 0,
      width: origin.width,
      height: origin.height,
      fills: [],
      clips: true,
      position: 'static',
      children: nodes,
    }
  }
  const rootFrame = root as FrameNode
  rootFrame.x = 0
  rootFrame.y = 0
  rootFrame.width = origin.width
  rootFrame.height = origin.height
  rootFrame.clips = true
  rootFrame.name = doc.title || 'Page'
  if (rootFrame.fills.length === 0) {
    // The canvas behind the page: body background, then html, then white.
    const bodyBg = doc.body ? color(win.getComputedStyle(doc.body).backgroundColor) : null
    const htmlBg = color(win.getComputedStyle(docEl).backgroundColor)
    const canvas =
      bodyBg && bodyBg.a > 0 ? bodyBg : htmlBg && htmlBg.a > 0 ? htmlBg : { r: 1, g: 1, b: 1, a: 1 }
    rootFrame.fills = [{ type: 'solid', color: canvas }]
  }

  return {
    root: rootFrame,
    width: origin.width,
    height: origin.height,
    assets,
    rasters,
    fonts: [...fonts],
    truncated,
  }
}
