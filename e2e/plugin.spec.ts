import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { encodeFile, SCENE_FORMAT, SCENE_VERSION, type RecastFile } from '@pagerecast/scene'
import { captureLink } from '@pagerecast/capture'
import { DICTIONARIES } from '@pagerecast/i18n'
import { DEFAULT_SETTINGS, type Settings } from '../apps/figma-plugin/src/shared/messages'
import { startBridge, type Bridge } from '../packages/mcp/src/bridge'

const root = fileURLToPath(new URL('..', import.meta.url))
const TABS = ['Web', 'Extension', 'File', 'Code', 'MCP', 'API']

// The plugin window builds once; its tests share that build.
test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  execFileSync('node', ['apps/figma-plugin/build.mjs'], { cwd: root })
})

/** The plugin UI as Figma frames it: 400 × 620, settings from the main thread. */
async function open(
  page: Page,
  scheme: 'light' | 'dark' = 'light',
  // Dark runs follow Figma's theme, which takes the automatic appearance.
  settings: Settings = { ...DEFAULT_SETTINGS, appearance: scheme === 'dark' ? 'auto' : 'light' },
) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.setViewportSize({ width: 400, height: 620 })
  await page.emulateMedia({ colorScheme: scheme })
  await page.goto(`file://${root}apps/figma-plugin/dist/ui.html`)
  if (scheme === 'dark')
    await page.evaluate(() => document.documentElement.classList.add('figma-dark'))
  // The UI posts to `parent`, which is this window outside Figma: keep what it sends.
  await page.evaluate((settings) => {
    const sent: unknown[] = []
    ;(window as unknown as { sent: unknown[] }).sent = sent
    window.addEventListener('message', (e) => {
      const m = (e.data as { pluginMessage?: { type: string } }).pluginMessage
      if (m && m.type !== 'ready') sent.push(m)
    })
    window.postMessage({ pluginMessage: { type: 'ready', settings, version: '1.0.0' } }, '*')
  }, settings)
  // The window listens from an effect that can run after the page loads: until the
  // settings show, send them again.
  await expect
    .poll(() =>
      page.evaluate((settings) => {
        window.postMessage({ pluginMessage: { type: 'ready', settings, version: '1.0.0' } }, '*')
        return document.documentElement.dataset.theme
      }, settings),
    )
    .toBe(settings.appearance)
  // The first tab, Web, is open; its name depends on the interface language.
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')

  return errors
}

const sent = (page: Page) =>
  page.evaluate(() => (window as unknown as { sent: { type: string; url?: string }[] }).sent)

/** The settings the window last asked the main thread to save. */
const saved = async (page: Page) =>
  (
    (await sent(page)).filter((m) => m.type === 'settings').at(-1) as unknown as
      { settings: Settings } | undefined
  )?.settings

// Set PR_SHOTS to a folder to keep screenshots of every tab for design review.
async function shot(page: Page, name: string) {
  if (process.env.PR_SHOTS)
    await page.screenshot({ path: `${process.env.PR_SHOTS}/plugin-${name}.png` })
}

test('opens light in dark Figma, and settings switch it to dark', async ({ page }) => {
  const background = () =>
    page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg').trim())
  const errors = await open(page, 'dark', DEFAULT_SETTINGS)
  const light = await background()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

  await page.getByRole('button', { name: 'Settings' }).click()
  await page
    .getByRole('group', { name: 'Interface theme' })
    .getByRole('button', { name: 'Dark' })
    .click()
  expect(await background()).not.toBe(light)
  await page.waitForTimeout(300) // switches ease into their dark colours
  await shot(page, 'settings-theme-dark')
  const saved = (await sent(page)).filter((m) => m.type === 'settings').at(-1) as unknown as {
    settings: { appearance: string }
  }
  expect(saved.settings.appearance).toBe('dark')

  // On dark the red pill keeps a plain shadow: no coloured glow.
  await page.getByRole('button', { name: 'Back from Import settings' }).click()
  await page.getByRole('tab', { name: 'Code' }).click()
  await page.getByLabel('HTML and CSS').fill('<p>Hi</p>')
  const shadow = await page
    .getByRole('button', { name: 'Render and review' })
    .evaluate((button) => getComputedStyle(button).boxShadow)
  expect(shadow).not.toMatch(/224, 0, 10|120, 0, 5/)
  expect(errors).toEqual([])
})

