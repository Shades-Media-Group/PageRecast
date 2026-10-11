import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { captureLink } from '@pagerecast/capture'
import { DICTIONARIES } from '@pagerecast/i18n'
import { decode, type RecastFile } from '@pagerecast/scene'

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
  // The panel opens light; the dark shot uses the automatic theme in a dark browser.
  const theme = await panel.evaluate(() => document.documentElement.dataset.theme)
  for (const scheme of ['light', 'dark'] as const) {
    await panel.emulateMedia({ colorScheme: scheme })
    await panel.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      scheme === 'dark' ? 'auto' : theme,
    )
    await panel.waitForTimeout(250)
    await panel.screenshot({ path: `${process.env.PR_SHOTS}/extension-${name}-${scheme}.png` })
  }
  await panel.emulateMedia({ colorScheme: 'light' })
  await panel.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
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
    // The panel follows the browser's language; these tests read it in English.
    locale: 'en-US',
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
  await panel.getByRole('button', { name: 'Mobile 390' }).click()
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

test('captures a list of URLs and picks them for one copy', async () => {
  const panel = await openPanel()
  await panel
    .getByRole('textbox', { name: 'URLs to capture' })
    .fill(`${origin}/states.html, ${origin}/`)
  await expect(panel.getByText('2 pages, captured one after another')).toBeVisible()
  await panel.getByRole('button', { name: 'Capture 2 URLs' }).click()
  // Both land in Recent, ticked for the combined copy.
  await expect(panel.getByRole('button', { name: 'Copy 2 for Figma' })).toBeEnabled({
    timeout: 90_000,
  })
  await expect(panel.locator('.history .pr-check:checked')).toHaveCount(2)
})

test('a capture link from the Figma plugin captures through the site page and copies', async () => {
  test.setTimeout(120_000)
  // The page as deployed: built by Vite, served for pagerecast.shades.md from disk.
  const site = fileURLToPath(new URL('../apps/site/', import.meta.url))
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  execFileSync('node', [vite, 'build'], { cwd: site, stdio: 'pipe' })
  await context.route('https://pagerecast.shades.md/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const file = `${site}dist${path.endsWith('/') ? `${path}index.html` : path}`
    await route.fulfill({ path: file }).catch(() => route.fulfill({ status: 404 }))
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://pagerecast.shades.md',
  })

  const page = await context.newPage()
  const link = captureLink({ url: `${origin}/`, widths: [1440, 390], theme: 'light', language: '' })
  // An unpacked extension has its own id; the page takes it from the query.
  await page.goto(link.replace('/capture/#', `/capture/?extension=${extensionId}#`))
  await expect(page.locator('#capture-target')).toHaveText(/127\.0\.0\.1:\d+ at 1440 and 390 px/)
  await page.getByRole('button', { name: 'Capture', exact: true }).click()
  await expect(page.locator('main.capture')).toHaveAttribute('data-state', /copied|ready/, {
    timeout: 90_000,
  })
  if ((await page.locator('main.capture').getAttribute('data-state')) === 'ready')
    await page.getByRole('button', { name: 'Copy for Figma' }).click()
  await expect(page.locator('#capture-status')).toContainText('Copied — paste in Figma')
  await shot(page, 'capture-link')

  const file = await decode(await page.evaluate(() => navigator.clipboard.readText()))
  expect(file.captures.map((c) => c.viewport.width)).toEqual([1440, 390])
})

test('the capture page asks for the extension when none answers', async () => {
  const page = await context.newPage()
  const link = captureLink({
    url: 'https://example.com/',
    widths: [1440],
    theme: 'light',
    language: '',
  })
  // An id no installed extension has.
  await page.goto(
    link.replace('/capture/#', '/capture/?extension=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#'),
  )
  await expect(page.getByRole('heading', { name: 'Install the extension first' })).toBeVisible({
    timeout: 10_000,
  })
  await shot(page, 'capture-link-missing')
})

test('the panel speaks the chosen interface language', async () => {
  test.setTimeout(120_000)
  const errors: string[] = []
  let panel = await openPanel()
  const setSettings = (patch: Record<string, unknown>) =>
    panel.evaluate(async (patch) => {
      const { settings } = await chrome.storage.local.get('settings')
      await chrome.storage.local.set({ settings: { ...(settings as object), ...patch } })
    }, patch)
  // The panel reads its settings when it opens, so each change opens it afresh.
  const reopen = async (patch: Record<string, unknown>) => {
    await setSettings(patch)
    await panel.close()
    panel = await openPanel()
    panel.on('pageerror', (e) => errors.push(e.message))
  }
  for (const locale of ['ru', 'ro', 'fr', 'zh-CN'] as const) {
    const words = DICTIONARIES[locale]
    await reopen({ interfaceLanguage: locale, editing: true })
    await expect(panel.locator('html')).toHaveAttribute('lang', locale)
    await expect(panel.getByRole('heading', { name: words['panel.before'] })).toBeVisible()
    await expect(panel.locator('.dock .pr-button--primary')).toBeVisible()
    await shot(panel, `${locale}-settings`)
    await panel
      .getByRole('combobox', { name: words['language.interface'] })
      .scrollIntoViewIfNeeded()
    await shot(panel, `${locale}-settings-language`)

    await reopen({ editing: false })

    await expect(panel.getByRole('heading', { name: words['panel.summary'] })).toBeVisible()
    await shot(panel, `${locale}-ready`)
    await panel.locator('.dock .pr-button--primary').click()
    await expect(
      panel.locator('.dock').getByRole('button', { name: words['common.copyForFigma'] }),
    ).toBeVisible({
      timeout: 30_000,
    })
    await shot(panel, `${locale}-captured`)
  }
  // Back to the language of the browser.
  await setSettings({ interfaceLanguage: '' })
  expect(errors).toEqual([])
  await panel.close()
})

test('reset all preferences clears the settings and every site in two clicks', async () => {
  const panel = await openPanel()
  const errors: string[] = []
  panel.on('pageerror', (e) => errors.push(e.message))
  const stored = () =>
    panel.evaluate(
      async () =>
        (await chrome.storage.local.get(['settings', 'sites'])) as {
          settings: Record<string, unknown>
          sites?: Record<string, unknown>
        },
    )
  if (!(await panel.getByRole('heading', { name: 'Before capturing' }).isVisible()))
    await panel.getByRole('button', { name: 'Capture settings' }).click()
  // Earlier tests left this site's widths behind, so there is something to reset.
  const reset = panel.getByRole('button', { name: 'Reset all preferences' })
  await expect(reset).toBeEnabled()
  await panel.getByRole('switch', { name: /Hide cookie banners/ }).uncheck()
  await panel
    .getByRole('group', { name: 'Interface theme' })
    .getByRole('button', { name: 'Dark' })
    .click()
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'dark')
  await reset.scrollIntoViewIfNeeded()
  await shot(panel, 'settings-reset')

  await reset.click()
  await panel.getByRole('button', { name: 'Click again to reset everything' }).click()
  await expect(reset).toBeDisabled()
  await expect(panel.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(panel.getByRole('switch', { name: /Hide cookie banners/ })).toBeChecked()
  const after = await stored()
  expect(after.sites).toBeUndefined()
  expect(after.settings).toMatchObject({ hideOverlays: true, appearance: 'light', widths: [1440] })
  // The note about Chrome's debugging bar stays seen.
  expect(after.settings.seenDebuggerNote).toBe(true)
  // The credit closes the settings.
  await expect(panel.locator('.credit')).toBeVisible()
  expect(errors).toEqual([])
  await panel.close()
})
