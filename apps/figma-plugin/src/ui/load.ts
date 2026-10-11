import { decode, fromBase64, mergeFiles, SceneError, type RecastFile } from '@pagerecast/scene'
import { assemble, viewportLabel, walk } from '@pagerecast/capture'
import { t } from '@pagerecast/i18n'
import type { ImageBytes, ImageTiles } from '../shared/messages'
import { imageUses, shrinkFactor } from '../shared/images'
import { inlinePage, mhtmlPage, zipPage } from './archive'

const MAX_SIDE = 4096
declare const __VERSION__: string

/**
 * Reads a dropped or chosen file: a `.recast` capture, an HTML page, a zipped
 * site folder or a single-file saved page (`.mhtml`).
 */
export async function readFile(file: File): Promise<RecastFile> {
  const name = file.name.replace(/\.[a-z0-9]+$/i, '')
  if (/\.html?$/i.test(file.name) || file.type === 'text/html') {
    return renderHtml(await file.text(), 1440, name)
  }
  try {
    if (/\.zip$/i.test(file.name))
      return renderHtml(
        inlinePage(await zipPage(new Uint8Array(await file.arrayBuffer()))),
        1440,
        name,
      )
    if (/\.(mht|mhtml|eml)$/i.test(file.name))
      return renderHtml(inlinePage(mhtmlPage(await file.text())), 1440, name)
  } catch (error) {
    throw error instanceof SceneError
      ? error
      : new SceneError(error instanceof Error ? error.message : String(error))
  }
  return decode(new Uint8Array(await file.arrayBuffer()))
}

/** Reads several files as one import, a page row per file, like the extension's combined copy. */
export async function readFiles(files: File[]): Promise<RecastFile> {
  return mergeFiles(await Promise.all(files.map(readFile)))
}

/** Reads pasted text: a clipboard capture, capture JSON, or raw HTML. */
export async function readText(text: string): Promise<RecastFile> {
  const trimmed = text.trim()
  if (/^<(!doctype|html|head|body|div|section|main|header|style|[a-z]+[\s>])/i.test(trimmed)) {
    return renderHtml(trimmed, 1440, t('plugin.pastedHtml'))
  }
  return decode(trimmed)
}

/**
 * Renders HTML in a hidden, script-free iframe at the given width and walks
 * it with the same engine the extension uses. Nothing leaves the plugin.
 */
