import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
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

// Later tests build on the captures the first one leaves in the history.
test.describe.configure({ mode: 'serial' })

// Set PR_SHOTS to a folder to keep screenshots of the panel for design review.
async function shot(panel: Page, name: string) {
  if (!process.env.PR_SHOTS) return
  for (const scheme of ['light', 'dark'] as const) {
    await panel.emulateMedia({ colorScheme: scheme })
    await panel.screenshot({ path: `${process.env.PR_SHOTS}/extension-${name}-${scheme}.png` })
  }
  await panel.emulateMedia({ colorScheme: 'light' })
}

async function openPanel() {
  const panel = await context.newPage()
  await panel.setViewportSize({ width: 380, height: 820 })
  await panel.goto(`chrome-extension://${extensionId}/sidepanel/index.html`)
  // Put the page under test in its own focused window, as a real user would have it.
  await panel.evaluate((url) => chrome.windows.create({ url, focused: true }), `${origin}/`)
  await expect(panel.locator('.target p.muted')).toHaveText('127.0.0.1:' + new URL(origin).port, {
    timeout: 10_000,
  })
  return panel
}

async function unpack(bytes: Uint8Array | Buffer): Promise<RecastFile> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text()) as RecastFile
}

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
  const panel = await openPanel()
  await shot(panel, 'start')
  // Desktop and Mobile.
  await panel.getByRole('checkbox').nth(3).check()
  await panel.getByRole('button', { name: /Capture 2 frames/ }).click()
  await expect(panel.getByRole('button', { name: 'Copy for Figma' })).toBeVisible({
    timeout: 30_000,
  })
  await shot(panel, 'captured')

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
  // Each frame is exactly the width it was captured at, even when content overflows.
  expect(file.captures.map((c) => c.width)).toEqual([1440, 390])
  expect(file.generator).toMatchObject({ name: 'PageRecast', surface: 'extension' })
  // Content that fades in on scroll is captured in its final, visible state.
  expect(JSON.stringify(file.captures[0]!.root)).toContain('Revealed on scroll')
  await panel.close()
})

test('captures from the right-click menu and copies several captures as one file', async () => {
  const panel = await openPanel()
  // What the background worker leaves after a right-click on the page: the panel takes it from here.
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const panelWindow = await chrome.windows.getCurrent()
    await chrome.storage.session.set({
      pending: { scope: 'page', tabId: tab!.id, windowId: panelWindow.id, at: Date.now() },
    })
  })
  await expect(panel.getByRole('button', { name: 'Copy for Figma' })).toBeVisible({
    timeout: 30_000,
  })
  // The widths chosen on this site in the first test were remembered for it.
  await expect(panel.locator('.result-text .num').first()).toHaveText('2 frames')

  await panel.getByRole('button', { name: 'Select' }).click()
  await expect(panel.getByRole('button', { name: 'Choose captures to combine' })).toBeDisabled()
  const boxes = panel.locator('.history .pr-check')
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await expect(panel.getByRole('button', { name: 'Copy 2 for Figma' })).toBeEnabled()
  await shot(panel, 'tray')

  const [download] = await Promise.all([
    panel.waitForEvent('download'),
    panel.getByRole('button', { name: 'Download as one .recast file' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('2-pages.recast')
  const file = await unpack(await readFile((await download.path())!))
  expect(file.captures).toHaveLength(4)
  expect(new Set(file.captures.map((c) => c.id)).size).toBe(4)
  for (const capture of file.captures) {
    expect(file.assets[capture.screenshot!]).toMatchObject({ kind: 'image' })
    for (const [, id] of JSON.stringify(capture.root).matchAll(/"asset":"([^"]+)"/g))
      expect(file.assets[id!]).toBeDefined()
  }
})
