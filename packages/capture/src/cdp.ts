import type { RecastFile, Scope, Theme } from '@pagerecast/scene'
import { assemble, viewportLabel, type CapturePart } from './assemble'
import type { PendingAsset, WalkResult } from './walker'

/**
 * Drives a capture over the Chrome DevTools Protocol, independent of how the
 * connection was made (chrome.debugger in the extension, Playwright in the
 * CLI). The page-injected bundle (global.ts, built as an IIFE) is passed in.
 */
export interface CdpConnection {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
  /** Reloads the page and resolves once it has loaded. */
  reload(): Promise<void>
}

export interface CdpCaptureOptions {
  /** `element` expects the target to carry `data-pagerecast-target` already. */
  scope: Scope
  widths: number[]
  themes: Theme[]
  hideOverlays: boolean
  preload: boolean
  screenshot: boolean
  /** BCP 47 tag such as `de-DE`; empty keeps the browser's language. */
  language: string
  /** Desktop viewport height; defaults to the window's current height. */
  height?: number
  /** CSS selectors, comma separated, of elements to leave out. */
  hide?: string
  /** Milliseconds to wait at each width before reading the page. */
  delay?: number
  /** Full-page captures stop at this height in CSS pixels. */
  maxHeight?: number
  /** The capture bundle's source. */
  bundle: string
  version: string
  surface: RecastFile['generator']['surface']
  onProgress?: (progress: { label: string; step: number; steps: number }) => void
}

export class CdpCaptureError extends Error {}

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// Chrome cannot capture a single screenshot taller than this.
const MAX_SCREENSHOT_HEIGHT = 16_000
const MOBILE_HEIGHT = 844

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function evaluate<T>(cdp: CdpConnection, expression: string, awaitPromise = false) {
  const result = await cdp.send<{
    result: { value: T }
    exceptionDetails?: { exception?: { description?: string } }
  }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true })
  if (result.exceptionDetails) {
    throw new CdpCaptureError(
      result.exceptionDetails.exception?.description ?? 'The page stopped the capture script.',
    )
  }
  return result.result.value
}

export function sniffMime(bytes: Uint8Array, url: string): string {
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')))
    return 'image/svg+xml'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif'
  if (head.startsWith('RIFF')) return 'image/webp'
  if (/\.avif(\?|$)/i.test(url)) return 'image/avif'
  return 'application/octet-stream'
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const utf8ToBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Embeds image bytes so imports work offline and for pages behind a login.
 * Tries the page's own cache first, then a credentialed load through the
 * browser; anything left keeps its URL and the plugin fetches it.
 */
async function embedImages(
  cdp: CdpConnection,
  assets: Record<string, PendingAsset>,
  frameId: string,
) {
  const entries = Object.entries(assets).filter(
    (e): e is [string, Extract<PendingAsset, { url: string }>] =>
      e[1].kind === 'image' && 'url' in e[1] && !e[1].url.startsWith('data:'),
  )
  await Promise.all(
    entries.map(async ([id, asset]) => {
      let b64: string | null = null
      try {
        const cached = await cdp.send<{ content: string; base64Encoded: boolean }>(
          'Page.getResourceContent',
          { frameId, url: asset.url },
        )
        b64 = cached.base64Encoded ? cached.content : utf8ToBase64(cached.content)
      } catch {
        try {
          const loaded = await cdp.send<{ resource: { success: boolean; stream?: string } }>(
            'Network.loadNetworkResource',
            { frameId, url: asset.url, options: { disableCache: false, includeCredentials: true } },
          )
          if (loaded.resource.success && loaded.resource.stream) {
            let data = ''
            for (;;) {
              const chunk = await cdp.send<{ data: string; eof: boolean; base64Encoded?: boolean }>(
                'IO.read',
                { handle: loaded.resource.stream, size: 1 << 20 },
              )
              data += chunk.base64Encoded ? atob(chunk.data) : chunk.data
              if (chunk.eof) break
            }
            await cdp.send('IO.close', { handle: loaded.resource.stream })
            b64 = btoa(data)
          }
        } catch {
          // Leave the URL; the plugin will try.
        }
      }
      if (!b64) return
      const bytes = base64ToBytes(b64)
      const mime = sniffMime(bytes, asset.url)
      assets[id] =
        mime === 'image/svg+xml'
          ? { kind: 'svg', markup: new TextDecoder().decode(bytes) }
          : { kind: 'image', dataUrl: `data:${mime};base64,${b64}`, width: 0, height: 0 }
    }),
  )
}

async function screenshot(cdp: CdpConnection, x: number, y: number, width: number, height: number) {
  if (width < 1 || height < 1) return null
  try {
    const shot = await cdp.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x, y, width, height: Math.min(height, MAX_SCREENSHOT_HEIGHT), scale: 1 },
    })
    return `data:image/png;base64,${shot.data}`
  } catch {
    return null
  }
}