export async function renderHtml(html: string, width: number, title: string): Promise<RecastFile> {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${width}px`,
    height: '900px',
    border: '0',
  })
  const loaded = new Promise<void>((resolve) =>
    frame.addEventListener('load', () => resolve(), { once: true }),
  )
  frame.srcdoc = html
  document.body.appendChild(frame)
  try {
    await loaded
    const doc = frame.contentDocument
    if (!doc?.body) throw new SceneError(t('plugin.notRendered'))
    await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 2000))])
    const images = Array.from(doc.images).filter((img) => !img.complete)
    await Promise.race([
      Promise.allSettled(images.map((img) => img.decode())),
      new Promise((r) => setTimeout(r, 3000)),
    ])
    // Size the frame to the content so the whole page is laid out.
    frame.style.height = `${Math.max(doc.documentElement.scrollHeight, 200)}px`
    const result = walk(doc, { scope: 'page' })
    return assemble(
      [
        {
          walk: result,
          viewport: { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 },
          theme: 'light',
          scope: 'page',
          label: viewportLabel(width, 'light'),
        },
      ],
      { url: '', title: doc.title || title, surface: 'figma-plugin', version: __VERSION__ },
    )
  } finally {
    frame.remove()
  }
}

async function bytesOf(asset: RecastFile['assets'][string]): Promise<Blob | null> {
  if (asset.kind !== 'image') return null
  if (asset.data)
    return new Blob([fromBase64(asset.data) as BlobPart], { type: asset.mime || 'image/png' })
  if (asset.url) {
    try {
      const response = await fetch(asset.url)
      return response.ok ? await response.blob() : null
    } catch {
      return null
    }
  }
  return null
}

async function encode(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  type: 'image/png' | 'image/jpeg' = 'image/png',
) {
  const canvas = new OffscreenCanvas(dw, dh)
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh)
  const blob = await canvas.convertToBlob({ type, quality: 0.9 })
  return new Uint8Array(await blob.arrayBuffer())
}

/** PNG, JPEG or GIF, by their first bytes: the formats Figma can decode. */
export function figmaReadable(bytes: Uint8Array): boolean {
  const [a, b, c] = bytes
  return (
    (a === 0x89 && b === 0x50 && c === 0x4e) ||
    (a === 0xff && b === 0xd8 && c === 0xff) ||
    (a === 0x47 && b === 0x49 && c === 0x46)
  )
}

/**
 * Turns every image asset into bytes Figma accepts. Oversized images are
 * scaled down; screenshots are cut into strips so they keep full detail.
 * With `smaller`, images are also scaled down to twice the size they show
 * at on the page, which keeps big photos from bloating the Figma file.
 */
export async function prepareImages(
  file: RecastFile,
  onProgress: (done: number, total: number) => void,
  smaller = false,
) {
  const uses = smaller ? imageUses(file) : null
  const images: ImageBytes = {}
  const tiles: ImageTiles = {}
  const failed: string[] = []
  const screenshots = new Set(file.captures.map((c) => c.screenshot).filter(Boolean) as string[])
  const entries = Object.entries(file.assets).filter(([, a]) => a.kind === 'image')
  let done = 0
  await Promise.all(
    entries.map(async ([id, asset]) => {
      try {
        const blob = await bytesOf(asset)
        if (!blob) {
          failed.push(id)
          return
        }
        const isSvg = blob.type === 'image/svg+xml'
        if (isSvg) {
          // An SVG behind an <img> becomes a vector.
          file.assets[id] = { kind: 'svg', markup: await blob.text() }
          return
        }
        const bitmap = await createImageBitmap(blob)
        const { width, height } = bitmap
        if (screenshots.has(id)) {
          const scale = Math.min(1, MAX_SIDE / width)
          const stripHeight = Math.floor(MAX_SIDE / scale)
          tiles[id] = []
          for (let y = 0, i = 0; y < height; y += stripHeight, i++) {
            const h = Math.min(stripHeight, height - y)
            const key = `${id}#${i}`
            images[key] = await encode(
              bitmap,
              0,
              y,
              width,
              h,
              Math.round(width * scale),
              Math.round(h * scale),
            )
            tiles[id].push({ key, y: y / height, height: h / height })
          }
        } else {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const limit = Math.min(1, MAX_SIDE / Math.max(width, height))
          const scale = Math.min(limit, uses ? shrinkFactor(uses.get(id), width, height) : 1)
          // Photos stay JPEG when made smaller; everything else keeps transparency as PNG.
          const type = blob.type === 'image/jpeg' && scale < 1 ? 'image/jpeg' : 'image/png'
          const resized =
            scale < 0.9 || limit < 1
              ? await encode(
                  bitmap,
                  0,
                  0,
                  width,
                  height,
                  Math.max(1, Math.round(width * scale)),
                  Math.max(1, Math.round(height * scale)),
                  type,
                )
              : null
          // Figma decodes only PNG, JPEG and GIF; WebP, AVIF and the rest are
          // re-encoded here, where the browser can read them. A smaller copy
          // that turns out heavier than the original is not used.
          images[id] =
            resized && (limit < 1 || resized.byteLength < bytes.byteLength)
              ? resized
              : figmaReadable(bytes)
                ? bytes
                : await encode(bitmap, 0, 0, width, height, width, height)
        }
        bitmap.close()
      } catch {
        failed.push(id)
      } finally {
        onProgress(++done, entries.length)
      }
    }),
  )
  return { images, tiles, failed }
}
