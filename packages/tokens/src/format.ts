import type { Color, Shadow, Theme } from '@pagerecast/scene'
import { hex, type ColorToken, type DesignTokens, type TypeToken } from './extract'

/** `$extensions` namespace for what the W3C format has no field for (theme modes, use counts). */
export const EXTENSION = 'md.shades.pagerecast'

const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places
const px = (n: number) => `${round(n, 2)}px`
const cssName = (name: string) => name.replace(/\//g, '-')
const defaultValue = (token: ColorToken, tokens: DesignTokens) => token.values[tokens.themes[0]!]!

/** `#RRGGBB`, or `#RRGGBBAA` when translucent. */
export function cssColor(c: Color): string {
  if (c.a >= 1) return hex(c)
  return `${hex(c)}${Math.round(c.a * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()}`
}

const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|emoji|math|fangsong|-apple-system|BlinkMacSystemFont)$/
export const fontStack = (families: string[]) =>
  families.map((f) => (GENERIC.test(f) ? f : `"${f.replace(/"/g, '')}"`)).join(', ')

function cssShadow(shadows: Shadow[]): string {
  return shadows
    .map(
      (s) =>
        `${s.inset ? 'inset ' : ''}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${cssColor(s.color)}`,
    )
    .join(', ')
}

// W3C Design Tokens Community Group format (2025.10): https://www.designtokens.org/tr/drafts/format/

const w3cColor = (c: Color) => ({
  colorSpace: 'srgb',
  components: [round(c.r), round(c.g), round(c.b)],
  ...(c.a < 1 ? { alpha: round(c.a) } : {}),
  hex: hex(c).toLowerCase(),
})
const w3cDimension = (value: number) => ({ value: round(value, 2), unit: 'px' })
const w3cTypography = (t: TypeToken) => ({
  fontFamily: t.fontFamily.length === 1 ? t.fontFamily[0] : t.fontFamily,
  fontSize: w3cDimension(t.fontSize),
  fontWeight: t.fontWeight,
  letterSpacing: w3cDimension(t.letterSpacing),
  // The format wants a multiplier; CSS `normal` is close to 1.2 in most fonts.
  lineHeight: t.lineHeight === null ? 1.2 : round(t.lineHeight / t.fontSize, 3),
})

type Group = Record<string, unknown>

/**
 * W3C Design Tokens JSON. `$value` holds the default theme (light when the
 * capture has it). Every colour also lists each theme's value under
 * `$extensions["md.shades.pagerecast"].modes`, and the root's extension names
 * the modes, so a tool can build light and dark sets from one file.
 */
export function toW3CTokens(tokens: DesignTokens, meta?: { url?: string }): Group {
  const out: Group = {
    $description: `Design tokens${meta?.url ? ` from ${meta.url}` : ''}, extracted by PageRecast.`,
    $extensions: { [EXTENSION]: { modes: tokens.themes, defaultMode: tokens.themes[0] } },
  }
  if (tokens.colors.length) {
    const color: Record<string, Group> = {}
    for (const token of tokens.colors) {
      const [role, index] = token.name.split('/') as [string, string]
      color[role] ??= {}
      const modes = Object.fromEntries(
        tokens.themes.map((theme) => [
          theme,
          w3cColor(token.values[theme] ?? defaultValue(token, tokens)),
        ]),
      )
      color[role][index] = {
        $type: 'color',
        $value: w3cColor(defaultValue(token, tokens)),
        $extensions: { [EXTENSION]: { modes, uses: token.uses } },
      }
    }
    out.color = color
  }
  const group = <T extends { name: string; uses: number }>(
    items: T[],
    type: string,
    value: (item: T) => unknown,
  ) =>
    Object.fromEntries(
      items.map((item) => [
        item.name,
        { $type: type, $value: value(item), $extensions: { [EXTENSION]: { uses: item.uses } } },
      ]),
    )
  if (tokens.typography.length)
    out.typography = group(tokens.typography, 'typography', w3cTypography)
  if (tokens.spacing.length)
    out.spacing = group(tokens.spacing, 'dimension', (t) => w3cDimension(t.value))
  if (tokens.radii.length)
    out.radius = group(tokens.radii, 'dimension', (t) => w3cDimension(t.value))
  if (tokens.shadows.length)
    out.shadow = group(tokens.shadows, 'shadow', (t) => {
      const list = t.shadows.map((s) => ({
        color: w3cColor(s.color),
        offsetX: w3cDimension(s.x),
        offsetY: w3cDimension(s.y),
        blur: w3cDimension(s.blur),
        spread: w3cDimension(s.spread),
        ...(s.inset ? { inset: true } : {}),
      }))
      return list.length === 1 ? list[0] : list
    })
  return out
}

