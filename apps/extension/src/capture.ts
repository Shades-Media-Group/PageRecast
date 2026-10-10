import {
  assemble,
  viewportLabel,
  type CapturePart,
  type PendingAsset,
  type WalkResult,
} from '@pagerecast/capture'
import type { RecastFile, Scope, Theme } from '@pagerecast/scene'

declare const __CAPTURE_BUNDLE__: string
declare const __VERSION__: string

export interface CaptureSettings {
  scope: Scope
  widths: number[]
  themes: Theme[]
  hideOverlays: boolean
  preload: boolean
  screenshot: boolean
  /** BCP 47 tag such as `de-DE`; empty keeps the browser's language. */
  language: string
}

export type CaptureProgress = { label: string; step: number; steps: number }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// Chrome cannot capture a single screenshot taller than this.
const MAX_SCREENSHOT_HEIGHT = 16_000

export class CaptureError extends Error {}

type Target = chrome.debugger.Debuggee

function command<T>(target: Target, method: string, params?: Record<string, unknown>): Promise<T> {
  return chrome.debugger.sendCommand(target, method, params) as unknown as Promise<T>
}

async function evaluate<T>(target: Target, expression: string, awaitPromise = false): Promise<T> {
  const result = await command<{
    result: { value: T }
    exceptionDetails?: { exception?: { description?: string } }
  }>(target, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    throw new CaptureError(
      result.exceptionDetails.exception?.description ?? 'The page stopped the capture script.',
    )
  }
  return result.result.value
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Reloads the tab and resolves when it has loaded (or after 20 s). */
function reload(target: Target): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, 20_000)
    function done() {
      clearTimeout(timer)
      chrome.debugger.onEvent.removeListener(onEvent)
      resolve()
    }
    function onEvent(source: chrome.debugger.Debuggee, method: string) {
      if (source.tabId === target.tabId && method === 'Page.loadEventFired')
        void wait(300).then(done)
    }
    chrome.debugger.onEvent.addListener(onEvent)
    void command(target, 'Page.reload', { ignoreCache: false })
  })
}

/** Opens a URL in a new tab, waits for it to load, and returns the tab id. */
export async function openTab(url: string): Promise<number> {
  const tab = await chrome.tabs.create({ url, active: true })
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 30_000)
    function done() {
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }
    function onUpdated(id: number, change: { status?: string }) {
      if (id === tab.id && change.status === 'complete') done()
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
  return tab.id!
}

function sniffMime(bytes: Uint8Array, url: string): string {
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

/**
 * Embeds image bytes so imports work offline and for pages behind a login.
 * Tries the page's own cache first, then a credentialed load through the
 * browser; anything left keeps its URL and the plugin fetches it.
 */
async function embedImages(target: Target, assets: Record<string, PendingAsset>, frameId: string) {
  const entries = Object.entries(assets).filter(
    (e): e is [string, Extract<PendingAsset, { url: string }>] =>
      e[1].kind === 'image' && 'url' in e[1] && !e[1].url.startsWith('data:'),
  )
  await Promise.all(
    entries.map(async ([id, asset]) => {
      let b64: string | null = null
      try {
        const cached = await command<{ content: string; base64Encoded: boolean }>(
          target,
          'Page.getResourceContent',
          { frameId, url: asset.url },
        )
        b64 = cached.base64Encoded
          ? cached.content
          : btoa(unescape(encodeURIComponent(cached.content)))
      } catch {
        try {
          const loaded = await command<{ resource: { success: boolean; stream?: string } }>(
            target,
            'Network.loadNetworkResource',
            {
              frameId,
              url: asset.url,
              options: { disableCache: false, includeCredentials: true },
            },
          )
          if (loaded.resource.success && loaded.resource.stream) {
            let data = ''
            for (;;) {
              const chunk = await command<{ data: string; eof: boolean; base64Encoded?: boolean }>(
                target,
                'IO.read',
                { handle: loaded.resource.stream, size: 1 << 20 },
              )
              data += chunk.base64Encoded ? atob(chunk.data) : chunk.data
              if (chunk.eof) break
            }
            await command(target, 'IO.close', { handle: loaded.resource.stream })
            b64 = btoa(data)
          }
        } catch {
          // Leave the URL; the plugin will try.
        }
      }
      if (!b64) return
      const bytes = base64ToBytes(b64)
      const mime = sniffMime(bytes, asset.url)
      if (mime === 'image/svg+xml') {
        assets[id] = { kind: 'svg', markup: new TextDecoder().decode(bytes) }
      } else {
        assets[id] = { kind: 'image', dataUrl: `data:${mime};base64,${b64}`, width: 0, height: 0 }
      }
    }),
  )
}

async function screenshot(
  target: Target,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<string | null> {
  if (width < 1 || height < 1) return null
  try {
    const shot = await command<{ data: string }>(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x, y, width, height: Math.min(height, MAX_SCREENSHOT_HEIGHT), scale: 1 },
    })
    return `data:image/png;base64,${shot.data}`
  } catch {
    return null
  }
}

