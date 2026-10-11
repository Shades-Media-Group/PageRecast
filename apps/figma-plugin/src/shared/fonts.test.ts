import { describe, expect, it } from 'vitest'
import type { RecastFile, TextStyle } from '@pagerecast/scene'
import { fontLink, fontUsage, rememberChoices, styleLabel } from './fonts'

const style = (fontFamily: string[], fontWeight = 400, italic = false): TextStyle => ({
  fontFamily,
  fontWeight,
  italic,
  fontSize: 16,
  lineHeight: null,
  letterSpacing: 0,
  color: { r: 0, g: 0, b: 0, a: 1 },
  decoration: 'none',
  transform: 'none',
})

const text = (styles: TextStyle[]) => ({
  type: 'text' as const,
  id: 't',
  key: 't',
  name: 'Text',
  tag: 'p',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  style: styles[0]!,
  runs: styles.map((s) => ({ text: 'a', style: s })),
  align: 'left' as const,
  lines: 1,
})

describe('fontUsage', () => {
  it('counts each family, weight and slant once per run', () => {
    const file = {
      captures: [
        {
          root: {
            type: 'frame',
            children: [
              text([style(['Söhne', 'Arial']), style(['Söhne', 'Arial'], 700)]),
              text([style(['Söhne', 'Arial'])]),
            ],
          },
        },
      ],
    } as unknown as RecastFile
    expect(fontUsage(file)).toEqual([
      { fontFamily: ['Söhne', 'Arial'], fontWeight: 400, italic: false, count: 2 },
      { fontFamily: ['Söhne', 'Arial'], fontWeight: 700, italic: false, count: 1 },
    ])
  })
})

describe('styleLabel', () => {
  it('names weights the way font menus do', () => {
    expect(styleLabel(400, false)).toBe('Regular')
    expect(styleLabel(400, true)).toBe('Italic')
    expect(styleLabel(600, true)).toBe('Semi Bold Italic')
    expect(styleLabel(650, false)).toBe('Bold')
  })
})

describe('fontLink', () => {
  it('opens Google Fonts for fonts the page loaded from there', () => {
    const sources = {
      'Space Grotesk': 'https://fonts.googleapis.com/css2?family=Space+Grotesk',
      Söhne: 'https://example.com/fonts/soehne.woff2',
    }
    expect(fontLink('space grotesk', sources)).toBe(
      'https://fonts.google.com/specimen/Space+Grotesk',
    )
    expect(fontLink('Söhne', sources)).toBe(
      'https://www.google.com/search?q=S%C3%B6hne%20font%20download',
    )
    expect(fontLink('Graphik')).toContain('Graphik%20font%20download')
  })
})

describe('rememberChoices', () => {
  const missing = [
    { requested: 'Söhne', styles: ['Regular'], count: 3, replacement: 'Inter' },
    { requested: 'Graphik', styles: ['Bold'], count: 1, replacement: 'Inter' },
  ]

  it('keeps choices that differ from the automatic replacement', () => {
    expect(rememberChoices({}, missing, { Söhne: 'Helvetica Neue', Graphik: 'Inter' })).toEqual({
      Söhne: 'Helvetica Neue',
    })
  })

  it('forgets a family set back to automatic, and leaves other families alone', () => {
    expect(
      rememberChoices({ Söhne: 'Arial', Circular: 'Roboto' }, missing, { Söhne: 'Inter' }),
    ).toEqual({ Circular: 'Roboto' })
  })
})
