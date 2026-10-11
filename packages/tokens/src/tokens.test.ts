import { describe, expect, it } from 'vitest'
import type {
  Capture,
  Color,
  FrameNode,
  RecastFile,
  SceneNode,
  TextNode,
  Theme,
} from '@pagerecast/scene'
import { extractTokens, toCssVariables, toDesignMd, toW3CTokens } from './index'

const rgb = (hex: string, a = 1): Color => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a,
})

const base = { x: 0, y: 0, width: 100, height: 40, tag: 'div' }

function frame(
  key: string,
  fill: string | null,
  extra: Partial<FrameNode> = {},
  children: SceneNode[] = [],
): FrameNode {
  return {
    ...base,
    id: key,
    key,
    name: key,
    type: 'frame',
    fills: fill ? [{ type: 'solid', color: rgb(fill) }] : [],
    clips: false,
    position: 'static',
    children,
    ...extra,
  }
}

function text(
  key: string,
  color: string,
  fontSize: number,
  fontWeight: number,
  lineHeight: number,
): TextNode {
  const style = {
    fontFamily: ['Inter', 'sans-serif'],
    fontWeight,
    italic: false,
    fontSize,
    lineHeight,
    letterSpacing: 0,
    color: rgb(color),
    decoration: 'none' as const,
    transform: 'none' as const,
  }
  return {
    ...base,
    id: key,
    key,
    name: key,
    type: 'text',
    style,
    runs: [{ text: key, style }],
    align: 'left',
    lines: 1,
  }
}

// One page in two themes: every key appears in both, with the theme's colours.
const PALETTE: Record<Theme, Record<string, string>> = {
  light: { page: '#FFFFFF', card: '#F5F5F5', ink: '#111111', line: '#DDDDDD' },
  dark: { page: '#000000', card: '#1A1A1A', ink: '#EEEEEE', line: '#333333' },
}

function capture(theme: Theme): Capture {
  const p = PALETTE[theme]
  const card = (n: number) =>
    frame(
      `card${n}`,
      p.card!,
      {
        radius: [8, 8, 8, 8],
        shadows: [{ inset: false, x: 0, y: 2, blur: 8, spread: 0, color: rgb('#000000', 0.1) }],
        layout: {
          direction: 'column',
          wrap: false,
          gap: [16, 0],
          padding: [24, 24, 24, 24],
          justify: 'start',
          align: 'start',
        },
      },
      [text(`title${n}`, p.ink!, 32, 700, 40), text(`body${n}`, p.ink!, 16, 400, 24)],
    )
  const rule = (n: number) =>
    frame(`rule${n}`, null, {
      stroke: { widths: [1, 1, 1, 1], color: rgb(p.line!), style: 'solid' },
    })
  const root = frame('page', p.page!, {}, [
    card(1),
    card(2),
    rule(1),
    rule(2),
    text('footer', p.ink!, 16, 400, 24),
    frame('pill', null, { radius: [9999, 9999, 9999, 9999] }),
  ])
  return {
    id: theme,
    label: `Desktop · 1440 · ${theme}`,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    theme,
    scope: 'page',
    width: 1440,
    height: 900,
    root,
  }
}

const file = (themes: Theme[]): RecastFile => ({
  format: 'pagerecast/scene',
  version: 1,
  generator: { name: 'PageRecast', version: '1.0.0', surface: 'extension' },
  source: { url: 'https://example.com/', title: 'Example', capturedAt: '2026-10-11T00:00:00.000Z' },
  captures: themes.map(capture),
  assets: {},
})

