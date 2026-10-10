// Builds the website's demo from the website itself, at 2x:
//  - four real layer rasters (page, surfaces, images and vectors, text) for the
//    exploded page, rendered by restyling the page;
//  - layer counts from a PageRecast capture of the page;
//  - the top of the page at every captured width and theme, for the width viewer;
//  - the install row, with the layers PageRecast builds from it, for the anatomy.
// The demo's own sections are hidden while rendering so the page never shows itself.
// Usage: node scripts/explode.mjs <capture.recast> <site-url>
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'apps/site/public/demo')
const [input, siteUrl] = process.argv.slice(2)
if (!input || !siteUrl) {
  console.error('Usage: node scripts/explode.mjs <capture.recast> <site-url>')
  process.exit(1)
}
const file = JSON.parse(gunzipSync(await readFile(input)).toString('utf8'))
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const WIDTH = 1440
const HEIGHT = 1000
const PLANE_HEIGHT = 1400
const SCALE = 2
const STILL =
  '*,*::before,*::after{animation:none!important;transition:none!important}' +
  '[data-reveal]{opacity:1!important;transform:none!important}' +
  '[data-explode],#widths,#layers{display:none!important}' +
  '.nav{position:static!important}html{scroll-behavior:auto!important}'

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
const open = async (width, theme, height = HEIGHT) => {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: SCALE,
    colorScheme: theme,
  })
  await page.goto(siteUrl, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: STILL })
  await page.evaluate(() => document.fonts.ready)
  return page
}

// The anatomy: the install row and four of the layers built from it.
const hex = (rgb) =>
  '#' +
  rgb
    .match(/\d+/g)
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
const read = (page) =>
  page.evaluate(() => {
    const row = document.querySelector('.install-row')
    const item = row.querySelector('.install-item')
    const tile = item.querySelector('.tile')
    const title = item.querySelector('strong')
    const text = item.querySelector('.install-text')
    const button = item.querySelector('.btn')
    const origin = row.getBoundingClientRect()
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return [r.x - origin.x, r.y - origin.y, r.width, r.height].map((n) => Math.round(n))
    }
    const cs = (el) => getComputedStyle(el)
    return {
      row: [origin.x, origin.y + scrollY, origin.width, origin.height],
      tile: { box: box(tile), shapes: tile.querySelectorAll('path, circle').length },
      title: {
        box: box(title),
        family: cs(title).fontFamily.split(',')[0].replace(/["']/g, '').replace(' Variable', ''),
        weight: cs(title).fontWeight,
        size: cs(title).fontSize,
      },
      button: {
        box: box(button),
        gap: cs(button).columnGap,
        padding: cs(button).paddingLeft,
        height: button.getBoundingClientRect().height,
      },
      text: { box: box(text), color: cs(text).color },
    }
  })
const light = await open(WIDTH, 'light', PLANE_HEIGHT)
const a = await read(light)
await light.evaluate((y) => scrollTo(0, y - 200), a.row[1])
await light.screenshot({
  path: join(out, 'anatomy.png'),
  clip: { x: a.row[0], y: a.row[1], width: a.row[2], height: a.row[3] },
  fullPage: true,
})
const dark = await open(WIDTH, 'dark')
const darkText = (await read(dark)).text.color
await dark.close()
const anatomy = {
  image: 'anatomy.png',
  width: Math.round(a.row[2]),
  height: Math.round(a.row[3]),
  notes: [
    {
      box: a.tile.box,
      title: 'Vector',
      detail: `${a.tile.shapes} shapes from the page's SVG, still editable`,
    },
    {
      box: a.title.box,
      title: 'Text',
      detail: `${a.title.family} · ${a.title.weight} · ${parseFloat(a.title.size)} px`,
    },
    {
      box: a.button.box,
      title: 'Auto Layout',
      detail: `Horizontal · gap ${parseFloat(a.button.gap)} · padding ${parseFloat(a.button.padding)} · fully rounded`,
    },
    {
      box: a.text.box,
      title: 'Colour variable',
      detail: `Light ${hex(a.text.color)} · Dark ${hex(darkText)}`,
    },
  ],
}

// The page shown in the demo slices uses the anatomy just rendered.
const anatomyUrl = `data:image/png;base64,${(await readFile(join(out, 'anatomy.png'))).toString('base64')}`
const settle = (page) =>
  page.evaluate((src) => {
    document.querySelectorAll('.anatomy-box').forEach((el) => el.remove())
    const img = document.querySelector('[data-anatomy-image]')
    if (img) img.src = src
    scrollTo(0, 0)
    return img ? img.decode().catch(() => {}) : undefined
  }, anatomyUrl)

// Each plane hides everything except one kind of layer.
await settle(light)
await light.evaluate(() => {
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
  '.btn-arrow{background:transparent!important}'
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
  const handle = await light.addStyleTag({ content: plane.css })
  await light.screenshot({
    path: join(out, plane.file),
    clip: { x: 0, y: 0, width: WIDTH, height: PLANE_HEIGHT },
    omitBackground: plane.png,
    ...(plane.png ? {} : { type: 'jpeg', quality: 84 }),
  })
  await handle.evaluate((el) => el.remove())
}
await light.close()

// The top of the page at every captured width and theme.
const views = [...new Set(file.captures.map((c) => `${c.viewport.width}-${c.theme}`))]
const widths = []
for (const view of views) {
  const [w, theme] = view.split('-')
  const width = Number(w)
  const page = await open(width, theme)
  await settle(page)
  const name = `w-${width}-${theme}.jpg`
  await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 82 })
  await page.close()
  widths.push({ file: name, label: `${width} · ${theme === 'dark' ? 'Dark' : 'Light'}`, width })
}
await browser.close()

await writeFile(
  join(out, 'explode.json'),
  JSON.stringify({
    width: WIDTH,
    height: PLANE_HEIGHT,
    viewHeight: HEIGHT,
    planes: planes.map(({ name, file }) => ({ name, image: file })),
    stats,
    widths,
    anatomy,
  }),
)
console.log(
  `demo: ${planes.length} planes; ${stats.layers} layers, ${stats.texts} text, ${stats.images} images`,
)
