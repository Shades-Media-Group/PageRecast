import type { TextStyle } from '@pagerecast/scene'
import type { FontSubstitution } from '../shared/messages'
import { closestStyle, familyCandidates } from './geometry'

/** Resolves CSS font stacks to fonts Figma has, loading each once. */
export class FontResolver {
  private families = new Map<string, { family: string; styles: string[] }>()
  private cache = new Map<string, FontName>()
  private substitutions = new Map<string, FontSubstitution>()
  private loaded = new Set<string>()

  async init() {
    for (const font of await figma.listAvailableFontsAsync()) {
      const key = font.fontName.family.toLowerCase()
      const entry = this.families.get(key) ?? { family: font.fontName.family, styles: [] }
      entry.styles.push(font.fontName.style)
      this.families.set(key, entry)
    }
  }

  resolve(style: Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'italic'>): FontName {
    const key = `${style.fontFamily.join(',')}|${style.fontWeight}|${style.italic}`
    const cached = this.cache.get(key)
    if (cached) return cached
    let result: FontName = { family: 'Inter', style: 'Regular' }
    for (const candidate of familyCandidates(style.fontFamily)) {
      const entry = this.families.get(candidate.toLowerCase())
      if (!entry) continue
      const match = closestStyle(entry.styles, style.fontWeight, style.italic)
      if (match) {
        result = { family: entry.family, style: match }
        break
      }
    }
    const requested = style.fontFamily[0] ?? 'sans-serif'
    const isGeneric = /^(sans-serif|serif|monospace|system-ui|-apple-system|ui-)/i.test(requested)
    if (!isGeneric && result.family.toLowerCase() !== requested.toLowerCase()) {
      const sub = this.substitutions.get(requested) ?? { requested, used: result.family, count: 0 }
      sub.count++
      this.substitutions.set(requested, sub)
    }
    this.cache.set(key, result)
    return result
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