/** Captures every width × theme of the connected page into one `.recast` file. */
export async function captureOverCdp(
  cdp: CdpConnection,
  options: CdpCaptureOptions,
): Promise<RecastFile> {
  const { bundle } = options
  try {
    await cdp.send('Page.enable')
    await cdp.send('Network.enable')
    await evaluate(cdp, bundle)
    const userAgent = await evaluate<string>(cdp, 'navigator.userAgent')
    if (options.language) {
      // Sites pick their language from the request, so the page is reloaded once.
      options.onProgress?.({
        label: `Switching the page to ${options.language}`,
        step: 0,
        steps: 1,
      })
      await cdp.send('Emulation.setLocaleOverride', { locale: options.language })
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent,
        acceptLanguage: options.language,
      })
      await cdp.reload()
      await evaluate(cdp, bundle)
    }
    const { frameTree } = await cdp.send<{ frameTree: { frame: { id: string } } }>(
      'Page.getFrameTree',
    )
    const meta = await evaluate<{ url: string; title: string; height: number }>(
      cdp,
      '({ url: location.href, title: document.title, height: innerHeight })',
    )

    const views = options.widths.flatMap((width) =>
      options.themes.map((theme) => ({ width, theme })),
    )
    const parts: CapturePart[] = []
    let step = 0
    for (const { width, theme } of views) {
      const label = viewportLabel(width, theme)
      const mobile = width < 600
      const height = mobile ? MOBILE_HEIGHT : (options.height ?? meta.height)
      const report = (what: string) =>
        options.onProgress?.({ label: `${label} · ${what}`, step, steps: views.length })
      report('setting up')

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      })
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent: mobile ? MOBILE_UA : userAgent,
        ...(options.language ? { acceptLanguage: options.language } : {}),
      })
      await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: theme }],
      })
      await wait(350)

      await evaluate(
        cdp,
        'window.__pagerecast.thaw?.(); window.__pagerecast.thaw = window.__pagerecast.freeze(document)',
      )
      if (options.preload) {
        report('loading lazy content')
        await evaluate(cdp, 'window.__pagerecast.preload(document)', true)
      }
      if (options.delay) {
        report('waiting for the page')
        await wait(options.delay)
      }
      report('reading layout')
      await evaluate(
        cdp,
        `(() => { const api = window.__pagerecast; api.restore?.(); api.restore = api.prepare(document, ${JSON.stringify(
          { hideOverlays: options.hideOverlays, freezeAnimations: true, hide: options.hide },
        )}); window.scrollTo(0, 0) })()`,
      )
      await wait(60)
      const walk = await evaluate<WalkResult>(
        cdp,
        `window.__pagerecast.walk(document, { scope: ${JSON.stringify(options.scope)}, target: document.querySelector('[data-pagerecast-target]'), maxHeight: ${options.maxHeight ?? 0} })`,
      )

      report('saving images')
      await embedImages(cdp, walk.assets, frameTree.frame.id)
      const rasters: Record<string, string> = {}
      for (const r of walk.rasters) {
        const data = await screenshot(cdp, r.x, r.y, r.width, r.height)
        if (data) rasters[r.asset] = data
      }
      let shot: string | undefined
      if (options.screenshot) {
        report('taking the screenshot')
        const origin = await evaluate<{ x: number; y: number }>(
          cdp,
          options.scope === 'element'
            ? '(() => { const r = document.querySelector("[data-pagerecast-target]").getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY } })()'
            : options.scope === 'viewport'
              ? '({ x: scrollX, y: scrollY })'
              : '({ x: 0, y: 0 })',
        )
        shot = (await screenshot(cdp, origin.x, origin.y, walk.width, walk.height)) ?? undefined
      }
      await evaluate(
        cdp,
        'window.__pagerecast.restore?.(); window.__pagerecast.restore = undefined; window.__pagerecast.thaw?.(); window.__pagerecast.thaw = undefined',
      )

      parts.push({
        walk,
        viewport: { width, height, deviceScaleFactor: 1, mobile },
        theme,
        scope: options.scope,
        label,
        ...(shot ? { screenshot: shot } : {}),
        rasters,
      })
      step++
    }

    options.onProgress?.({ label: 'Packing the capture', step: views.length, steps: views.length })
    return assemble(parts, {
      url: meta.url,
      title: meta.title,
      surface: options.surface,
      version: options.version,
    })
  } finally {
    try {
      await evaluate(
        cdp,
        "document.querySelector('[data-pagerecast-target]')?.removeAttribute('data-pagerecast-target'); window.__pagerecast?.restore?.(); window.__pagerecast?.thaw?.()",
      )
    } catch {
      // The page may have navigated away.
    }
  }
}
