import type { Capture, Color, RecastFile, TextStyle } from '@pagerecast/scene'
import { nearestColor, nearestNumber, numberScale, typeKey, type Candidate } from './match'
import { pageOf } from '../shared/pages'
import { hex, solid } from './paints'

export interface ColorRef {
  node: FrameNode | TextNode
  kind: 'fill' | 'text'
  color: Color
  /** DOM path, equal for the same element across light and dark captures. */
  key: string
  capture: Capture
}

/** An auto layout gap or padding, or a corner radius, that a number variable can drive. */
export interface NumberRef {
  node: FrameNode | RectangleNode
  field: VariableBindableNodeField
  kind: 'spacing' | 'radius'
  value: number
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
/** The same element in a light and a dark capture: same page, width and DOM path. */
const pairKey = (ref: ColorRef) =>
  `${pageOf(ref.capture)}|${ref.capture.viewport.width}|${ref.kind}|${ref.key}`

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
  warn: (message: string) => void = () => {},
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
  for (const ref of dark) darkByKey.set(pairKey(ref), ref.color)
  const counterparts = new Map<string, Color>()
  if (paired) {
    const votes = new Map<string, Map<string, { color: Color; n: number }>>()
    for (const ref of light) {
      const match = darkByKey.get(pairKey(ref))
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
  // Plans without modes (Figma's free plan allows one per collection) get the
  // dark values in a second collection instead, bound by the dark frames.
  let darkMode: string | null = null
  let darkCollection: VariableCollection | null = null
  if (paired) {
    try {
      darkMode = collection.addMode('Dark')
    } catch {
      darkCollection = figma.variables.createVariableCollection(`${hostOf(file)} · Dark`)
      darkMode = darkCollection.modes[0]!.modeId
      darkCollection.renameMode(darkMode, 'Dark')
      warn(
        'This Figma plan allows one mode per collection, so the dark colours are in a second collection.',
      )
    }
  }

  const variables = new Map<string, Variable>()
  const darkVariables = new Map<string, Variable>()
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
      if (darkCollection) {
        const twin = figma.variables.createVariable(variable.name, darkCollection, 'COLOR')
        twin.setValueForMode(darkMode, { r: d.r, g: d.g, b: d.b, a: d.a })
        darkVariables.set(k, twin)
      } else {
        variable.setValueForMode(darkMode, { r: d.r, g: d.g, b: d.b, a: d.a })
      }
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
      if (d && !byDark.has(colorKey(d))) byDark.set(colorKey(d), darkVariables.get(k) ?? variable)
    }
    for (const ref of dark) {
      const variable = byDark.get(colorKey(ref.color))
      if (variable) bind(ref, variable)
    }
    if (!darkCollection) {
      for (const [capture, root] of roots) {
        if (capture.theme === 'dark')
          root.setExplicitVariableModeForCollection(collection, darkMode)
      }
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

const MAX_LIBRARY_VARIABLES = 600

/** A variable's value in its collection's default mode, following aliases. */
async function resolve(variable: Variable, depth = 0): Promise<VariableValue | undefined> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    variable.variableCollectionId,
  )
  const value = collection ? variable.valuesByMode[collection.defaultModeId] : undefined
  if (value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    const target = depth < 5 ? await figma.variables.getVariableByIdAsync(value.id) : null
    return target ? resolve(target, depth + 1) : undefined
  }
  return value
}

async function colorCandidates(variables: Variable[]): Promise<Candidate<Variable>[]> {
  const out: Candidate<Variable>[] = []
  for (const variable of variables) {
    const value = await resolve(variable).catch(() => undefined)
    if (value && typeof value === 'object' && 'r' in value) {
      const { r, g, b } = value
      out.push({ color: { r, g, b, a: 'a' in value ? value.a : 1 }, value: variable })
    }
  }
  return out
}

/**
 * Variables of the given types from the team libraries enabled in this file.
 * Their values are only readable once imported, so they are imported here;
 * any failure (no libraries, offline, no permission) means no candidates.
 */
async function libraryVariables(type: VariableResolvedDataType): Promise<Variable[]> {
  try {
    const keys: string[] = []
    for (const library of await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()) {
      for (const v of await figma.teamLibrary.getVariablesInLibraryCollectionAsync(library.key))
        if (v.resolvedType === type) keys.push(v.key)
    }
    // ponytail: capped so a huge design system cannot stall the import; matching
    // misses whatever lies past the cap.
    const imported = await Promise.all(
      keys
        .slice(0, MAX_LIBRARY_VARIABLES)
        .map((key) => figma.variables.importVariableByKeyAsync(key).catch(() => null)),
    )
    return imported.filter((v): v is Variable => v !== null)
  } catch {
    return []
  }
}

export interface Reused {
  /** Nodes bound to variables or styles of this file. */
  local: number
  /** Nodes bound to variables of an enabled team library. */
  library: number
}

/**
 * Binds nodes to colour variables, paint styles and text styles that already
 * exist in the file, and then to colour variables of enabled team libraries,
 * when their values match (colours within one 8-bit step). Matched refs are
 * removed from the arrays so nothing is created twice.
 */
export async function applyLocalStyles(colors: ColorRef[], texts: TextRef[]): Promise<Reused> {
  const reused: Reused = { local: 0, library: 0 }
  const bindColor = (ref: ColorRef, variable: Variable) => {
    ref.node.fills = [figma.variables.setBoundVariableForPaint(solid(ref.color), 'color', variable)]
  }

  const variables = await colorCandidates(await figma.variables.getLocalVariablesAsync('COLOR'))
  const styles: Candidate<PaintStyle>[] = []
  for (const style of await figma.getLocalPaintStylesAsync()) {
    const [paint] = style.paints
    if (style.paints.length === 1 && paint?.type === 'SOLID')
      styles.push({ color: { ...paint.color, a: paint.opacity ?? 1 }, value: style })
  }
  let remaining: ColorRef[] = []
  for (const ref of colors) {
    const variable = nearestColor(ref.color, variables)
    const style = variable ? undefined : nearestColor(ref.color, styles)
    if (variable) bindColor(ref, variable)
    else if (style) await ref.node.setFillStyleIdAsync(style.id)
    else {
      remaining.push(ref)
      continue
    }
    reused.local++
  }
  if (remaining.length) {
    const library = await colorCandidates(await libraryVariables('COLOR'))
    remaining = remaining.filter((ref) => {
      const variable = nearestColor(ref.color, library)
      if (variable) {
        bindColor(ref, variable)
        reused.library++
      }
      return !variable
    })
  }
  colors.splice(0, colors.length, ...remaining)

  const textByKey = new Map<string, TextStyle_>()
  for (const style of await figma.getLocalTextStylesAsync()) {
    const lh = style.lineHeight.unit === 'PIXELS' ? style.lineHeight.value : null
    textByKey.set(typeKey(style.fontName.family, style.fontName.style, style.fontSize, lh), style)
  }
  const remainingTexts: TextRef[] = []
  for (const ref of texts) {
    const style = textByKey.get(
      typeKey(ref.font.family, ref.font.style, ref.style.fontSize, ref.style.lineHeight),
    )
    if (style) {
      await ref.node.setTextStyleIdAsync(style.id)
      reused.local++
    } else {
      remainingTexts.push(ref)
    }
  }
  texts.splice(0, texts.length, ...remainingTexts)
  return reused
}

const NUMBER_KINDS = {
  spacing: { collection: 'Spacing', scope: 'GAP', words: /spac|gap|pad/i },
  radius: { collection: 'Radius', scope: 'CORNER_RADIUS', words: /radi|round|corner/i },
} as const

/**
 * Binds spacing and radius to number variables. With `reuse`, values equal to
 * an existing spacing or radius variable (in the file, then in enabled
 * libraries) bind to it. With `create`, the rest that recur at least three
 * times become variables in a "Spacing" and a "Radius" collection, reused
 * across imports, and bind to them when within half a pixel.
 */
export async function applyNumberVariables(
  refs: NumberRef[],
  { reuse, create }: { reuse: boolean; create: boolean },
): Promise<Reused & { created: number }> {
  const result = { local: 0, library: 0, created: 0 }
  let remaining = refs
  const bindFrom = async (variables: Variable[], source: 'local' | 'library') => {
    const candidates = { spacing: [], radius: [] } as Record<
      NumberRef['kind'],
      { number: number; value: Variable }[]
    >
    for (const variable of variables) {
      const value = await resolve(variable).catch(() => undefined)
      if (typeof value !== 'number') continue
      for (const kind of ['spacing', 'radius'] as const) {
        const { scope, words } = NUMBER_KINDS[kind]
        if (
          variable.scopes.includes(scope) ||
          (variable.scopes.includes('ALL_SCOPES') && words.test(variable.name))
        )
          candidates[kind].push({ number: value, value: variable })
      }
    }
    remaining = remaining.filter((ref) => {
      const variable = nearestNumber(ref.value, candidates[ref.kind])
      if (variable) {
        ref.node.setBoundVariable(ref.field, variable)
        result[source]++
      }
      return !variable
    })
  }
  if (reuse) {
    await bindFrom(await figma.variables.getLocalVariablesAsync('FLOAT'), 'local')
    if (remaining.length) await bindFrom(await libraryVariables('FLOAT'), 'library')
  }
  if (!create) return result

  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  for (const kind of ['spacing', 'radius'] as const) {
    const refsOfKind = remaining.filter((r) => r.kind === kind)
    const scale = numberScale(refsOfKind.map((r) => r.value))
    if (scale.length === 0) continue
    const { collection: name, scope } = NUMBER_KINDS[kind]
    let collection = collections.find((c) => c.name === name && c.getPluginData('kind') === kind)
    if (!collection) {
      collection = figma.variables.createVariableCollection(name)
      collection.setPluginData('kind', kind)
    }
    const mode = collection.defaultModeId
    const existing = await Promise.all(
      collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
    )
    const variables = scale.map((value) => {
      const variableName = `${kind}/${value}`
      let variable = existing.find((v) => v?.name === variableName)
      if (!variable) {
        variable = figma.variables.createVariable(variableName, collection, 'FLOAT')
        variable.setValueForMode(mode, value)
        variable.scopes = [scope]
        result.created++
      }
      return { number: value, value: variable }
    })
    for (const ref of refsOfKind) {
      const variable = nearestNumber(ref.value, variables, 0.5)
      if (variable) ref.node.setBoundVariable(ref.field, variable)
    }
  }
  return result
}

// Figma's TextStyle type clashes with the scene's; alias it locally.
type TextStyle_ = globalThis.TextStyle
