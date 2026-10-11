import { chromium, type Browser } from 'playwright-core'
import { captureOverCdp, type CdpCaptureOptions } from '@pagerecast/capture'
import type { RecastFile } from '@pagerecast/scene'

declare const __CAPTURE_BUNDLE__: string
declare const __VERSION__: string

export type CaptureSettings = Pick<
  CdpCaptureOptions,
  'scope' | 'widths' | 'themes' | 'hideOverlays' | 'preload' | 'screenshot' | 'language'
> & { browser?: string }

// The window the page opens in; desktop widths keep its height.
const WINDOW = { width: 1440, height: 900 }
const LAUNCH_ARGS = [`--window-size=${WINDOW.width},${WINDOW.height}`]

async function launch(executablePath?: string): Promise<Browser> {
  if (executablePath) return chromium.launch({ headless: true, executablePath, args: LAUNCH_ARGS })
  try {
    // Chromium installed by Playwright (`npx playwright install chromium`).
    return await chromium.launch({ headless: true, args: LAUNCH_ARGS })
  } catch {
    try {
      // Otherwise, Google Chrome if it is installed.
      return await chromium.launch({ headless: true, channel: 'chrome', args: LAUNCH_ARGS })
    } catch {
      throw new Error(
        'No Chromium found. Run `npx playwright install chromium`, or pass --browser with the path to Chrome or Chromium.',
      )
    }
  }
}

/** Opens the URL in headless Chromium and captures it like the extension does. */
export async function captureUrl(
  url: string,
  settings: CaptureSettings,
  onProgress: (label: string) => void,
): Promise<RecastFile> {
  const { browser: executablePath, ...options } = settings
  const browser = await launch(executablePath)
  try {
    // No viewport, colour scheme or locale emulation from Playwright: the capture sets its own.
    const context = await browser.newContext({ viewport: null, colorScheme: null })
    const page = await context.newPage()
    onProgress(`Opening ${url}`)
    const response = await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    if (response && !response.ok() && response.status() !== 304)
      onProgress(`The page answered ${response.status()}; capturing what it shows`)
    // Give client-rendered pages a moment to settle, without waiting forever on chatty ones.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)

    const session = await context.newCDPSession(page)
    return await captureOverCdp(
      {
        send: <T>(method: string, params?: Record<string, unknown>) =>
          session.send(method as Parameters<typeof session.send>[0], params) as Promise<T>,
        reload: async () => {
          await page.reload({ waitUntil: 'load', timeout: 60_000 })
        },
      },
      {
        ...options,
        height: WINDOW.height,
        bundle: __CAPTURE_BUNDLE__,
        version: __VERSION__,
        // The scene format names the extension and the plugin; the CLI runs the extension's engine.
        surface: 'extension',
        onProgress: (p) => onProgress(p.label),
      },
    )
  } finally {
    await browser.close()
  }
}
