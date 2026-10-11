import { isPublicHost } from '@pagerecast/capture'

/**
 * What POST /api/render accepts: a public http(s) page and the capture settings.
 * Pure functions, so the limits are unit-tested without a browser.
 */

export type Theme = 'light' | 'dark'

export interface RenderRequest {
  url: string
  widths: number[]
  themes: Theme[]
  /** BCP 47 tag such as `de-DE`; empty keeps the browser's language. */
  language: string
}

/** A refusal the plugin maps to a short message by its `code`. */
export class RenderError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | 'bad-request'
      | 'bad-url'
      | 'needs-extension'
      | 'rate-limited'
      | 'unavailable'
      | 'unreachable'
      | 'capture-failed'
      | 'timeout',
    message: string,
  ) {
    super(message)
  }
}

export const LIMITS = {
  widths: 4,
  minWidth: 240,
  maxWidth: 3840,
  urlLength: 2048,
  bodyBytes: 4096,
} as const

const THEMES: Record<string, Theme[]> = {
  light: ['light'],
  dark: ['dark'],
  both: ['light', 'dark'],
}
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** The page address, or a RenderError saying why the server will not open it. */
export function checkUrl(input: unknown): URL {
  if (typeof input !== 'string' || !input.trim() || input.length > LIMITS.urlLength)
    throw new RenderError(400, 'bad-url', 'Send the page address as url.')
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new RenderError(400, 'bad-url', 'That is not a web address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new RenderError(400, 'bad-url', 'Only http and https pages can be rendered.')
  if (url.username || url.password || !isPublicHost(url.hostname))
    throw new RenderError(
      400,
      'needs-extension',
      'Pages on localhost, a private network or behind a login need the extension.',
    )
  return url
}

/** What the page may load while it renders: public http(s), and inline data. */
export function allowedSubrequest(input: string): boolean {
  if (/^(data|blob|about):/i.test(input)) return true
  try {
    checkUrl(input)
    return true
  } catch {
    return false
  }
}

/** Reads and checks the JSON body: `{ url, widths, theme, language? }`. */
export function parseRender(body: unknown): RenderRequest {
  if (!body || typeof body !== 'object')
    throw new RenderError(400, 'bad-request', 'Send JSON: { url, widths, theme }.')
  const { url, widths, theme, language = '' } = body as Record<string, unknown>
  const checked = checkUrl(url)
  if (
    !Array.isArray(widths) ||
    !widths.length ||
    widths.some(
      (w) =>
        typeof w !== 'number' || !Number.isInteger(w) || w < LIMITS.minWidth || w > LIMITS.maxWidth,
    )
  )
    throw new RenderError(
      400,
      'bad-request',
      `widths takes whole numbers from ${LIMITS.minWidth} to ${LIMITS.maxWidth}.`,
    )
  const unique = [...new Set(widths as number[])]
  if (unique.length > LIMITS.widths)
    throw new RenderError(400, 'bad-request', `At most ${LIMITS.widths} widths at a time.`)
  const themes = typeof theme === 'string' && Object.hasOwn(THEMES, theme) ? THEMES[theme] : null
  if (!themes) throw new RenderError(400, 'bad-request', 'theme is light, dark or both.')
  if (typeof language !== 'string' || (language && !LANGUAGE.test(language)))
    throw new RenderError(400, 'bad-request', 'language is a tag such as de-DE, or empty.')
  return { url: checked.href, widths: unique, themes, language }
}
