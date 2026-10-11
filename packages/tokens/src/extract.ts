import type { Capture, Color, RecastFile, SceneNode, Shadow, Theme } from '@pagerecast/scene'

/**
 * Design tokens implied by a capture: the values a page repeats. Colour
 * extraction and naming follow the Figma plugin's variables (see
 * apps/figma-plugin/src/main/tokens.ts) so a token file and an import agree.
 */
export interface DesignTokens {
  /** Themes the colour tokens carry; the first one is the default. */
  themes: Theme[]
  widths: number[]
  colors: ColorToken[]
  typography: TypeToken[]
  spacing: DimensionToken[]
  radii: DimensionToken[]
  shadows: ShadowToken[]
}

export type ColorRole = 'text' | 'surface' | 'border'

export interface ColorToken {
  /** `text/01`, `surface/03`, `border/01`: the plugin's variable names. */
  name: string
  role: ColorRole
  values: Partial<Record<Theme, Color>>
  uses: number
}

export interface TypeToken {
  /** `16-regular`, `32-bold-italic`. */
  name: string
  fontFamily: string[]
  fontWeight: number
  italic: boolean
  fontSize: number
  /** Pixels, or null for `normal`. */
  lineHeight: number | null
  letterSpacing: number
  uses: number
}

export interface DimensionToken {
  /** `1`, `2`… in ascending order; `full` for pill radii. */
  name: string
  value: number
  uses: number
}

export interface ShadowToken {
  name: string
  shadows: Shadow[]
  uses: number
}

// The plugin's limits, so the outputs match what an import creates.
const MIN_USES = 2
const MAX_COLORS = 48
const MAX_TEXT_STYLES = 32
const MAX_SPACING = 16
const MAX_RADII = 12
const MAX_SHADOWS = 8
/** Radii at or above this are pills, written as one `full` token. */
const PILL = 999

export const hex = (c: Color) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()

const colorKey = (c: Color) => `${hex(c)}${c.a < 1 ? Math.round(c.a * 100) : ''}`

type Kind = 'fill' | 'text' | 'border'
interface ColorRef {
  kind: Kind
  color: Color
  key: string
  capture: Capture
}

function* nodes(node: SceneNode): Generator<SceneNode> {
  yield node
  if (node.type === 'frame') for (const child of node.children) yield* nodes(child)
}

