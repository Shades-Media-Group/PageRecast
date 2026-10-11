import type { RecastFile, SceneNode, TextStyle } from '@pagerecast/scene'

/** One font stack, weight and slant the capture uses, and how many text runs use it. */
export interface FontUse {
  fontFamily: string[]
  fontWeight: number
  italic: boolean
  count: number
}

/** A family the capture asks for that Figma does not have. */
export interface MissingFont {
  /** The first family of the CSS stack, as the page names it. */
  requested: string
  /** Styles used, such as "Regular" or "Bold Italic". */
  styles: string[]
  /** Text runs that use it. */
  count: number
  /** The family the importer picks on its own. */
  replacement: string
}

/** Requested family → family to use instead. Keys are compared without case. */
export type FontChoices = Record<string, string>

function collect(node: SceneNode, into: Map<string, FontUse>) {
  const add = (style: TextStyle) => {
    const key = `${style.fontFamily.join(',')}|${style.fontWeight}|${style.italic}`
    const use = into.get(key) ?? {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      italic: style.italic,
      count: 0,
    }
    use.count++
    into.set(key, use)
  }
  if (node.type === 'text') node.runs.forEach((run) => add(run.style))
  if (node.type === 'frame') for (const child of node.children) collect(child, into)
}

/** Every distinct font the file's text uses, with how often. */
export function fontUsage(file: RecastFile): FontUse[] {
  const uses = new Map<string, FontUse>()
  for (const capture of file.captures) collect(capture.root, uses)
  return [...uses.values()]
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
}

/** "Semi Bold Italic" for 600 italic; "Italic" alone for 400 italic. */
export function styleLabel(weight: number, italic: boolean): string {
  const name = WEIGHT_NAMES[Math.min(900, Math.max(100, Math.round(weight / 100) * 100))]!
  if (!italic) return name
  return name === 'Regular' ? 'Italic' : `${name} Italic`
}

/**
 * Where to get a font: its Google Fonts page when the page loaded it from
 * Google Fonts, otherwise a web search for a download.
 */
export function fontLink(family: string, sources: Record<string, string> = {}): string {
  const [name, source] =
    Object.entries(sources).find(([name]) => name.toLowerCase() === family.toLowerCase()) ?? []
  if (name && source && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(source))
    return `https://fonts.google.com/specimen/${encodeURIComponent(name).replace(/%20/g, '+')}`
  return `https://www.google.com/search?q=${encodeURIComponent(`${family} font download`)}`
}

/**
 * The choices worth remembering after an import: a family the user pointed
 * somewhere other than the automatic replacement. Picking the automatic one
 * again forgets the earlier choice.
 */
export function rememberChoices(
  saved: FontChoices,
  missing: MissingFont[],
  chosen: FontChoices,
): FontChoices {
  const next = { ...saved }
  for (const font of missing) {
    const choice = chosen[font.requested]
    if (choice && choice !== font.replacement) next[font.requested] = choice
    else delete next[font.requested]
  }
  return next
}
