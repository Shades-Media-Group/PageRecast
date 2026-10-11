import { beforeAll, describe, expect, it } from 'vitest'
import { FontResolver } from './fonts'

const installed = [
  ['Inter', 'Regular'],
  ['Inter', 'Bold'],
  ['Helvetica Neue', 'Regular'],
  ['Helvetica Neue', 'Bold'],
  ['Helvetica Neue', 'Bold Italic'],
]

beforeAll(() => {
  ;(globalThis as unknown as { figma: unknown }).figma = {
    listAvailableFontsAsync: async () =>
      installed.map(([family, style]) => ({ fontName: { family, style } })),
  }
})

const style = (fontFamily: string[], fontWeight = 400, italic = false) => ({
  fontFamily,
  fontWeight,
  italic,
})

describe('FontResolver', () => {
  it('lists missing families with their styles, uses and automatic pick', async () => {
    const fonts = new FontResolver()
    await fonts.init()
    const missing = fonts.missing([
      { ...style(['Söhne', 'sans-serif']), count: 3 },
      { ...style(['Söhne', 'sans-serif'], 700, true), count: 1 },
      { ...style(['Inter']), count: 9 },
      { ...style(['system-ui']), count: 2 },
    ])
    expect(missing).toEqual([
      { requested: 'Söhne', styles: ['Regular', 'Bold Italic'], count: 4, replacement: 'Inter' },
    ])
    expect(fonts.familyNames()).toEqual(['Helvetica Neue', 'Inter'])
  })

  it('uses the chosen family in the closest style, and still reports it', async () => {
    const fonts = new FontResolver({ söhne: 'Helvetica Neue' })
    await fonts.init()
    expect(fonts.resolve(style(['Söhne'], 700, true))).toEqual({
      family: 'Helvetica Neue',
      style: 'Bold Italic',
    })
    expect(fonts.report()).toEqual([{ requested: 'Söhne', used: 'Helvetica Neue', count: 1 }])
  })

  it('falls back to the automatic pick when the chosen family is gone', async () => {
    const fonts = new FontResolver({ Söhne: 'Graphik' })
    await fonts.init()
    expect(fonts.resolve(style(['Söhne']))).toEqual({ family: 'Inter', style: 'Regular' })
  })
})
