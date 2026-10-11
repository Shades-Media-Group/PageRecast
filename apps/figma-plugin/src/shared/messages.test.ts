import { describe, expect, it } from 'vitest'
import type { Capture } from '@pagerecast/scene'
import {
  DEFAULT_OPTIONS,
  DEFAULT_SETTINGS,
  importKey,
  migrateSettings,
  preferencesChanged,
  resetSettings,
  type Settings,
} from './messages'

const capture = (label: string, scope: Capture['scope'], rootKey = 'html') =>
  ({ label, scope, root: { key: rootKey } }) as Capture

describe('importKey', () => {
  it('matches the same page, label and scope across captures', () => {
    const url = 'https://example.com/'
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).toBe(
      importKey(url, capture('Desktop · 1440 · Light', 'page')),
    )
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).not.toBe(
      importKey(url, capture('Desktop · 1440 · Dark', 'page')),
    )
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).not.toBe(
      importKey('https://example.com/pricing', capture('Desktop · 1440 · Light', 'page')),
    )
  })

  it('tells element captures apart by element, and skips HTML code', () => {
    const url = 'https://example.com/'
    expect(
      importKey(url, capture('Desktop · 1440 · Light', 'element', 'html/body1/nav1')),
    ).not.toBe(importKey(url, capture('Desktop · 1440 · Light', 'element', 'html/body1/footer1')))
    expect(importKey('', capture('Desktop · 1440 · Light', 'page'))).toBeNull()
  })
})

describe('migrateSettings', () => {
  it('brings 1.0 settings up to date, keeping every choice made then', () => {
    // What 1.0 saved: options, sites, the review switch and the rating counters.
    const saved = {
      defaults: { autoLayout: false, components: true, htmlNames: true },
      domains: { 'example.com': { screenshot: false } },
      review: false,
      imports: 7,
      askedForRating: true,
    }
    const settings = migrateSettings(saved)
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      defaults: { ...DEFAULT_OPTIONS, autoLayout: false, htmlNames: true },
      domains: { 'example.com': { ...DEFAULT_OPTIONS, screenshot: false } },
      review: false,
      imports: 7,
      askedForRating: true,
    })
    // Saved again and read back, nothing changes.
    expect(migrateSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })

  it('falls back to the default for anything of the wrong shape', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
    const settings = migrateSettings({
      appearance: 'sepia',
      defaults: { variables: 'yes' },
      fonts: { Söhne: 'Inter', Broken: 3 },
      web: { widths: [1440, 'wide', 99999, 390], theme: 'night', language: 'de-DE' },
      agent: { listen: 'on', code: 'AAAA-BBBB-CCCC-DDDD' },
    })
    expect(settings.appearance).toBe('light')
    expect(settings.defaults).toEqual(DEFAULT_OPTIONS)
    expect(settings.fonts).toEqual({ Söhne: 'Inter' })
    expect(settings.web).toEqual({ widths: [1440, 390], theme: 'light', language: 'de-DE' })
    expect(settings.agent).toEqual({ listen: false, code: 'AAAA-BBBB-CCCC-DDDD' })
  })
})

describe('resetting preferences', () => {
  it('resets every preference but keeps the import count', () => {
    const fresh = { ...DEFAULT_SETTINGS, imports: 3, askedForRating: true }
    expect(preferencesChanged(fresh)).toBe(false)
    const changed: Settings = {
      ...fresh,
      appearance: 'dark',
      domains: { 'example.com': DEFAULT_OPTIONS },
      web: { ...DEFAULT_SETTINGS.web, widths: [390] },
    }
    expect(preferencesChanged(changed)).toBe(true)
    expect(resetSettings(changed)).toEqual(fresh)
    expect(preferencesChanged(resetSettings(changed))).toBe(false)
  })
})
