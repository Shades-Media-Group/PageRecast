// Builds the website's demo from the sample page:
//  - four real layer rasters (page, surfaces, images and vectors, text) for the
//    exploded hero, rendered by restyling the sample page itself;
//  - layer counts from a PageRecast capture of that page;
//  - the top of every captured width and theme for the width viewer.
// Usage: node scripts/explode.mjs <capture.recast> <sample-page-url>
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'apps/site/public/demo')
const [input, sampleUrl] = process.argv.slice(2)
if (!input || !sampleUrl) {
  console.error('Usage: node scripts/explode.mjs <capture.recast> <sample-page-url>')
  process.exit(1)
}
const file = JSON.parse(gunzipSync(await readFile(input)).toString('utf8'))
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const WIDTH = 1440
const HEIGHT = 1000

// Counts from the real capture of the page at 1440, light.
const desktop =
  file.captures.find((c) => c.viewport.width === WIDTH && c.theme === 'light') ?? file.captures[0]
const stats = { layers: 0, texts: 0, images: 0 }
const count = (n) => {
  stats.layers++
  if (n.type === 'text') stats.texts++
  if (n.type === 'image' || n.type === 'svg' || n.type === 'raster') stats.images++
  if (n.type === 'frame') n.children.forEach(count)
}
count(desktop.root)

const browser = await chromium.launch()

// Each plane hides everything except one kind of layer.
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  colorScheme: 'light',
})
await page.goto(sampleUrl, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.evaluate(() => {
  // Surfaces: anything with its own background that isn't a full-width band.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && r.width < innerWidth * 0.95) {
      el.setAttribute('data-surface', '')
    }
  }
})
const hideText =
  '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' +
  'input,select,textarea,button{color:transparent!important}'
const hideMedia = 'svg,img{visibility:hidden!important}'
const clearAll =
  '*,*::before,*::after{background:transparent!important;border-color:transparent!important;box-shadow:none!important;outline:none!important}' +
  'html,body{background:transparent!important}'
const flatten =
  '[data-surface]{background:transparent!important;border-color:transparent!important;box-shadow:none!important}'
const onlySurfaces =
  '*:not([data-surface]){background:transparent!important;border-color:transparent!important;box-shadow:none!important}' +
  'html,body{background:transparent!important}'
const planes = [
  { name: 'Page', file: 'plane-page.jpg', css: hideText + hideMedia + flatten, png: false },
  {
    name: 'Surfaces',
    file: 'plane-surfaces.png',
    css: hideText + hideMedia + onlySurfaces,
    png: true,
  },
  { name: 'Images and vectors', file: 'plane-media.png', css: hideText + clearAll, png: true },
  { name: 'Text', file: 'plane-text.png', css: hideMedia + clearAll, png: true },
]
for (const plane of planes) {
  const handle = await page.addStyleTag({ content: plane.css })
  await page.screenshot({
    path: join(out, plane.file),
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    omitBackground: plane.png,
    ...(plane.png ? {} : { type: 'jpeg', quality: 88 }),
  })
  await handle.evaluate((el) => el.remove())
}
await page.close()

// The top of every captured width and theme, from the capture's own screenshots.
const widths = []
for (const capture of file.captures) {
  const asset = file.assets[capture.screenshot]
  const name = `w-${capture.viewport.width}-${capture.theme}.jpg`
  const shot = await browser.newPage({
    viewport: { width: capture.width, height: HEIGHT },
    deviceScaleFactor: 1,
  })
  await shot.setContent(
    `<body style="margin:0;overflow:hidden"><img style="display:block;width:${capture.width}px" src="data:${asset.mime};base64,${asset.data}">`,
    { waitUntil: 'load' },
  )
  await shot.screenshot({ path: join(out, name), type: 'jpeg', quality: 86 })
  await shot.close()
  widths.push({
    file: name,
    label: `${capture.viewport.width} · ${capture.theme === 'dark' ? 'Dark' : 'Light'}`,
    width: capture.viewport.width,
  })
}
await browser.close()

await writeFile(
  join(out, 'explode.json'),
  JSON.stringify({
    width: WIDTH,
    height: HEIGHT,
    planes: planes.map(({ name, file }) => ({ name, image: file })),
    stats,
    widths,
  }),
)
console.log(
  `demo: ${planes.length} planes; ${stats.layers} layers, ${stats.texts} text, ${stats.images} images`,
)