/** CSS custom properties; dark colour values follow `prefers-color-scheme`. */
export function toCssVariables(tokens: DesignTokens, meta?: { url?: string }): string {
  const lines: string[] = []
  const [first, second] = tokens.themes as [Theme, Theme | undefined]
  if (second) lines.push('color-scheme: light dark;')
  else if (first === 'dark') lines.push('color-scheme: dark;')
  for (const t of tokens.colors)
    lines.push(`--color-${cssName(t.name)}: ${cssColor(defaultValue(t, tokens))};`)
  for (const t of tokens.typography) {
    const lineHeight = t.lineHeight === null ? 'normal' : px(t.lineHeight)
    lines.push(
      `--font-${t.name}: ${t.italic ? 'italic ' : ''}${t.fontWeight} ${px(t.fontSize)}/${lineHeight} ${fontStack(t.fontFamily)};`,
    )
    if (t.letterSpacing) lines.push(`--font-${t.name}-tracking: ${px(t.letterSpacing)};`)
  }
  for (const t of tokens.spacing) lines.push(`--space-${t.name}: ${px(t.value)};`)
  for (const t of tokens.radii) lines.push(`--radius-${t.name}: ${px(t.value)};`)
  for (const t of tokens.shadows) lines.push(`--shadow-${t.name}: ${cssShadow(t.shadows)};`)

  const header = `/* Design tokens${meta?.url ? ` from ${meta.url}` : ''}, extracted by PageRecast. */`
  let css = `${header}\n:root {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n`
  if (second) {
    const dark = tokens.colors
      .filter((t) => t.values.dark && cssColor(t.values.dark) !== cssColor(defaultValue(t, tokens)))
      .map((t) => `    --color-${cssName(t.name)}: ${cssColor(t.values.dark!)};`)
    if (dark.length)
      css += `\n@media (prefers-color-scheme: dark) {\n  :root {\n${dark.join('\n')}\n  }\n}\n`
  }
  return css
}

export interface DesignMeta {
  title: string
  url: string
  capturedAt?: string
}

const ROLE_USE: Record<ColorToken['role'], string> = {
  text: 'text and icons',
  surface: 'backgrounds',
  border: 'borders and dividers',
}