export async function captureTab(
  tabId: number,
  settings: CaptureSettings,
  onProgress: (progress: CaptureProgress) => void,
): Promise<RecastFile> {
  const target: Target = { tabId }
  try {
    await chrome.debugger.attach(target, '1.3')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/another debugger/i.test(message))
      throw new CaptureError('Close DevTools on this tab, then capture again.')
    throw new CaptureError(
      'PageRecast can’t capture this page. Chrome blocks extensions on its own pages and the Web Store.',
    )
  }

  try {
    await command(target, 'Page.enable')
    await command(target, 'Network.enable')
    const { frameTree } = await command<{ frameTree: { frame: { id: string } } }>(
      target,
      'Page.getFrameTree',
    )
    await evaluate(target, __CAPTURE_BUNDLE__)
    const userAgent = await evaluate<string>(target, 'navigator.userAgent')
    if (settings.language) {
      // Sites pick their language from the request, so the page is reloaded once.
      onProgress({ label: `Switching the page to ${settings.language}`, step: 0, steps: 1 })
      await command(target, 'Emulation.setLocaleOverride', { locale: settings.language })
      await command(target, 'Emulation.setUserAgentOverride', {
        userAgent,
        acceptLanguage: settings.language,
      })
      await reload(target)
      await evaluate(target, __CAPTURE_BUNDLE__)
    }
    const meta = await evaluate<{ url: string; title: string; width: number; height: number }>(
      target,
      '({ url: location.href, title: document.title, width: innerWidth, height: innerHeight })',
    )

    if (settings.scope === 'element') {
      onProgress({
        label: 'Click the part of the page to capture. Press Esc to cancel.',
        step: 0,
        steps: 1,
      })
      const picked = await evaluate<boolean>(
        target,
        'window.__pagerecast.pickElement(document)',
        true,
      )
      if (!picked) throw new CaptureError('Capture cancelled.')
    }

    const views = settings.widths.flatMap((width) =>
      settings.themes.map((theme) => ({ width, theme })),
    )
    const parts: CapturePart[] = []
    let step = 0
    for (const { width, theme } of views) {
      const label = viewportLabel(width, theme)
      const mobile = width < 600
      const report = (what: string) =>
        onProgress({ label: `${label} · ${what}`, step, steps: views.length })
      report('setting up')

      await command(target, 'Emulation.setDeviceMetricsOverride', {
        width,
        height: mobile ? 844 : meta.height,
        deviceScaleFactor: 1,
        mobile,
      })
      await command(target, 'Emulation.setUserAgentOverride', {
        userAgent: mobile ? MOBILE_UA : userAgent,
        ...(settings.language ? { acceptLanguage: settings.language } : {}),
      })
      await command(target, 'Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: theme }],
      })
      await wait(350)

      if (settings.preload) {
        report('loading lazy content')
        await evaluate(target, 'window.__pagerecast.preload(document)', true)
      }
      report('reading layout')
      await evaluate(
        target,
        `(() => { const api = window.__pagerecast; api.restore?.(); api.restore = api.prepare(document, ${JSON.stringify(
          {
            hideOverlays: settings.hideOverlays,
            freezeAnimations: true,
          },
        )}); window.scrollTo(0, 0) })()`,
      )
      await wait(60)
      const walk = await evaluate<WalkResult>(
        target,
        `window.__pagerecast.walk(document, { scope: ${JSON.stringify(settings.scope)}, target: document.querySelector('[data-pagerecast-target]') })`,
      )

      report('saving images')
      await embedImages(target, walk.assets, frameTree.frame.id)
      const rasters: Record<string, string> = {}
      for (const r of walk.rasters) {
        const data = await screenshot(target, r.x, r.y, r.width, r.height)
        if (data) rasters[r.asset] = data
      }
      let shot: string | undefined
      if (settings.screenshot) {
        report('taking the screenshot')
        const origin = await evaluate<{ x: number; y: number }>(
          target,
          settings.scope === 'element'
            ? '(() => { const r = document.querySelector("[data-pagerecast-target]").getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY } })()'
            : settings.scope === 'viewport'
              ? '({ x: scrollX, y: scrollY })'
              : '({ x: 0, y: 0 })',
        )
        shot = (await screenshot(target, origin.x, origin.y, walk.width, walk.height)) ?? undefined
      }
      await evaluate(
        target,
        'window.__pagerecast.restore?.(); window.__pagerecast.restore = undefined',
      )

      parts.push({
        walk,
        viewport: { width, height: mobile ? 844 : meta.height, deviceScaleFactor: 1, mobile },
        theme,
        scope: settings.scope,
        label,
        ...(shot ? { screenshot: shot } : {}),
        rasters,
      })
      step++
    }

    onProgress({ label: 'Packing the capture', step: views.length, steps: views.length })
    return assemble(parts, {
      url: meta.url,
      title: meta.title,
      surface: 'extension',
      version: __VERSION__,
    })
  } finally {
    try {
      await evaluate(
        target,
        "document.querySelector('[data-pagerecast-target]')?.removeAttribute('data-pagerecast-target'); window.__pagerecast?.restore?.()",
      )
    } catch {
      // The tab may have navigated away.
    }
    await chrome.debugger.detach(target).catch(() => undefined)
  }
}
