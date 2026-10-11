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
  /** Record hover, focus and active styles of interactive elements. */
  states: boolean
  /** BCP 47 tag such as `de-DE`; empty keeps the browser's language. */
  language: string
}

export type CaptureProgress = { label: string; step: number; steps: number }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// Chrome cannot capture a single screenshot taller than this.
export const MAX_SCREENSHOT_HEIGHT = 16_000

export class CaptureError extends Error {}

/**
 * What a browser has to provide for a capture. Chrome drives the tab through
 * the DevTools Protocol.
 */
export interface Driver {
  /** Whether the page can be set to another colour scheme and language. */
  emulates: boolean
  /** Attaches to the tab, injects the capture engine and applies the language. */
  start(language: string, onProgress: (progress: CaptureProgress) => void): Promise<void>
  /** Runs a self-contained function in the page and returns its (awaited) result. */
  run<A extends unknown[], T>(fn: (...args: A) => T, ...args: A): Promise<Awaited<T>>
  setView(view: { width: number; height: number; mobile: boolean; theme: Theme }): Promise<void>
  /** A PNG data URL of an area of the page, in page coordinates. */
  screenshot(x: number, y: number, width: number, height: number): Promise<string | null>
  embedImages(assets: Record<string, PendingAsset>): Promise<void>
  /** Puts the tab back as it was. */
  stop(): Promise<void>
}

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

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/** Images the capture still references by URL. */
export function imagesToEmbed(assets: Record<string, PendingAsset>) {
  return Object.entries(assets).filter(
    (e): e is [string, Extract<PendingAsset, { url: string }>] =>
      e[1].kind === 'image' && 'url' in e[1] && !e[1].url.startsWith('data:'),
  )
}

/** Replaces an image URL with its bytes: SVG markup or a data URL. */
export function embedBytes(
  assets: Record<string, PendingAsset>,
  id: string,
  url: string,
  b64: string,
) {
  const bytes = base64ToBytes(b64)
  const mime = sniffMime(bytes, url)
  if (mime === 'image/svg+xml') {
    assets[id] = { kind: 'svg', markup: new TextDecoder().decode(bytes) }
  } else {
    assets[id] = { kind: 'image', dataUrl: `data:${mime};base64,${b64}`, width: 0, height: 0 }
  }
}

/**
 * Embeds image bytes so imports work offline and for pages behind a login.
 * Tries the page's own cache first, then a credentialed load through the
 * browser; anything left keeps its URL and the plugin fetches it.
 */
