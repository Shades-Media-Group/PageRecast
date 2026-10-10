import type { Capture, Color, RecastFile, TextStyle } from '@pagerecast/scene'
import { hex, solid } from './paints'

export interface ColorRef {
  node: FrameNode | TextNode
  kind: 'fill' | 'text'
  color: Color
  /** DOM path, equal for the same element across light and dark captures. */
  key: string
  capture: Capture
}

export interface TextRef {
  node: TextNode
  style: TextStyle
  font: FontName
}

const MIN_USES = 2
const MAX_VARIABLES = 48
const MAX_TEXT_STYLES = 32

const colorKey = (c: Color) => `${hex(c)}${c.a < 1 ? Math.round(c.a * 100) : ''}`

function hostOf(file: RecastFile) {
  try {
    return new URL(file.source.url).hostname.replace(/^www\./, '')
  } catch {
    return file.source.title || 'Imported site'
  }
}

/**
 * Turns repeated colours into variables. When the file holds light and dark
 * captures of the same viewport, colours are paired through the elements that
 * wear them, giving each variable a Light and a Dark value.
 */
export function createVariables(
  refs: ColorRef[],
  file: RecastFile,
  roots: Map<Capture, FrameNode>,
): number {
  if (refs.length === 0) return 0
  const light = refs.filter((r) => r.capture.theme === 'light')
  const dark = refs.filter((r) => r.capture.theme === 'dark')
  const primary = light.length ? light : dark
  const paired = light.length > 0 && dark.length > 0

  // Count uses per colour and per role.
  const uses = new Map<string, { color: Color; count: number; text: number }>()
  for (const ref of primary) {
    const k = colorKey(ref.color)
    const entry = uses.get(k) ?? { color: ref.color, count: 0, text: 0 }
    entry.count++
    if (ref.kind === 'text') entry.text++
    uses.set(k, entry)
  }
  const chosen = [...uses.entries()]
    .filter(([, u]) => u.count >= MIN_USES)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_VARIABLES)
  if (chosen.length === 0) return 0

  // Dark counterpart: the most common dark colour on the same elements.
  const darkByKey = new Map<string, Color>()
  for (const ref of dark)
    darkByKey.set(`${ref.capture.viewport.width}|${ref.kind}|${ref.key}`, ref.color)
  const counterparts = new Map<string, Color>()
  if (paired) {
    const votes = new Map<string, Map<string, { color: Color; n: number }>>()
    for (const ref of light) {
      const match = darkByKey.get(`${ref.capture.viewport.width}|${ref.kind}|${ref.key}`)
      if (!match) continue
      const k = colorKey(ref.color)
      const bucket = votes.get(k) ?? new Map()
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

  const collection = figma.variables.createVariableCollection(hostOf(file))
  const lightMode = collection.modes[0]!.modeId
  collection.renameMode(
    lightMode,
    paired ? 'Light' : primary[0]!.capture.theme === 'dark' ? 'Dark' : 'Light',
  )
  const darkMode = paired ? collection.addMode('Dark') : null

  const variables = new Map<string, Variable>()
  const roleCount = { text: 0, surface: 0 }
  for (const [k, use] of chosen) {
    const role = use.text > use.count / 2 ? 'text' : 'surface'
    roleCount[role]++
    const variable = figma.variables.createVariable(
      `${role}/${String(roleCount[role]).padStart(2, '0')}`,
      collection,
      'COLOR',
    )
    const { r, g, b, a } = use.color
    variable.setValueForMode(lightMode, { r, g, b, a })
    if (darkMode) {
      const d = counterparts.get(k) ?? use.color
      variable.setValueForMode(darkMode, { r: d.r, g: d.g, b: d.b, a: d.a })
    }
    variable.description = `From ${hex(use.color)}, used ${use.count}×`
    variables.set(k, variable)
  }

  const bind = (ref: ColorRef, variable: Variable) => {
    const paint = figma.variables.setBoundVariableForPaint(solid(ref.color), 'color', variable)
    ref.node.fills = [paint]
  }
  for (const ref of primary) {
    const variable = variables.get(colorKey(ref.color))
    if (variable) bind(ref, variable)
  }
  if (paired && darkMode) {
    // A dark element binds to the variable whose dark value it wears.
    const byDark = new Map<string, Variable>()
    for (const [k, variable] of variables) {
      const d = counterparts.get(k)
      if (d && !byDark.has(colorKey(d))) byDark.set(colorKey(d), variable)
    }
    for (const ref of dark) {
      const variable = byDark.get(colorKey(ref.color))
      if (variable) bind(ref, variable)
    }
    for (const [capture, root] of roots) {
      if (capture.theme === 'dark') root.setExplicitVariableModeForCollection(collection, darkMode)
    }
  }
  return variables.size
}

/** Creates text styles for type that repeats, and applies them. */
export async function createTextStyles(refs: TextRef[], file: RecastFile): Promise<number> {
  const groups = new Map<string, TextRef[]>()
  for (const ref of refs) {
    const s = ref.style
    const k = `${ref.font.family}|${ref.font.style}|${s.fontSize}|${s.lineHeight ?? 'auto'}|${s.letterSpacing}`
    groups.set(k, [...(groups.get(k) ?? []), ref])
  }
  const chosen = [...groups.values()]
    .filter((g) => g.length >= MIN_USES)
    .sort((a, b) => b[0]!.style.fontSize - a[0]!.style.fontSize)
    .slice(0, MAX_TEXT_STYLES)
  const host = hostOf(file)
  const names = new Set<string>()
  for (const group of chosen) {
    const { style, font } = group[0]!
    const style_ = figma.createTextStyle()
    let name = `${host}/${Math.round(style.fontSize)} ${font.style}`
    if (names.has(name)) name += ` ${font.family}`
    names.add(name)
    style_.name = name
    style_.fontName = font
    style_.fontSize = style.fontSize
    style_.lineHeight = style.lineHeight
      ? { value: style.lineHeight, unit: 'PIXELS' }
      : { unit: 'AUTO' }
    style_.letterSpacing = { value: style.letterSpacing, unit: 'PIXELS' }
    for (const ref of group) {
      try {
        await ref.node.setTextStyleIdAsync(style_.id)
      } catch {
        // Mixed-style text keeps its direct formatting.
      }
    }
  }
  return chosen.length
}

const textKey = (font: FontName, size: number, lineHeight: number | null) =>
  `${font.family}|${font.style}|${Math.round(size * 100) / 100}|${lineHeight === null ? 'auto' : Math.round(lineHeight * 100) / 100}`

/**
 * Binds nodes to colour variables, paint styles and text styles that already
 * exist in the file when their values match exactly. Matched refs are removed
 * from the arrays so nothing is created twice. Returns how many nodes it bound.
 */
export async function applyLocalStyles(colors: ColorRef[], texts: TextRef[]): Promise<number> {
  let bound = 0

  const variableByColor = new Map<string, Variable>()
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  for (const variable of await figma.variables.getLocalVariablesAsync('COLOR')) {
    const collection = collections.find((c) => c.id === variable.variableCollectionId)
    const value = collection ? variable.valuesByMode[collection.defaultModeId] : undefined
    if (value && typeof value === 'object' && 'r' in value) {
      const rgba = value as RGBA
      const key = colorKey({
        r: rgba.r,
        g: rgba.g,
        b: rgba.b,
        a: typeof rgba.a === 'number' ? rgba.a : 1,
      })
      if (!variableByColor.has(key)) variableByColor.set(key, variable)
    }
  }
  const styleByColor = new Map<string, PaintStyle>()
  for (const style of await figma.getLocalPaintStylesAsync()) {
    const [paint] = style.paints
    if (style.paints.length === 1 && paint?.type === 'SOLID') {
      const key = colorKey({ ...paint.color, a: paint.opacity ?? 1 })
      if (!styleByColor.has(key)) styleByColor.set(key, style)
    }
  }
  const remainingColors: ColorRef[] = []
  for (const ref of colors) {
    const key = colorKey(ref.color)
    const variable = variableByColor.get(key)
    const style = styleByColor.get(key)
    if (variable) {
      ref.node.fills = [
        figma.variables.setBoundVariableForPaint(solid(ref.color), 'color', variable),
      ]
      bound++
    } else if (style) {
      await ref.node.setFillStyleIdAsync(style.id)
      bound++
    } else {
      remainingColors.push(ref)
    }
  }
  colors.splice(0, colors.length, ...remainingColors)

  const textByKey = new Map<string, TextStyle_>()
  for (const style of await figma.getLocalTextStylesAsync()) {
    const lh = style.lineHeight.unit === 'PIXELS' ? style.lineHeight.value : null
    textByKey.set(textKey(style.fontName, style.fontSize, lh), style)
  }
  const remainingTexts: TextRef[] = []
  for (const ref of texts) {
    const style = textByKey.get(textKey(ref.font, ref.style.fontSize, ref.style.lineHeight))
    if (style) {
      await ref.node.setTextStyleIdAsync(style.id)
      bound++
    } else {
      remainingTexts.push(ref)
    }
  }
  texts.splice(0, texts.length, ...remainingTexts)
  return bound
}

// Figma's TextStyle type clashes with the scene's; alias it locally.
type TextStyle_ = globalThis.TextStyle
