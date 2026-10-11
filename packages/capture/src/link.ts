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

/** Hosts that only mean something on the machine or network they are typed on. */
const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home.arpa']

function privateIpv4(host: string): boolean | null {
  const parts = host.split('.')
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null
  const [a, b] = parts.map(Number) as [number, number, number, number]
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast and reserved
  )
}

/** Only global unicast (2000::/3) is public; that leaves out ::1, fc00::/7, fe80::/10 and mapped IPv4. */
function privateIpv6(host: string): boolean | null {
  if (!host.startsWith('[')) return null
  const first = host.slice(1).split(':')[0]
  if (!first) return true // "::" and "::1", "::ffff:…"
  const value = parseInt(first, 16)
  return Number.isNaN(value) || (value & 0xe000) !== 0x2000
}

/**
 * False for localhost, private, loopback and link-local addresses and single-label intranet
 * names: pages only the person's own machine or network can open, which the
 * render service refuses and the extension captures.
 */
export function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  const v6 = privateIpv6(host)
  if (v6 !== null) return !v6
  const v4 = privateIpv4(host)
  if (v4 !== null) return !v4
  if (!host.includes('.')) return false
  return !LOCAL_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}