async function embedImages(target: Target, assets: Record<string, PendingAsset>, frameId: string) {
  await Promise.all(
    imagesToEmbed(assets).map(async ([id, asset]) => {
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
      if (b64) embedBytes(assets, id, asset.url, b64)
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

/** Chrome: everything goes through the DevTools Protocol. */
function chromeDriver(tabId: number): Driver {
  const target: Target = { tabId }
  let frameId = ''
  let userAgent = ''
  let language = ''

  return {
    emulates: true,
    run: (fn, ...args) => evaluate(target, `(${fn.toString()})(...${JSON.stringify(args)})`, true),
    async start(lang, onProgress) {
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
      await command(target, 'Page.enable')
      await command(target, 'Network.enable')
      const { frameTree } = await command<{ frameTree: { frame: { id: string } } }>(
        target,
        'Page.getFrameTree',
      )
      frameId = frameTree.frame.id
      await evaluate(target, __CAPTURE_BUNDLE__)
      userAgent = await evaluate<string>(target, 'navigator.userAgent')
      language = lang
      if (language) {
        // Sites pick their language from the request, so the page is reloaded once.
        onProgress({ label: `Switching the page to ${language}`, step: 0, steps: 1 })
        await command(target, 'Emulation.setLocaleOverride', { locale: language })
        await command(target, 'Emulation.setUserAgentOverride', {
          userAgent,
          acceptLanguage: language,
        })
        await reload(target)
        await evaluate(target, __CAPTURE_BUNDLE__)
      }
    },
    async setView({ width, height, mobile, theme }) {
      await command(target, 'Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      })
      await command(target, 'Emulation.setUserAgentOverride', {
        userAgent: mobile ? MOBILE_UA : userAgent,
        ...(language ? { acceptLanguage: language } : {}),
      })
      await command(target, 'Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: theme }],
      })
    },
    screenshot: (x, y, width, height) => screenshot(target, x, y, width, height),
    embedImages: (assets) => embedImages(target, assets, frameId),
    async stop() {
      await chrome.debugger.detach(target).catch(() => undefined)
    },
  }
}

// The functions passed to `driver.run` execute inside the page: each must be
// self-contained and reach the engine through `window.__pagerecast`.
type PageApi = NonNullable<Window['__pagerecast']>

export async function captureTab(
  tabId: number,
  settings: CaptureSettings,
  onProgress: (progress: CaptureProgress) => void,
): Promise<RecastFile> {
  const driver = chromeDriver(tabId)
  try {
    await driver.start(driver.emulates ? settings.language : '', onProgress)
    const meta = await driver.run(() => ({
      url: location.href,
      title: document.title,
      width: innerWidth,
      height: innerHeight,
    }))

    if (settings.scope === 'element') {
      onProgress({
        label: 'Click the part of the page to capture. Press Esc to cancel.',
        step: 0,
        steps: 1,
      })
      const picked = await driver.run(() => (window.__pagerecast as PageApi).pickElement(document))
      if (!picked) throw new CaptureError('Capture cancelled.')
    }

    // Without emulation, the page is captured in the colour scheme it shows now.
    const themes: Theme[] = driver.emulates
      ? settings.themes
      : [
          await driver.run(() =>
            matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          ),
        ]
    const views = settings.widths.flatMap((width) => themes.map((theme) => ({ width, theme })))
    const parts: CapturePart[] = []
    let step = 0
    for (const { width, theme } of views) {
      const label = viewportLabel(width, theme)
      const mobile = driver.emulates && width < 600
      const height = mobile ? 844 : meta.height
      const report = (what: string) =>
        onProgress({ label: `${label} · ${what}`, step, steps: views.length })
      report('setting up')

      await driver.setView({ width, height, mobile, theme })
      await wait(350)

      await driver.run(() => {
        const api = window.__pagerecast as PageApi
        api.thaw?.()
        api.thaw = api.freeze(document)
      })
      if (settings.preload) {
        report('loading lazy content')
        await driver.run(() => (window.__pagerecast as PageApi).preload(document))
      }
      report('reading layout')
      await driver.run(
        (options) => {
          const api = window.__pagerecast as PageApi
          api.restore?.()
          api.restore = api.prepare(document, options)
          window.scrollTo(0, 0)
        },
        { hideOverlays: settings.hideOverlays, freezeAnimations: true },
      )
      await wait(60)
      const walk: WalkResult = await driver.run(
        (scope, states) =>
          (window.__pagerecast as PageApi).walk(document, {
            scope,
            target: document.querySelector('[data-pagerecast-target]'),
            states,
          }),
        settings.scope,
        settings.states,
      )

      report('saving images')
      await driver.embedImages(walk.assets)
      const rasters: Record<string, string> = {}
      for (const r of walk.rasters) {
        const data = await driver.screenshot(r.x, r.y, r.width, r.height)
        if (data) rasters[r.asset] = data
      }
      let shot: string | undefined
      if (settings.screenshot) {
        report('taking the screenshot')
        const origin = await driver.run((scope) => {
          if (scope === 'element') {
            const r = document.querySelector('[data-pagerecast-target]')!.getBoundingClientRect()
            return { x: r.left + scrollX, y: r.top + scrollY }
          }
          return scope === 'viewport' ? { x: scrollX, y: scrollY } : { x: 0, y: 0 }
        }, settings.scope)
        shot = (await driver.screenshot(origin.x, origin.y, walk.width, walk.height)) ?? undefined
      }
      await driver.run(() => {
        const api = window.__pagerecast as PageApi
        api.restore?.()
        api.restore = undefined
        api.thaw?.()
        api.thaw = undefined
      })

      parts.push({
        walk,
        viewport: { width, height, deviceScaleFactor: 1, mobile },
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
      await driver.run(() => {
        document
          .querySelector('[data-pagerecast-target]')
          ?.removeAttribute('data-pagerecast-target')
        window.__pagerecast?.restore?.()
        window.__pagerecast?.thaw?.()
      })
    } catch {
      // The tab may have navigated away.
    }
    await driver.stop()
  }
}
