/**
 * Capture links: the Figma plugin opens
 * `https://pagerecast.shades.md/capture#url=…&widths=1440,390&theme=both&language=de-DE`
 * in the browser, and the extension, seeing that page, offers to capture the URL
 * with those settings. The hash never reaches a server.
 */

export const CAPTURE_PAGE = 'https://pagerecast.shades.md/capture/'

export interface CaptureLink {
  url: string
  widths: number[]
  theme: 'light' | 'dark' | 'both'
  /** BCP 47 tag; empty keeps the browser's language. */
  language: string
}

export function captureLink(link: CaptureLink): string {
  const hash = new URLSearchParams({
    url: link.url,
    widths: link.widths.join(','),
    theme: link.theme,
    ...(link.language ? { language: link.language } : {}),
  })
  return `${CAPTURE_PAGE}#${hash}`
}

/** An http(s) URL from what a person typed, or null. Bare hosts get https. */
export function webUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`)
    const web = url.protocol === 'http:' || url.protocol === 'https:'
    return web && (url.hostname.includes('.') || url.hostname === 'localhost') ? url.href : null
  } catch {
    return null
  }
}

/** Reads a capture link's hash; null unless every part is valid. */
export function parseCaptureLink(hash: string): CaptureLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const url = webUrl(params.get('url') ?? '')
  const widths = (params.get('widths') || '1440').split(',').map(Number)
  const theme = params.get('theme') || 'light'
  const language = params.get('language') ?? ''
  if (
    !url ||
    widths.length > 8 ||
    widths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840) ||
    (theme !== 'light' && theme !== 'dark' && theme !== 'both') ||
    (language && !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language))
  )
    return null
  return { url, widths: [...new Set(widths)], theme, language }
}
