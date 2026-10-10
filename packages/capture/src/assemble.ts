import {
  SCENE_FORMAT,
  SCENE_VERSION,
  type Asset,
  type Capture,
  type RecastFile,
  type Scope,
  type Theme,
  type Viewport,
} from '@pagerecast/scene'
import type { PendingAsset, WalkResult } from './walker'

export interface CapturePart {
  walk: WalkResult
  viewport: Viewport
  theme: Theme
  scope: Scope
  label: string
  /** Data URL of a PNG covering the same area. */
  screenshot?: string
  /** Data URLs for the walker's raster requests, keyed by asset id. */
  rasters?: Record<string, string>
}

export function dataUrlToAsset(dataUrl: string, width = 0, height = 0): Asset {
  const comma = dataUrl.indexOf(',')
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png'
  if (dataUrl.slice(0, comma).includes(';base64'))
    return { kind: 'image', mime, width, height, data: dataUrl.slice(comma + 1) }
  // URL-encoded data (common for inline SVG backgrounds).
  const text = decodeURIComponent(dataUrl.slice(comma + 1))
  if (mime === 'image/svg+xml') return { kind: 'svg', markup: text }
  return { kind: 'image', mime, width, height, data: btoa(text) }
}

function toAsset(pending: PendingAsset): Asset {
  if (pending.kind === 'svg') return pending
  if ('dataUrl' in pending) return dataUrlToAsset(pending.dataUrl, pending.width, pending.height)
  if (pending.url.startsWith('data:')) return dataUrlToAsset(pending.url)
  return { kind: 'image', mime: '', width: 0, height: 0, url: pending.url }
}

/**
 * Builds a `.recast` file from one or more walks. Asset ids are made unique
 * per capture, then identical sources are shared across captures.
 */
export function assemble(
  parts: CapturePart[],
  meta: {
    url: string
    title: string
    surface: RecastFile['generator']['surface']
    version: string
  },
): RecastFile {
  const assets: Record<string, Asset> = {}
  const bySource = new Map<string, string>()
  const captures: Capture[] = parts.map((part, index) => {
    const prefix = `c${index + 1}`
    const rename = new Map<string, string>()
    const add = (localId: string, asset: Asset) => {
      const source =
        asset.kind === 'svg'
          ? `svg:${asset.markup}`
          : asset.url
            ? `url:${asset.url}`
            : `data:${asset.data?.slice(0, 64)}:${asset.data?.length}`
      let id = bySource.get(source)
      if (!id) {
        id = `${prefix}-${localId}`
        bySource.set(source, id)
        assets[id] = asset
      }
      rename.set(localId, id)
    }
    for (const [id, pending] of Object.entries(part.walk.assets)) add(id, toAsset(pending))
    for (const [id, dataUrl] of Object.entries(part.rasters ?? {})) add(id, dataUrlToAsset(dataUrl))
    let screenshot: string | undefined
    if (part.screenshot) {
      screenshot = `${prefix}-screenshot`
      assets[screenshot] = dataUrlToAsset(part.screenshot, part.walk.width, part.walk.height)
    }
    // Rewrite asset references in the tree.
    const json = JSON.stringify(part.walk.root, (key, value) =>
      key === 'asset' && typeof value === 'string' && rename.has(value) ? rename.get(value) : value,
    )
    return {
      id: prefix,
      label: part.label,
      viewport: part.viewport,
      theme: part.theme,
      scope: part.scope,
      width: part.walk.width,
      height: part.walk.height,
      root: JSON.parse(json),
      ...(screenshot ? { screenshot } : {}),
    }
  })
  return {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    generator: { name: 'PageRecast', version: meta.version, surface: meta.surface },
    source: { url: meta.url, title: meta.title, capturedAt: new Date().toISOString() },
    captures,
    assets,
  }
}

export function viewportLabel(width: number, theme: Theme): string {
  const device =
    width >= 1200 ? 'Desktop' : width >= 1000 ? 'Laptop' : width >= 600 ? 'Tablet' : 'Mobile'
  return `${device} · ${width} · ${theme === 'dark' ? 'Dark' : 'Light'}`
}
