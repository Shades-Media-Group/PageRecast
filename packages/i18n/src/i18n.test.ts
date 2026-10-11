import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  detectLocale,
  DICTIONARIES,
  formatAgo,
  formatBytes,
  fromEnglish,
  localizeLabel,
  LOCALES,
  resolveLocale,
  rich,
  setLocale,
  t,
  type MessageKey,
} from './index'
import { en } from './locales/en'

const repo = fileURLToPath(new URL('../../../', import.meta.url))
const englishKeys = Object.keys(en) as MessageKey[]
const placeholders = (text: string) =>
  [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort().join()
const forms = (value: string | Record<string, string>) =>
  typeof value === 'string' ? [value] : Object.values(value)

describe('dictionaries', () => {
  for (const locale of LOCALES) {
    const messages = DICTIONARIES[locale] as Record<string, string | Record<string, string>>

    it(`${locale} has exactly the English keys`, () => {
      const keys = Object.keys(messages)
      expect(englishKeys.filter((k) => !(k in messages))).toEqual([])
      expect(keys.filter((k) => !(k in en))).toEqual([])
    })

    it(`${locale} keeps every English placeholder, in every plural form`, () => {
      const wrong: string[] = []
      for (const key of englishKeys) {
        const source = en[key]
        const expected = placeholders(typeof source === 'string' ? source : source.other)
        for (const text of forms(messages[key]!))
          if (placeholders(text) !== expected) wrong.push(`${key}: ${text}`)
      }
      expect(wrong).toEqual([])
    })

    it(`${locale} has the plural forms its counts need`, () => {
      const rules = new Intl.PluralRules(locale)
      const missing: string[] = []
      for (const key of englishKeys) {
        const value = messages[key]
        if (typeof en[key] === 'string') {
          expect(typeof value, key).toBe('string')
          continue
        }
        for (const n of [...Array(121).keys(), 1.5]) {
          const category = rules.select(n)
          if (typeof value !== 'object' || !(category in value)) missing.push(`${key}: ${category}`)
        }
      }
      expect([...new Set(missing)]).toEqual([])
    })
  }

  it('uses every English key somewhere in the apps', () => {
    const roots = [
      'packages/ui/src',
      'packages/i18n/src',
      'apps/extension',
      'apps/figma-plugin/src',
    ]
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`
        if (/^(node_modules|dist|dist-firefox|locales)$/.test(name)) continue
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.test.ts')) files.push(path)
      }
    }
    for (const root of roots) walk(`${repo}${root}`)
    const source = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(englishKeys.filter((key) => !source.includes(`'${key}'`))).toEqual([])
  })
})

describe('t and formatting', () => {
  it('fills placeholders and picks plural forms', () => {
    setLocale('en')
    expect(t('count.frames', { count: 1 })).toBe('1 frame')
    expect(t('count.layers', { count: 1200 })).toBe('1,200 layers')
    setLocale('ru')
    expect(t('count.frames', { count: 1 })).toBe('1 фрейм')
    expect(t('count.frames', { count: 3 })).toBe('3 фрейма')
    expect(t('count.frames', { count: 11 })).toBe('11 фреймов')
    setLocale('ro')
    expect(t('count.frames', { count: 2 })).toBe('2 cadre')
    expect(t('count.frames', { count: 20 })).toBe('20 de cadre')
    setLocale('en')
  })

  it('formats sizes, times and labels in the locale', () => {
    setLocale('fr')
    expect(formatBytes(1536 * 1024)).toMatch(/^1,5\s?Mo$/)
    expect(localizeLabel('Desktop · 1440 · Dark')).toBe('Ordinateur · 1440 · Sombre')
    expect(localizeLabel('Pricing · Mobile · 390 · Light')).toBe('Pricing · Mobile · 390 · Clair')
    expect(localizeLabel('HTML code')).toBe('HTML code')
    expect(formatAgo(Date.now() - 5 * 60_000)).toMatch(/5\smin/)
    expect(fromEnglish('This capture is empty.')).toBe('Cette capture est vide.')
    expect(fromEnglish('Something else.')).toBe('Something else.')
    const link = { element: 'a' }
    expect(rich('credit.built', { company: link })).toEqual([
      'Gratuit et open source. Créé par ',
      link,
      '.',
    ])
    setLocale('en')
  })

  it('chooses the interface language from the browser', () => {
    expect(detectLocale(['ru-MD', 'en'])).toBe('ru')
    expect(detectLocale(['ro-MD'])).toBe('ro')
    expect(detectLocale(['mo'])).toBe('ro')
    expect(detectLocale(['zh-TW', 'fr-CA'])).toBe('fr')
    expect(detectLocale(['zh-Hans-CN'])).toBe('zh-CN')
    expect(detectLocale(['de-DE'])).toBe('en')
    expect(resolveLocale('', ['es-MX'])).toBe('es')
    expect(resolveLocale('ro', ['es-MX'])).toBe('ro')
  })
})
