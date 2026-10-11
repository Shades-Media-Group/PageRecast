// Firefox has no `debugger` API, so its capture uses plain WebExtension APIs:
// the engine runs through scripting.executeScript, widths come from resizing
// the window (and zoom), and screenshots from tabs.captureTab. Colour scheme and language
// cannot be emulated, so the page is captured as it is shown.
import type { PendingAsset } from '@pagerecast/capture'
import { toBase64 } from '@pagerecast/scene'
import {
  CaptureError,
  embedBytes,
  imagesToEmbed,
  MAX_SCREENSHOT_HEIGHT,
  wait,
  type Driver,
} from './capture'

type Rect = { x: number; y: number; width: number; height: number }
/**
 * Firefox-only: renders any area of a tab, also outside the viewport. `rect` is
 * in CSS pixels; `scale` counts device pixels, so it undoes the page zoom.
 */
const captureTab = (tabId: number, rect: Rect, zoom: number) =>
  (
    chrome.tabs as unknown as {
      captureTab(
        tabId: number,
        options: { format: 'png'; rect: Rect; scale: number },
      ): Promise<string>
    }
  ).captureTab(tabId, { format: 'png', rect, scale: 1 / zoom })

// Tall areas are captured in tiles and stitched, to stay under graphics limits.
const TILE = 4096

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function firefoxDriver(tabId: number): Driver {
  let windowId = -1
  let saved: chrome.windows.Window | undefined
  let savedZoom = 1
  let zoom = 1

  /** Runs a function or file in the page's own world and returns its result. */
  const inject = async (
    script: { func: (...args: unknown[]) => unknown; args: unknown[] } | { files: string[] },
  ) => {
    let results: (chrome.scripting.InjectionResult<unknown> & { error?: unknown })[]
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        ...script,
      } as chrome.scripting.ScriptInjection<unknown[], unknown>)
    } catch (error) {
      throw new CaptureError(message(error))
    }
    const [first] = results
    if (!first) throw new CaptureError('The page stopped the capture script.')
    // Firefox reports a script's own exception here instead of rejecting.
    if (first.error) throw new CaptureError(message(first.error))
    return first.result
  }
  const run: Driver['run'] = (fn, ...args) =>
    inject({ func: fn as (...args: unknown[]) => unknown, args }) as never

  return {
    emulates: false,
    run,
    async start() {
      try {
        // Firefox resolves the path from the calling page, so it starts at the root.
        await inject({ files: ['/capture.js'] })
      } catch {
        throw new CaptureError(
          'PageRecast can’t capture this page. Firefox blocks extensions on its own pages and on addons.mozilla.org.',
        )
      }
      windowId = (await chrome.tabs.get(tabId)).windowId
    },

    // Firefox cannot resize the page alone, so the window is resized until the
    // page is exactly `width` wide, measured from inside (the sidebar and the
    // window frame take their share). Where the window cannot get that narrow
    // or wide, the page is zoomed to make up the rest. stop() puts both back.
    async setView({ width }) {
      if (!saved) {
        saved = await chrome.windows.get(windowId)
        savedZoom = zoom = await chrome.tabs.getZoom(tabId)
        if (saved.state !== 'normal') await chrome.windows.update(windowId, { state: 'normal' })
      }
      for (let attempt = 0; attempt < 6; attempt++) {
        const inner = await run(() => innerWidth)
        if (inner === width) return
        const { width: outer = 0 } = await chrome.windows.get(windowId)
        const wanted = outer + Math.round((width - inner) * zoom)
        await chrome.windows.update(windowId, { width: wanted })
        await wait(250)
        const { width: got = 0 } = await chrome.windows.get(windowId)
        if (got !== wanted) {
          zoom = (zoom * (await run(() => innerWidth))) / width
          await chrome.tabs.setZoom(tabId, zoom)
          await wait(250)
        }
      }
      throw new CaptureError(
        `Firefox can’t make the page ${width} px wide in this window. Choose another width, or make the window larger and try again.`,
      )
    },

    async screenshot(x, y, width, height) {
      width = Math.round(width)
      height = Math.round(Math.min(height, MAX_SCREENSHOT_HEIGHT))
      if (width < 1 || height < 1) return null
      try {
        const tiles: string[] = []
        for (let top = 0; top < height; top += TILE) {
          tiles.push(
            await captureTab(
              tabId,
              { x, y: y + top, width, height: Math.min(TILE, height - top) },
              zoom,
            ),
          )
        }
        if (tiles.length === 1) return tiles[0]!
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')!
        for (const [i, tile] of tiles.entries()) {
          const bitmap = await createImageBitmap(await (await fetch(tile)).blob())
          context.drawImage(bitmap, 0, i * TILE, width, Math.min(TILE, height - i * TILE))
          bitmap.close()
        }
        const blob = await canvas.convertToBlob({ type: 'image/png' })
        return `data:image/png;base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`
      } catch {
        return null
      }
    },

    /**
     * Reads images through the page first (its cookies and cache, same-origin
     * or CORS-enabled images), then from the extension with its host access.
     * Anything left keeps its URL and the plugin fetches it.
     */
    async embedImages(assets: Record<string, PendingAsset>) {
      const entries = imagesToEmbed(assets)
      if (!entries.length) return
      const fromPage = await run(
        (urls: string[]) =>
          Promise.all(
            urls.map(async (url) => {
              try {
                const response = await fetch(url, { credentials: 'include', cache: 'force-cache' })
                if (!response.ok) return null
                const bytes = new Uint8Array(await response.arrayBuffer())
                let binary = ''
                for (let i = 0; i < bytes.length; i += 0x8000)
                  binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
                return btoa(binary)
              } catch {
                return null
              }
            }),
          ),
        entries.map(([, asset]) => asset.url),
      ).catch(() => [] as (string | null)[])
      await Promise.all(
        entries.map(async ([id, asset], i) => {
          let b64 = fromPage[i] ?? null
          if (!b64) {
            try {
              const response = await fetch(asset.url, { credentials: 'include' })
              if (response.ok) b64 = toBase64(new Uint8Array(await response.arrayBuffer()))
            } catch {
              // Leave the URL; the plugin will try.
            }
          }
          if (b64) embedBytes(assets, id, asset.url, b64)
        }),
      )
    },

    async stop() {
      if (!saved) return
      if (zoom !== savedZoom) await chrome.tabs.setZoom(tabId, savedZoom).catch(() => undefined)
      const { state, width, height, left, top } = saved
      await chrome.windows
        .update(windowId, state === 'normal' ? { width, height, left, top } : { state })
        .catch(() => undefined)
    },
  }
}
