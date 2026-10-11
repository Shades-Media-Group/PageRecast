/**
 * Saved web pages that carry their own files: a `.zip` of a site folder and a
 * single-file `.mhtml`. Both become one HTML document whose stylesheets,
 * images and fonts are inlined, so the script-free render needs no network.
 */

/** A file inside the page, by absolute URL. */
export interface Resource {
  type: string
  bytes: Uint8Array
}
export type Resources = Map<string, Resource>

/** What an archive holds: the page, the URL it was at, and its files. */
export interface SavedPage {
  html: string
  url: string
  resources: Resources
}

/** Paths inside a zip are given this origin, so they resolve like URLs. */
const ZIP_ORIGIN = 'https://archive.invalid/'
const MAX_ZIP_BYTES = 64 * 1024 * 1024

const TYPES: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
}
const typeOf = (path: string) => TYPES[/\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ''] ?? ''

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The files of a zip archive, by path. Stored and deflated entries only, as every zip tool writes. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // The end-of-central-directory record sits in the last 64 KB.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('This is not a zip archive.')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  let total = 0
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue
    const start =
      offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const data = bytes.subarray(start, start + size)
    if (method !== 0 && method !== 8) continue
    const file = method === 8 ? await inflate(data) : data
    total += file.byteLength
    if (total > MAX_ZIP_BYTES) throw new Error('This archive is larger than 64 MB unpacked.')
    files.set(name, file)
  }
  return files
}

/** The page in a zip: `index.html` nearest the top, else the first HTML file. */
export async function zipPage(bytes: Uint8Array): Promise<SavedPage> {
  const files = await readZip(bytes)
  const pages = [...files.keys()]
    .filter((p) => /\.html?$/i.test(p))
    .sort((a, b) => a.split('/').length - b.split('/').length)
  const page = pages.find((p) => /(^|\/)index\.html?$/i.test(p)) ?? pages[0]
  if (!page) throw new Error('This archive has no HTML page.')
  const resources: Resources = new Map()
  for (const [path, data] of files)
    resources.set(new URL(path, ZIP_ORIGIN).href, { type: typeOf(path), bytes: data })
  return {
    html: new TextDecoder().decode(files.get(page)),
    url: new URL(page, ZIP_ORIGIN).href,
    resources,
  }
}

function decodeQuotedPrintable(text: string): Uint8Array {
  const clean = text.replace(/=\r?\n/g, '')
  const out: number[] = []
  const encoder = new TextEncoder()
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '=' && /^[0-9A-F]{2}$/i.test(clean.slice(i + 1, i + 3))) {
      out.push(parseInt(clean.slice(i + 1, i + 3), 16))
      i += 2
    } else out.push(...encoder.encode(clean[i]!))
  }
  return new Uint8Array(out)
}

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A single-file saved page (MHTML), as browsers write it. */
export function mhtmlPage(text: string): SavedPage {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(text)?.[1]
  if (!boundary) throw new Error('This is not a saved web page.')
  const resources: Resources = new Map()
  let html = ''
  let url = ''
  for (const part of text.split(`--${boundary}`).slice(1)) {
    const split = part.search(/\r?\n\r?\n/)
    if (split < 0) continue
    const head = part.slice(0, split)
    const body = part
      .slice(split)
      .replace(/^\r?\n\r?\n/, '')
      .replace(/\r?\n$/, '')
    const header = (name: string) =>
      new RegExp(`^${name}:\\s*([^\\r\\n;]+)`, 'im').exec(head)?.[1]?.trim() ?? ''
    const type = header('Content-Type').toLowerCase()
    const encoding = header('Content-Transfer-Encoding').toLowerCase()
    const location =
      header('Content-Location') ||
      (header('Content-ID') && `cid:${header('Content-ID').replace(/[<>]/g, '')}`)
    const bytes =
      encoding === 'base64'
        ? decodeBase64(body)
        : encoding === 'quoted-printable'
          ? decodeQuotedPrintable(body)
          : new TextEncoder().encode(body)
    if (!html && type === 'text/html') {
      html = new TextDecoder().decode(bytes)
      url = location
    } else if (location) resources.set(location, { type, bytes })
  }
  if (!html) throw new Error('This saved page has no HTML.')
  return { html, url, resources }
}

function dataUrl({ type, bytes }: Resource): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${type || 'application/octet-stream'};base64,${btoa(binary)}`
}

function find(resources: Resources, ref: string, base: string): Resource | undefined {
  if (!ref || /^(data|blob|javascript|about|#)/i.test(ref)) return undefined
  try {
    const url = new URL(ref, base)
    url.hash = ''
    return resources.get(url.href) ?? resources.get(decodeURI(url.href))
  } catch {
    return resources.get(ref)
  }
}

/** CSS with every `url()` and `@import` it can find replaced by its file. */
function inlineCss(css: string, base: string, resources: Resources, depth = 0): string {
  return css
    .replace(
      /@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?([^;]*);/g,
      (rule, ref: string) => {
        const file = depth < 4 ? find(resources, ref, base) : undefined
        if (!file) return rule
        const href = new URL(ref, base).href
        return inlineCss(new TextDecoder().decode(file.bytes), href, resources, depth + 1)
      },
    )
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _q: string, ref: string) => {
      const file = find(resources, ref.trim(), base)
      return file ? `url("${dataUrl(file)}")` : match
    })
}

/** The page's HTML with its stylesheets, images and fonts inlined from `resources`. */
export function inlinePage({ html, url, resources }: SavedPage): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const base = new URL(
    doc.querySelector('base[href]')?.getAttribute('href') ?? '',
    url || ZIP_ORIGIN,
  ).href
  for (const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
    const file = find(resources, link.getAttribute('href')!, base)
    if (!file) continue
    const style = doc.createElement('style')
    style.textContent = inlineCss(
      new TextDecoder().decode(file.bytes),
      new URL(link.getAttribute('href')!, base).href,
      resources,
    )
    link.replaceWith(style)
  }
  for (const style of Array.from(doc.querySelectorAll('style')))
    style.textContent = inlineCss(style.textContent ?? '', base, resources)
  for (const el of Array.from(doc.querySelectorAll('[style]')))
    el.setAttribute('style', inlineCss(el.getAttribute('style')!, base, resources))
  for (const el of Array.from(doc.querySelectorAll('[src], video[poster], image[href]'))) {
    for (const attr of ['src', 'poster', 'href']) {
      const ref = el.getAttribute(attr)
      const file = ref ? find(resources, ref, base) : undefined
      if (file) {
        el.setAttribute(attr, dataUrl(file))
        // The inlined src wins; a srcset would point back at missing files.
        el.removeAttribute('srcset')
      }
    }
  }
  doc.querySelectorAll('base').forEach((b) => b.remove())
  return `<!doctype html>\n${doc.documentElement.outerHTML}`
}