test('reset all preferences is off at the defaults and takes two clicks', async ({ page }) => {
  const errors = await open(page, 'light', DEFAULT_SETTINGS)
  await page.getByRole('button', { name: 'Import settings' }).click()
  const reset = page.getByRole('button', { name: 'Reset all preferences' })
  await expect(reset).toBeDisabled()

  // A change anywhere turns it on.
  await page.getByRole('switch', { name: /Review before importing/ }).uncheck()
  await page.getByRole('switch', { name: /HTML layer names/ }).check()
  await expect(reset).toBeEnabled()
  await reset.click()
  const confirm = page.getByRole('button', { name: 'Click again to reset everything' })
  await expect(confirm).toBeVisible()
  await shot(page, 'settings-reset-confirm-light')
  // Moving away is a no.
  await page.getByRole('switch', { name: /Review before importing/ }).focus()
  await expect(reset).toBeVisible()
  await expect.poll(async () => (await saved(page))?.review).toBe(false)

  await reset.click()
  await confirm.click()
  await expect(reset).toBeDisabled()
  await expect.poll(() => saved(page)).toEqual(DEFAULT_SETTINGS)
  await expect(page.getByRole('switch', { name: /Review before importing/ })).toBeChecked()
  expect(errors).toEqual([])
})

test('reset keeps the import count that decides the rating request', async ({ page }) => {
  await open(page, 'light', {
    ...DEFAULT_SETTINGS,
    imports: 9,
    askedForRating: true,
    appearance: 'dark',
    domains: { 'example.com': DEFAULT_SETTINGS.defaults },
  })
  await page.getByRole('button', { name: 'Import settings' }).click()
  await page.getByRole('button', { name: 'Reset all preferences' }).click()
  await page.getByRole('button', { name: 'Click again to reset everything' }).click()
  await expect
    .poll(() => saved(page))
    .toEqual({ ...DEFAULT_SETTINGS, imports: 9, askedForRating: true })
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
})

test('every tab renders in light and dark without errors', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    const errors = await open(page, scheme)
    for (const name of TABS) {
      await page.getByRole('tab', { name, exact: true }).click()
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await shot(page, `${name.toLowerCase()}-${scheme}`)
    }
    await page.getByRole('tab', { name: 'Web' }).click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await shot(page, `web-edit-${scheme}`)
    expect(errors).toEqual([])
  }
})

test('the Web tab hands the URL and settings to the extension through a capture link', async ({
  page,
}) => {
  await open(page)
  const capture = page.getByRole('button', { name: 'Capture in browser' })
  await expect(capture).toBeDisabled()
  await page.getByLabel('Page URL').fill('not a url')
  await expect(page.getByText('Enter a web address')).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Mobile 390' }).click()
  // A width of one's own is added as a pill, ticked, and kept with the settings.
  await page.getByLabel('Custom width in pixels').fill('1024')
  await page.getByRole('button', { name: 'Add width' }).click()
  await expect(page.getByRole('button', { name: 'Custom 1024' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await shot(page, 'web-custom-width')
  await page.getByRole('button', { name: 'Both' }).click()
  await page.getByLabel('Language').fill('de-DE')
  await page.getByLabel('Page URL').fill('example.com/pricing')
  await capture.click()

  // postMessage delivers on a later task.
  await expect
    .poll(async () => (await sent(page)).filter((m) => m.type === 'open-url').at(-1)?.url)
    .toBe(
      captureLink({
        url: 'https://example.com/pricing',
        widths: [1440, 1024, 390],
        theme: 'both',
        language: 'de-DE',
      }),
    )
  await expect(page.getByText('Opened example.com in your browser')).toBeVisible()
  // The settings are kept for next time.
  const saved = (await sent(page)).filter((m) => m.type === 'settings').at(-1) as unknown as {
    settings: typeof DEFAULT_SETTINGS
  }
  expect(saved.settings.web).toEqual({
    widths: [1440, 1024, 390],
    customWidths: [1024],
    theme: 'both',
    language: 'de-DE',
  })
})

const RENDER = 'https://pagerecast.shades.md/api/render'
const CORS = { 'access-control-allow-origin': '*' }

test('the Web tab imports a public page through the render service', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    const errors = await open(page, scheme)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const bodies: unknown[] = []
    await page.route(RENDER, async (route) => {
      bodies.push(route.request().postDataJSON())
      await held
      await route.fulfill({
        headers: { ...CORS, 'content-type': 'application/octet-stream' },
        body: Buffer.from(await encodeFile(minimalFile())),
      })
    })
    await page.getByLabel('Page URL').fill('example.com')
    await page.waitForTimeout(300) // the pill eases into its enabled colour
    await shot(page, `web-cloud-idle-${scheme}`)
    await page.getByRole('button', { name: 'Import page' }).click()
    await expect(page.getByText('Opening example.com…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import page' })).toBeDisabled()
    await shot(page, `web-cloud-rendering-${scheme}`)

    release()
    await expect(page.getByRole('button', { name: 'Back from Review' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'From an agent' })).toBeVisible()
    // Only the address and the capture settings go to the server.
    expect(bodies).toEqual([
      { url: 'https://example.com/', widths: [1440], theme: 'light', language: '' },
    ])
    await page.unroute(RENDER)
    expect(errors).toEqual([])
  }
})