/** A concise DESIGN.md an AI coding tool can follow when building UI in this style. */
export function toDesignMd(tokens: DesignTokens, meta: DesignMeta): string {
  const out: string[] = []
  const paired = tokens.themes.length > 1
  // A dark capture of a page without a dark mode repeats the light colours.
  const themed =
    paired && tokens.colors.some((t) => cssColor(t.values.dark!) !== cssColor(t.values.light!))
  const shown = themed ? tokens.themes : tokens.themes.slice(0, 1)
  const date = meta.capturedAt ? ` on ${meta.capturedAt.slice(0, 10)}` : ''
  out.push(
    `# ${meta.title || meta.url} design system`,
    '',
    `Extracted by PageRecast from ${meta.url}${date}, at ${tokens.widths.join(' and ')} px wide in the ${tokens.themes.join(' and ')} theme${paired ? 's' : ''}. Every value is what the page rendered; only values the page repeats became tokens. CSS names are given in backticks.`,
    '',
    '## Colour',
    '',
  )
  if (tokens.colors.length) {
    if (themed) out.push('Dark values apply under `prefers-color-scheme: dark`.', '')
    else if (paired)
      out.push('The dark capture shows the same colours: this page has no dark mode.', '')
    out.push(
      themed ? '| Token | Light | Dark | Use for | Uses |' : '| Token | Value | Use for | Uses |',
      themed ? '| --- | --- | --- | --- | --: |' : '| --- | --- | --- | --: |',
    )
    for (const t of tokens.colors) {
      const values = shown.map(
        (theme) => `\`${cssColor(t.values[theme] ?? defaultValue(t, tokens))}\``,
      )
      out.push(
        `| \`--color-${cssName(t.name)}\` | ${values.join(' | ')} | ${ROLE_USE[t.role]} | ${t.uses} |`,
      )
    }
  } else out.push('No colour repeats on this page.')

  out.push('', '## Typography', '')
  if (tokens.typography.length) {
    const families = [...new Set(tokens.typography.map((t) => t.fontFamily[0]).filter(Boolean))]
    out.push(`Families: ${families.join(', ')}.`, '')
    out.push(
      '| Token | Font | Weight | Size | Line height | Letter spacing | Uses |',
      '| --- | --- | --: | --: | --: | --: | --: |',
    )
    for (const t of tokens.typography) {
      out.push(
        `| \`--font-${t.name}\` | ${t.fontFamily[0]}${t.italic ? ' italic' : ''} | ${t.fontWeight} | ${px(t.fontSize)} | ${t.lineHeight === null ? 'normal' : px(t.lineHeight)} | ${px(t.letterSpacing)} | ${t.uses} |`,
      )
    }
  } else out.push('No text style repeats on this page.')

  const dimensions = (title: string, prefix: string, items: DesignTokens['spacing']) => {
    out.push('', `## ${title}`, '')
    if (!items.length) return void out.push(`No ${title.toLowerCase()} value repeats on this page.`)
    out.push(
      items
        .map(
          (t) => `\`--${prefix}-${t.name}\` ${t.name === 'full' ? 'pill (9999px)' : px(t.value)}`,
        )
        .join(', ') + '.',
    )
  }
  dimensions('Spacing', 'space', tokens.spacing)
  dimensions('Radii', 'radius', tokens.radii)

  out.push('', '## Shadows', '')
  if (tokens.shadows.length) {
    for (const t of tokens.shadows)
      out.push(`- \`--shadow-${t.name}\`: \`${cssShadow(t.shadows)}\``)
  } else out.push('The page uses no shadows.')

  out.push('', '## Usage', '')
  const notes: string[] = []
  if (tokens.colors.length)
    notes.push(
      'Use the colour tokens, never raw values: `text` tokens for type and icons, `surface` for backgrounds, `border` for strokes and dividers. Lower numbers are used more.',
    )
  const body =
    [...tokens.typography]
      .filter((t) => t.fontSize >= 12 && t.fontSize <= 20)
      .sort((a, b) => b.uses - a.uses)[0] ?? tokens.typography[0]
  if (body) {
    const largest = tokens.typography[0]!
    notes.push(
      `Body text is \`--font-${body.name}\`${largest !== body ? `; headings step up to \`--font-${largest.name}\`` : ''}. Pick sizes from the type table instead of inventing new ones.`,
    )
  }
  if (tokens.spacing.length) notes.push('Take every padding and gap from the spacing scale.')
  if (tokens.radii.length) notes.push('Round corners only with the radius tokens.')
  notes.push(
    tokens.shadows.length
      ? 'Use the shadow tokens for elevation, lowest number for the lightest lift.'
      : 'Keep surfaces flat: the page uses no shadows.',
  )
  if (themed)
    notes.push(
      'Build dark mode by swapping the colour tokens to their dark values, not by inverting colours.',
    )
  out.push(...notes.map((n) => `- ${n}`), '')
  return out.join('\n')
}