function colorRefs(capture: Capture): ColorRef[] {
  const refs: ColorRef[] = []
  for (const node of nodes(capture.root)) {
    if (node.type === 'text') {
      // Same rule as the plugin: single-run text without gradient paint.
      if (!node.paint && node.runs.length === 1)
        refs.push({ kind: 'text', color: node.style.color, key: node.key, capture })
    } else if (node.type === 'frame') {
      const first = node.fills[0]
      if (node.fills.length === 1 && first?.type === 'solid')
        refs.push({ kind: 'fill', color: first.color, key: node.key, capture })
      const stroke = node.stroke
      if (stroke) {
        stroke.widths.forEach((width, side) => {
          if (width > 0)
            refs.push({
              kind: 'border',
              color: stroke.sides?.[side] ?? stroke.color,
              key: `${node.key}#${stroke.sides ? side : 0}`,
              capture,
            })
        })
      }
    }
  }
  // A uniform border counts once per element, not once per side.
  const seen = new Set<string>()
  return refs.filter((r) => {
    if (r.kind !== 'border') return true
    const k = `${r.key}|${colorKey(r.color)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function extractColors(light: ColorRef[], dark: ColorRef[]): ColorToken[] {
  const primary = light.length ? light : dark
  const paired = light.length > 0 && dark.length > 0
  const primaryTheme: Theme = light.length ? 'light' : 'dark'

  const uses = new Map<string, { color: Color; count: number } & Record<Kind, number>>()
  for (const ref of primary) {
    const k = colorKey(ref.color)
    const entry = uses.get(k) ?? { color: ref.color, count: 0, fill: 0, text: 0, border: 0 }
    entry.count++
    entry[ref.kind]++
    uses.set(k, entry)
  }
  const chosen = [...uses.entries()]
    .filter(([, u]) => u.count >= MIN_USES)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_COLORS)

  // Dark counterpart: the most common dark colour on the same elements.
  const refKey = (r: ColorRef) => `${r.capture.viewport.width}|${r.kind}|${r.key}`
  const darkByKey = new Map(dark.map((r) => [refKey(r), r.color]))
  const counterparts = new Map<string, Color>()
  if (paired) {
    const votes = new Map<string, Map<string, { color: Color; n: number }>>()
    for (const ref of light) {
      const match = darkByKey.get(refKey(ref))
      if (!match) continue
      const k = colorKey(ref.color)
      const bucket = votes.get(k) ?? new Map<string, { color: Color; n: number }>()
      const vote = bucket.get(colorKey(match)) ?? { color: match, n: 0 }
      vote.n++
      bucket.set(colorKey(match), vote)
      votes.set(k, bucket)
    }
    for (const [k, bucket] of votes) {
      const best = [...bucket.values()].sort((a, b) => b.n - a.n)[0]
      if (best) counterparts.set(k, best.color)
    }
  }

  const roleCount: Record<ColorRole, number> = { text: 0, surface: 0, border: 0 }
  return chosen.map(([k, use]) => {
    // The plugin's rule (text when most uses are text), with borders as a third role.
    const role: ColorRole =
      use.text > use.count / 2 ? 'text' : use.border > use.count / 2 ? 'border' : 'surface'
    roleCount[role]++
    const values: Partial<Record<Theme, Color>> = { [primaryTheme]: use.color }
    if (paired) values.dark = counterparts.get(k) ?? use.color
    return {
      name: `${role}/${String(roleCount[role]).padStart(2, '0')}`,
      role,
      values,
      uses: use.count,
    }
  })
}

const WEIGHTS: Record<number, string> = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'regular',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

function extractTypography(captures: Capture[]): TypeToken[] {
  const groups = new Map<string, TypeToken>()
  for (const capture of captures) {
    for (const node of nodes(capture.root)) {
      if (node.type !== 'text') continue
      const s = node.style
      // Like the plugin: text whose runs share one font and size gets a style.
      if (
        !node.runs.every(
          (r) =>
            r.style.fontWeight === s.fontWeight &&
            r.style.italic === s.italic &&
            r.style.fontSize === s.fontSize,
        )
      )
        continue
      const lineHeight = s.lineHeight === null ? null : round(s.lineHeight)
      const k = `${s.fontFamily[0]}|${s.fontWeight}|${s.italic}|${round(s.fontSize)}|${lineHeight ?? 'auto'}|${round(s.letterSpacing)}`
      const group = groups.get(k)
      if (group) group.uses++
      else
        groups.set(k, {
          name: '',
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight,
          italic: s.italic,
          fontSize: round(s.fontSize),
          lineHeight,
          letterSpacing: round(s.letterSpacing),
          uses: 1,
        })
    }
  }
  const chosen = [...groups.values()]
    .filter((t) => t.uses >= MIN_USES)
    .sort((a, b) => b.fontSize - a.fontSize || b.uses - a.uses)
    .slice(0, MAX_TEXT_STYLES)
  const names = new Set<string>()
  for (const token of chosen) {
    const weight = WEIGHTS[Math.round(token.fontWeight / 100) * 100] ?? String(token.fontWeight)
    let name = `${Math.round(token.fontSize)}-${weight}${token.italic ? '-italic' : ''}`
    if (names.has(name)) name += `-${slug(token.fontFamily[0] ?? 'font')}`
    for (let n = 2; names.has(name); n++) name = name.replace(/(-\d+)?$/, `-${n}`)
    names.add(name)
    token.name = name
  }
  return chosen
}

/** Counts values, keeps the most used, and names them 1, 2, 3… in ascending order. */
function scale(values: number[], minUses: number, max: number): DimensionToken[] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const chosen = [...counts.entries()]
    .filter(([, n]) => n >= minUses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .sort((a, b) => a[0] - b[0])
  let index = 0
  return chosen.map(([value, uses]) =>
    value >= PILL ? { name: 'full', value: 9999, uses } : { name: String(++index), value, uses },
  )
}

function extractSpacing(captures: Capture[]): DimensionToken[] {
  const values: number[] = []
  for (const capture of captures) {
    for (const node of nodes(capture.root)) {
      if (node.type !== 'frame' || !node.layout) continue
      for (const v of [...node.layout.gap, ...node.layout.padding]) {
        if (v > 0) values.push(Math.round(v))
      }
    }
  }
  return scale(values, MIN_USES, MAX_SPACING)
}

function extractRadii(captures: Capture[]): DimensionToken[] {
  const values: number[] = []
  for (const capture of captures) {
    for (const node of nodes(capture.root)) {
      if ((node.type !== 'frame' && node.type !== 'image') || !node.radius) continue
      // Each distinct corner value counts once per element.
      const corners = new Set(
        node.radius.filter((r) => r > 0).map((r) => Math.min(Math.round(r), PILL)),
      )
      values.push(...corners)
    }
  }
  return scale(values, 1, MAX_RADII)
}

function extractShadows(captures: Capture[]): ShadowToken[] {
  const groups = new Map<string, ShadowToken>()
  for (const capture of captures) {
    for (const node of nodes(capture.root)) {
      if (node.type !== 'frame' || !node.shadows?.length) continue
      const shadows = node.shadows.map((s) => ({
        ...s,
        x: round(s.x),
        y: round(s.y),
        blur: round(s.blur),
        spread: round(s.spread),
      }))
      const k = JSON.stringify(
        shadows.map((s) => [s.inset, s.x, s.y, s.blur, s.spread, colorKey(s.color)]),
      )
      const group = groups.get(k)
      if (group) group.uses++
      else groups.set(k, { name: '', shadows, uses: 1 })
    }
  }
  const depth = (t: ShadowToken) => Math.max(...t.shadows.map((s) => s.blur + Math.abs(s.y)))
  const chosen = [...groups.values()]
    .sort((a, b) => b.uses - a.uses)
    .slice(0, MAX_SHADOWS)
    .sort((a, b) => depth(a) - depth(b))
  chosen.forEach((t, i) => (t.name = String(i + 1)))
  return chosen
}

export function extractTokens(file: RecastFile): DesignTokens {
  const light = file.captures.filter((c) => c.theme === 'light')
  const dark = file.captures.filter((c) => c.theme === 'dark')
  // Geometry and type do not change with the theme; read them from the default one.
  const primary = light.length ? light : dark
  const themes: Theme[] = light.length ? (dark.length ? ['light', 'dark'] : ['light']) : ['dark']
  return {
    themes,
    widths: [...new Set(file.captures.map((c) => c.viewport.width))].sort((a, b) => b - a),
    colors: extractColors(light.flatMap(colorRefs), dark.flatMap(colorRefs)),
    typography: extractTypography(primary),
    spacing: extractSpacing(primary),
    radii: extractRadii(primary),
    shadows: extractShadows(primary),
  }
}