describe('extractTokens', () => {
  const tokens = extractTokens(file(['light', 'dark']))

  it('names repeated colours by role and pairs light with dark through the elements', () => {
    expect(tokens.themes).toEqual(['light', 'dark'])
    const summary = tokens.colors.map((t) => [t.name, t.uses, t.values.light && t.values.dark])
    expect(summary.map(([name, uses]) => [name, uses])).toEqual([
      ['text/01', 5],
      ['surface/01', 2],
      ['border/01', 2],
    ])
    const ink = tokens.colors[0]!
    expect(ink.values.light).toEqual(rgb('#111111'))
    expect(ink.values.dark).toEqual(rgb('#EEEEEE'))
    // The page background is used once, so it is not a token.
    expect(tokens.colors.some((t) => t.values.light?.r === 1)).toBe(false)
  })

  it('builds a type scale, largest first', () => {
    expect(tokens.typography.map((t) => [t.name, t.fontSize, t.lineHeight, t.uses])).toEqual([
      ['32-bold', 32, 40, 2],
      ['16-regular', 16, 24, 3],
    ])
  })

  it('collects spacing, radii and shadows', () => {
    expect(tokens.spacing.map((t) => [t.name, t.value])).toEqual([
      ['1', 16],
      ['2', 24],
    ])
    expect(tokens.radii.map((t) => [t.name, t.value])).toEqual([
      ['1', 8],
      ['full', 9999],
    ])
    expect(tokens.shadows).toHaveLength(1)
    expect(tokens.shadows[0]!.uses).toBe(2)
  })

  it('uses dark as the only theme when there is no light capture', () => {
    const dark = extractTokens(file(['dark']))
    expect(dark.themes).toEqual(['dark'])
    expect(dark.colors[0]!.values).toEqual({ dark: rgb('#EEEEEE') })
  })
})

describe('outputs', () => {
  const tokens = extractTokens(file(['light', 'dark']))

  it('writes W3C tokens with modes in $extensions', () => {
    const json = toW3CTokens(tokens)
    const at = (...path: string[]) =>
      path.reduce<unknown>((v, k) => (v as Record<string, unknown>)[k], json)
    expect(at('color', 'text', '01', '$type')).toBe('color')
    expect(at('color', 'text', '01', '$value')).toEqual({
      colorSpace: 'srgb',
      components: [0.0667, 0.0667, 0.0667],
      hex: '#111111',
    })
    expect(
      at('color', 'text', '01', '$extensions', 'md.shades.pagerecast', 'modes', 'dark', 'hex'),
    ).toBe('#eeeeee')
    expect(at('typography', '16-regular', '$value')).toMatchObject({
      fontFamily: ['Inter', 'sans-serif'],
      fontSize: { value: 16, unit: 'px' },
      lineHeight: 1.5,
    })
    expect(at('spacing', '2', '$value')).toEqual({ value: 24, unit: 'px' })
    expect(at('shadow', '1', '$value', 'color', 'alpha')).toBe(0.1)
  })

  it('writes CSS variables with a dark block', () => {
    const css = toCssVariables(tokens)
    expect(css).toContain('color-scheme: light dark;')
    expect(css).toContain('--color-text-01: #111111;')
    expect(css).toContain('--font-32-bold: 700 32px/40px "Inter", sans-serif;')
    expect(css).toContain('--space-1: 16px;')
    expect(css).toContain('--radius-full: 9999px;')
    expect(css).toContain('--shadow-1: 0px 2px 8px 0px #0000001A;')
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\n {2}:root \{\n {4}--color-text-01: #EEEEEE;/,
    )
  })

  it('leaves the dark block out for a single theme', () => {
    const css = toCssVariables(extractTokens(file(['light'])))
    expect(css).not.toContain('prefers-color-scheme')
    expect(css).not.toContain('color-scheme')
  })

  it('says so when the dark capture has no dark mode', () => {
    const flat = file(['light', 'dark'])
    flat.captures[1] = { ...capture('light'), id: 'dark', theme: 'dark' }
    const md = toDesignMd(extractTokens(flat), flat.source)
    expect(md).toContain('this page has no dark mode')
    expect(md).toContain('| `--color-text-01` | `#111111` | text and icons | 5 |')
  })

  it('writes a DESIGN.md with every section', () => {
    const md = toDesignMd(tokens, file([]).source)
    expect(md).toMatch(/^# Example design system/)
    expect(md).toContain('| `--color-text-01` | `#111111` | `#EEEEEE` | text and icons | 5 |')
    expect(md).toContain('| `--font-16-regular` | Inter | 400 | 16px | 24px | 0px | 3 |')
    expect(md).toContain('`--space-1` 16px, `--space-2` 24px.')
    expect(md).toContain('`--radius-full` pill (9999px)')
    expect(md).toContain('Body text is `--font-16-regular`; headings step up to `--font-32-bold`.')
  })
})
