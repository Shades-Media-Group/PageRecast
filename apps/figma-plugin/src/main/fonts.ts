import type { TextStyle } from '@pagerecast/scene'
import type { FontSubstitution } from '../shared/messages'
import { styleLabel, type FontChoices, type FontUse, type MissingFont } from '../shared/fonts'
import { baseFamily, closestStyle, familyCandidates } from './geometry'

type Style = Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'italic'>

const isGeneric = (family: string) =>
  /^(sans-serif|serif|monospace|system-ui|-apple-system|ui-)/i.test(family)

/**
 * Resolves CSS font stacks to fonts Figma has, loading each once. A family
 * the user picked a replacement for (`choices`) uses that family, in the
 * style closest to the requested weight and slant.
 */
export class FontResolver {
  private families = new Map<string, { family: string; styles: string[] }>()
  private cache = new Map<string, FontName>()
  private substitutions = new Map<string, FontSubstitution>()
  private loaded = new Set<string>()
  private choices = new Map<string, string>()

  constructor(choices: FontChoices = {}) {
    for (const [requested, family] of Object.entries(choices))
      this.choices.set(requested.toLowerCase(), family)
  }

  async init() {
    for (const font of await figma.listAvailableFontsAsync()) {
      const key = font.fontName.family.toLowerCase()
      const entry = this.families.get(key) ?? { family: font.fontName.family, styles: [] }
      entry.styles.push(font.fontName.style)
      this.families.set(key, entry)
    }
  }

  /** Every family Figma can use, sorted for a picker. */
  familyNames(): string[] {
    return [...this.families.values()].map((f) => f.family).sort((a, b) => a.localeCompare(b))
  }

  private inFamily(family: string, style: Style): FontName | null {
    const entry = this.families.get(family.toLowerCase())
    const match = entry && closestStyle(entry.styles, style.fontWeight, style.italic)
    return entry && match ? { family: entry.family, style: match } : null
  }

  /** What the importer picks on its own: the first family of the stack Figma has. */
  private automatic(style: Style): FontName {
    for (const candidate of familyCandidates(style.fontFamily)) {
      const font = this.inFamily(candidate, style)
      if (font) return font
    }
    return { family: 'Inter', style: 'Regular' }
  }

  /** True when Figma lacks the family the page asked for first. */
  private replaced(requested: string, used: FontName) {
    return (
      !isGeneric(requested) && used.family.toLowerCase() !== baseFamily(requested).toLowerCase()
    )
  }

  resolve(style: Style): FontName {
    const key = `${style.fontFamily.join(',')}|${style.fontWeight}|${style.italic}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const requested = style.fontFamily[0] ?? 'sans-serif'
    const chosen = this.choices.get(requested.toLowerCase())
    const result = (chosen && this.inFamily(chosen, style)) || this.automatic(style)
    if (this.replaced(requested, result)) {
      const sub = this.substitutions.get(requested) ?? { requested, used: result.family, count: 0 }
      sub.count++
      this.substitutions.set(requested, sub)
    }
    this.cache.set(key, result)
    return result
  }

  /** Families the capture asks for that Figma lacks, with the automatic replacement. */
  missing(uses: FontUse[]): MissingFont[] {
    const out = new Map<string, MissingFont>()
    for (const use of uses) {
      const requested = use.fontFamily[0] ?? 'sans-serif'
      const auto = this.automatic(use)
      if (!this.replaced(requested, auto)) continue
      const font = out.get(requested) ?? {
        requested,
        styles: [],
        count: 0,
        replacement: auto.family,
      }
      const label = styleLabel(use.fontWeight, use.italic)
      if (!font.styles.includes(label)) font.styles.push(label)
      font.count += use.count
      out.set(requested, font)
    }
    return [...out.values()].sort((a, b) => b.count - a.count)
  }

  async load(fonts: FontName[]) {
    const pending = fonts.filter((f) => !this.loaded.has(`${f.family}|${f.style}`))
    await Promise.all(
      pending.map(async (font) => {
        try {
          await figma.loadFontAsync(font)
        } catch {
          // A listed font that fails to load is replaced by Inter at use time.
        }
        this.loaded.add(`${font.family}|${font.style}`)
      }),
    )
  }

  isLoaded(font: FontName) {
    return this.loaded.has(`${font.family}|${font.style}`)
  }

  report(): FontSubstitution[] {
    return [...this.substitutions.values()].sort((a, b) => b.count - a.count)
  }
}
