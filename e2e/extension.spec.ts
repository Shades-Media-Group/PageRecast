import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RecastFile } from '@pagerecast/scene'

const extensionPath = fileURLToPath(new URL('../apps/extension/dist', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

let server: Server
let origin = ''
let context: BrowserContext
let extensionId = ''

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const body = await readFile(
        fixtures + (req.url === '/' ? 'kitchen-sink.html' : req.url!.slice(1)),
      )
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    // Lets a local run point at a Chromium build that works on this machine.
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      // Chrome for Testing crashes on recent macOS when it probes iCloud passkeys.
      '--disable-features=WebAuthenticationICloudKeychain,WebAuthenticationPasskeysUI',
    ],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  extensionId = new URL(worker.url()).host
})

test.afterAll(async () => {
  await context?.close()
  server?.close()
})

test('captures a page at two widths from the side panel', async () => {
  const panel = await context.newPage()
  await panel.setViewportSize({ width: 380, height: 820 })
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`)
  // Set PR_SHOTS to a folder to keep screenshots of the panel for design review.
  const shot = async (name: string) => {
    if (!process.env.PR_SHOTS) return
    for (const scheme of ['light', 'dark'] as const) {
      await panel.emulateMedia({ colorScheme: scheme })
      await panel.screenshot({ path: `${process.env.PR_SHOTS}/extension-${name}-${scheme}.png` })
    }
    await panel.emulateMedia({ colorScheme: 'light' })
  }
  // Put the page under test in its own focused window, as a real user would have it.
  await panel.evaluate((url) => chrome.windows.create({ url, focused: true }), `${origin}/`)
  await expect(panel.locator('.target p.muted')).toHaveText('127.0.0.1:' + new URL(origin).port, {
    timeout: 10_000,
  })

  await shot('start')
  // Desktop and Mobile.
  await panel.getByRole('checkbox').nth(3).check()
  await panel.getByRole('button', { name: /Capture 2 frames/ }).click()
  await expect(panel.getByRole('button', { name: 'Copy for Figma' })).toBeVisible({
    timeout: 30_000,
  })
  await shot('captured')

  const file = (await panel.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open('pagerecast', 1)
      r.onsuccess = () => resolve(r.result)
    })
    const entries = await new Promise<{ data: Uint8Array }[]>((resolve) => {
      const r = db.transaction('captures').objectStore('captures').getAll()
      r.onsuccess = () => resolve(r.result)
    })
    const stream = new Blob([entries[0]!.data as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    return JSON.parse(await new Response(stream).text())
  })) as RecastFile

  expect(file.captures.map((c) => c.viewport.width)).toEqual([1440, 390])
  expect(file.captures[1]!.viewport.mobile).toBe(true)
  for (const capture of file.captures) {
    expect(capture.root.children.length).toBeGreaterThan(0)
    expect(capture.screenshot && file.assets[capture.screenshot]).toMatchObject({ kind: 'image' })
  }
  // Mobile layout really changed: the page is narrower than desktop.
  expect(file.captures[1]!.width).toBeLessThan(file.captures[0]!.width)
  expect(file.generator).toMatchObject({ name: 'PageRecast', surface: 'extension' })
})
