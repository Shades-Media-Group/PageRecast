import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, migrateSettings, preferencesChanged, resetSettings } from './store'

describe('migrateSettings', () => {
  it('brings 1.0 settings up to date, keeping every choice made then', () => {
    // What 1.0 saved: no states, wait, hidden elements, maximum height or panel theme.
    const saved = {
      scope: 'viewport',
      widths: [1440, 1024],
      customWidths: [1024],
      theme: 'both',
      hideOverlays: false,
      preload: true,
      screenshot: true,
      language: 'de-DE',
      seenDebuggerNote: true,
      editing: false,
    }
    const settings = migrateSettings(saved)
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, ...saved })
    // Saved again and read back, nothing changes.
    expect(migrateSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings)
  })

  it('falls back to the default for anything of the wrong shape', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
    const settings = migrateSettings({
      widths: [390, 'wide', 99999, 390, 1440],
      customWidths: 'none',
      theme: 'sepia',
      appearance: 7,
      delay: 42,
      maxHeight: -10,
      hide: ['.chat'],
    })
    expect(settings).toEqual({ ...DEFAULT_SETTINGS, widths: [1440, 390] })
  })
})

describe('resetting preferences', () => {
  it('resets every preference but keeps the debugger note seen and the view open', () => {
    const fresh = { ...DEFAULT_SETTINGS, seenDebuggerNote: true, editing: false }
    expect(preferencesChanged(fresh)).toBe(false)
    const changed = { ...fresh, widths: [390], hideOverlays: false, appearance: 'dark' as const }
    expect(preferencesChanged(changed)).toBe(true)
    expect(resetSettings(changed)).toEqual(fresh)
  })
})