test('the Web tab explains failed renders and keeps local pages on this computer', async ({
  page,
}) => {
  for (const scheme of ['light', 'dark'] as const) {
    const errors = await open(page, scheme)
    let calls = 0
    await page.route(RENDER, async (route) => {
      calls++
      await route.fulfill({
        status: 504,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'timeout',
          message: 'The page took longer than 45 seconds.',
        }),
      })
    })
    await page.getByLabel('Page URL').fill('example.com')
    await page.getByRole('button', { name: 'Import page' }).click()
    await expect(
      page.getByText('example.com took longer than 45 seconds. Try fewer widths.'),
    ).toBeVisible()
    await shot(page, `web-cloud-error-${scheme}`)

    // localhost is refused before anything is sent, and points to the extension.
    await page.getByLabel('Page URL').fill('http://localhost:3000')
    await page.getByRole('button', { name: 'Import page' }).click()
    await expect(
      page.getByText('Pages on localhost or behind a login need the extension.'),
    ).toBeVisible()
    await shot(page, `web-cloud-local-${scheme}`)
    expect(calls).toBe(1)
    await page.getByRole('button', { name: 'Get the extension' }).click()
    await expect(page.getByRole('tab', { name: 'Extension' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.unroute(RENDER)
    // The browser logs the deliberate 504; nothing else may fail.
    expect(errors.filter((e) => !e.includes('status of 504'))).toEqual([])
  }
})

test('a capture pasted into a field imports instead of filling it', async ({ page }) => {
  await open(page)
  const file: RecastFile = minimalFile()
  const { encodeClipboard } = await import('@pagerecast/scene')
  const payload = await encodeClipboard(file)
  await page.getByLabel('Page URL').focus()
  await page.evaluate((text) => {
    const event = new ClipboardEvent('paste', { clipboardData: new DataTransfer(), bubbles: true })
    event.clipboardData!.setData('text', text)
    document.activeElement!.dispatchEvent(event)
  }, payload)
  await expect(page.getByRole('button', { name: 'Back from Review' })).toBeVisible()
})

function minimalFile(): RecastFile {
  return {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    generator: { name: 'PageRecast', version: '1.0.0', surface: 'extension' },
    source: { url: 'https://example.com/', title: 'From an agent', capturedAt: '' },
    assets: {},
    captures: [
      {
        id: 'c1',
        label: 'Desktop · 1440 · Light',
        viewport: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
        theme: 'light',
        scope: 'page',
        width: 1440,
        height: 900,
        root: {
          type: 'frame',
          id: 'n0',
          key: 'html',
          name: 'Page',
          tag: 'html',
          x: 0,
          y: 0,
          width: 1440,
          height: 900,
          fills: [],
          clips: true,
          position: 'static',
          children: [],
        },
      },
    ],
  }
}

test.describe('agent imports', () => {
  let bridge: Bridge
  test.beforeEach(async ({ page }) => {
    bridge = await startBridge({ port: 0 })
    // The plugin always looks on 127.0.0.1:7357; send that to this test's bridge.
    await page.route('http://127.0.0.1:7357/**', async (route) => {
      const request = route.request()
      const response = await route.fetch({
        url: request.url().replace('http://127.0.0.1:7357', bridge.url),
      })
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      })
    })
  })
  test.afterEach(async () => bridge.close())

  test('pairs once, then imports what the agent sends and clears it from the bridge', async ({
    page,
  }) => {
    const errors = await open(page)
    await page.getByRole('tab', { name: 'MCP' }).click()
    await page.getByRole('switch', { name: /Listen for agent imports/ }).check()
    await expect(page.getByText('An agent is running')).toBeVisible()

    await page.getByRole('textbox', { name: 'Pairing code' }).fill('AAAA-AAAA-AAAA-AAAA')
    await page.getByRole('button', { name: 'Pair' }).click()
    await expect(page.getByText('That code does not match')).toBeVisible()

    // Typed loosely: lower case, without hyphens.
    await page
      .getByRole('textbox', { name: 'Pairing code' })
      .fill(bridge.pairingCode.toLowerCase().replace(/-/g, ''))
    await page.getByRole('button', { name: 'Pair' }).click()
    await expect(page.getByText('Paired.')).toBeVisible()
    await shot(page, 'mcp-paired-light')

    bridge.add(await encodeFile(minimalFile()), {
      name: 'example.com.recast',
      title: 'From an agent',
      url: 'https://example.com/',
    })
    await expect(page.getByRole('button', { name: 'Back from Review' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('heading', { name: 'From an agent' })).toBeVisible()
    const left = await fetch(`${bridge.url}/v1/files`, {
      headers: { Authorization: `Bearer ${bridge.pairingCode}` },
    })
    expect(await left.json()).toEqual({ files: [] })
    // The browser logs the deliberate wrong-code attempt; nothing else may fail.
    expect(errors.filter((e) => !e.includes('status of 401'))).toEqual([])
  })
})

test('every interface language renders the paste, review, done and settings views', async ({
  page,
}) => {
  const { encodeClipboard } = await import('@pagerecast/scene')
  const payload = await encodeClipboard(minimalFile())
  for (const locale of ['ru', 'ro', 'fr', 'zh-CN'] as const) {
    const words = DICTIONARIES[locale]
    for (const scheme of ['light', 'dark'] as const) {
      // Dark runs take the automatic theme, which follows dark Figma.
      const errors = await open(page, scheme, {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: locale,
        appearance: scheme === 'dark' ? 'auto' : 'light',
      })
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('tab').first()).toHaveText(words['tab.web'])
      await page.getByRole('tab').nth(1).click()
      await expect(page.getByRole('heading', { name: words['ext.title'] })).toBeVisible()
      await shot(page, `${locale}-paste-${scheme}`)

      // A pasted capture opens the review; Figma then reports a missing font.
      await page.evaluate((text) => {
        const event = new ClipboardEvent('paste', { clipboardData: new DataTransfer() })
        event.clipboardData!.setData('text', text)
        document.dispatchEvent(event)
      }, payload)
      await expect(page.getByRole('heading', { name: words['review.frames'] })).toBeVisible()
      await page.evaluate(() =>
        window.postMessage(
          {
            pluginMessage: {
              type: 'fonts',
              missing: [
                {
                  requested: 'Söhne Breit',
                  styles: ['Regular', 'Bold'],
                  count: 42,
                  replacement: 'Inter',
                },
              ],
              families: ['Inter', 'Roboto'],
            },
          },
          '*',
        ),
      )
      await expect(page.getByRole('button', { name: words['fonts.checkAgain'] })).toBeVisible()
      await shot(page, `${locale}-review-${scheme}`)
      await page.locator('.font-row').scrollIntoViewIfNeeded()
      await shot(page, `${locale}-review-fonts-${scheme}`)

      await page.evaluate(() =>
        window.postMessage(
          {
            pluginMessage: {
              type: 'done',
              report: {
                frames: 2,
                texts: 1840,
                images: 23,
                vectors: 61,
                rasters: 1,
                autoLayouts: 412,
                components: 7,
                instances: 38,
                variables: 24,
                textStyles: 9,
                reusedStyles: 0,
                updated: 1,
                matchedFromLibrary: 0,
                substitutions: [{ requested: 'Söhne Breit', used: 'Inter', count: 42 }],
                warnings: [
                  { key: 'note.image', params: { name: 'Hero' } },
                  { key: 'note.duplicate', params: { frame: 'Desktop · 1440 · Light' } },
                ],
                durationMs: 3240,
              },
            },
          },
          '*',
        ),
      )
      await expect(page.getByRole('button', { name: words['plugin.importAnother'] })).toBeVisible()
      await shot(page, `${locale}-done-${scheme}`)
      await page.locator('.facts').scrollIntoViewIfNeeded()
      await shot(page, `${locale}-done-notes-${scheme}`)

      await page.getByRole('button', { name: words['plugin.settings'] }).click()
      await shot(page, `${locale}-settings-${scheme}`)
      await page
        .getByRole('combobox', { name: words['language.interface'] })
        .scrollIntoViewIfNeeded()
      await shot(page, `${locale}-settings-language-${scheme}`)
      expect(errors).toEqual([])
    }
  }
})
