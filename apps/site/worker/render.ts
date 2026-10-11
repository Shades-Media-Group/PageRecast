/**
 * Renders a public page in Cloudflare Browser Rendering and captures it with the
 * same engine and page-injected walker as the extension and the CLI.
 * Nothing here logs or keeps the address.
 */
import puppeteer, { type Browser, type BrowserWorker } from '@cloudflare/puppeteer'
import { captureOverCdp } from '@pagerecast/capture'
import { encodeFile } from '@pagerecast/scene'
import bundle, { version } from './capture-bundle.js'
import { allowedSubrequest, RenderError, type RenderRequest } from './request'

/** Everything, from starting the browser to the packed file. */
export const TIME_LIMIT_MS = 45_000
// The CLI's window: desktop widths keep this height.
const WINDOW_HEIGHT = 900
// Chrome cannot screenshot more than this in one go, so the page stops there too.
const MAX_PAGE_HEIGHT = 16_000

async function capture(browser: Browser, request: RenderRequest): Promise<Uint8Array> {
  // A fresh session in a fresh context: no cookies or storage go with the request.
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  let refused = false
  await page.setRequestInterception(true)
  page.on('request', (r) => {
    if (allowedSubrequest(r.url())) return void r.continue()
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) refused = true
    void r.abort()
  })

  try {
    const response = await page.goto(request.url, { waitUntil: 'load', timeout: 25_000 })
    // A page that answers with an error still shows something; capture it, like the CLI.
    if (!response) throw new Error('no response')
  } catch {
    if (refused)
      throw new RenderError(
        400,
        'needs-extension',
        'The page redirected to a private address; capture it with the extension.',
      )
    throw new RenderError(422, 'unreachable', 'The page did not load.')
  }
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 5_000 }).catch(() => undefined)

  const session = await page.createCDPSession()
  let file
  try {
    file = await captureOverCdp(
      {
        send: <T>(method: string, params?: Record<string, unknown>) =>
          session.send(method as never, params as never) as Promise<T>,
        reload: async () => {
          await page.reload({ waitUntil: 'load', timeout: 25_000 })
        },
      },
      {
        scope: 'page',
        widths: request.widths,
        themes: request.themes,
        language: request.language,
        hideOverlays: true,
        preload: true,
        screenshot: true,
        maxHeight: MAX_PAGE_HEIGHT,
        height: WINDOW_HEIGHT,
        bundle,
        version,
        // As in the CLI: the scene format names the extension, whose engine this is.
        surface: 'extension',
      },
    )
  } catch {
    throw new RenderError(422, 'capture-failed', 'The page loaded but could not be captured.')
  }
  return encodeFile(file)
}

/** Opens the page and returns the gzipped `.recast` file. */
export async function render(binding: BrowserWorker, request: RenderRequest): Promise<Uint8Array> {
  let browser: Browser | undefined
  let finished = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RenderError(504, 'timeout', 'The page took longer than 45 seconds.')),
      TIME_LIMIT_MS,
    )
  })
  try {
    return await Promise.race([
      (async () => {
        try {
          browser = await puppeteer.launch(binding)
        } catch {
          // Out of browser time or concurrent sessions, or the service is down.
          throw new RenderError(503, 'unavailable', 'The renderer is busy. Try again in a minute.')
        }
        // Timed out while the browser started: the finally below has already run.
        if (finished) await browser.close().catch(() => undefined)
        return capture(browser, request)
      })(),
      timeout,
    ])
  } finally {
    finished = true
    clearTimeout(timer)
    await browser?.close().catch(() => undefined)
  }
}
