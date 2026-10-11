import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { inlinePage } from '../apps/figma-plugin/src/ui/archive'

// The plugin inlines a saved page's files before rendering it; this runs that
// step in a real browser, where DOMParser exists.
let bundle = ''
test.beforeAll(async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../apps/figma-plugin/src/ui/archive.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'iife',
    globalName: 'archive',
    write: false,
  })
  bundle = result.outputFiles[0]!.text
})

test('inlines stylesheets, imports, images and fonts of a saved page', async ({ page }) => {
  await page.setContent('<!doctype html><title>t</title>')
  await page.addScriptTag({ content: bundle })
  const html = await page.evaluate(() => {
    const text = (s: string) => ({ type: 'text/css', bytes: new TextEncoder().encode(s) })
    const png = { type: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }
    const base = 'https://archive.invalid/site/'
    const resources = new Map([
      [`${base}css/main.css`, text('@import "parts.css"; body { background: url(../img/bg.png) }')],
      [`${base}css/parts.css`, text('@font-face { font-family: X; src: url("../fonts/x.woff2") }')],
      [`${base}fonts/x.woff2`, { type: 'font/woff2', bytes: new Uint8Array([1, 2, 3]) }],
      [`${base}img/bg.png`, png],
      [`${base}img/photo.png`, png],
    ])
    const api = (window as unknown as { archive: { inlinePage: typeof inlinePage } }).archive
    return api.inlinePage({
      url: `${base}index.html`,
      resources,
      html:
        '<link rel="stylesheet" href="css/main.css"><img src="img/photo.png" srcset="img/photo@2x.png 2x">' +
        '<div style="background-image: url(img/bg.png)"></div><img src="https://cdn.example/missing.png">',
    })
  })
  expect(html).not.toContain('<link')
  expect(html).toContain('font-family: X; src: url("data:font/woff2;base64,AQID")')
  expect(html).toContain('body { background: url("data:image/png;base64,iVBORw==") }')
  expect(html).toContain('<img src="data:image/png;base64,iVBORw==">')
  expect(html).toContain(
    'style="background-image: url(&quot;data:image/png;base64,iVBORw==&quot;)"',
  )
  // Files the archive does not have keep their address.
  expect(html).toContain('src="https://cdn.example/missing.png"')
})
