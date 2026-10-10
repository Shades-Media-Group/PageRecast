// Turns a capture of the PageRecast site into the website's exploded hero and
// width gallery. Usage: node scripts/explode.mjs <capture.recast>
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'apps/site/public/demo')
const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/explode.mjs <capture.recast>')
  process.exit(1)
}
const file = JSON.parse(gunzipSync(await readFile(input)).toString('utf8'))
await mkdir(out, { recursive: true })

const CROP = 1100
const desktop =
  file.captures.find((c) => c.viewport.width >= 1200 && c.theme === 'light') ?? file.captures[0]

// Cut from the privacy chapter down (red band, code, install), so the page never
// shows its own hero exploding inside itself.
const find = (n, test) =>
  test(n) ? n : n.type === 'frame' ? n.children.map((c) => find(c, test)).find(Boolean) : null
const anchorY = (capture) =>
  Math.round(find(capture.root, (n) => n.html?.includes('#privacy'))?.y ?? 0)
const OFFSET = anchorY(desktop)

// Planes from back to front: the page, its sections, its media, its text.
const planes = [
  { name: 'Page', boxes: [[0, 0, desktop.width, CROP]] },
  { name: 'Sections', boxes: [] },
  { name: 'Images and vectors', boxes: [] },
  { name: 'Text', boxes: [] },
]
const stats = { layers: 0, texts: 0, images: 0 }
const clip = (n) => {
  const x = Math.max(0, n.x)
  const y = Math.max(0, n.y - OFFSET)
  const w = Math.min(desktop.width, n.x + n.width) - x
  const h = Math.min(CROP, n.y - OFFSET + n.height) - y
  return w > 2 && h > 2 ? [Math.round(x), Math.round(y), Math.round(w), Math.round(h)] : null
}
const visit = (n, depth) => {
  stats.layers++
  if (n.type === 'text') stats.texts++
  if (n.type === 'image' || n.type === 'svg' || n.type === 'raster') stats.images++
  const box = clip(n)
  if (box && depth > 0) {
    if (n.type === 'text') planes[3].boxes.push(box)
    else if (n.type !== 'frame') planes[2].boxes.push(box)
    else if (n.fills?.length && n.width * n.height > desktop.width * 40) planes[1].boxes.push(box)
  }
  if (n.type === 'frame') for (const c of n.children) visit(c, depth + 1)
}
for (const capture of file.captures) visit(capture.root, 0)
// Stats describe one capture, the one the hero shows.
Object.assign(stats, { layers: 0, texts: 0, images: 0 })
planes.slice(1).forEach((p) => (p.boxes.length = 0))
visit(desktop.root, 0)

// Crop screenshots with a browser: the top of each capture.
const browser = await chromium.launch()
const crop = async (capture, name, height, offset = 0) => {
  const asset = file.assets[capture.screenshot]
  const page = await browser.newPage({
    viewport: { width: capture.width, height },
    deviceScaleFactor: 1,
  })
  await page.setContent(
    `<body style="margin:0;overflow:hidden"><img style="display:block;width:${capture.width}px;margin-top:${-offset}px" src="data:${asset.mime};base64,${asset.data}">`,
    { waitUntil: 'load' },
  )
  await page.screenshot({ path: join(out, name), type: 'jpeg', quality: 86 })
  await page.close()
}
await crop(desktop, 'page.jpg', CROP, OFFSET)
const widths = []
for (const capture of file.captures) {
  const name = `w-${capture.viewport.width}-${capture.theme}.jpg`
  await crop(capture, name, Math.round(capture.width * 1.15), anchorY(capture))
  widths.push({
    file: name,
    label: `${capture.viewport.width} · ${capture.theme === 'dark' ? 'Dark' : 'Light'}`,
    width: capture.viewport.width,
  })
}
await browser.close()

await writeFile(
  join(out, 'explode.json'),
  JSON.stringify({ width: desktop.width, height: CROP, image: 'page.jpg', planes, stats, widths }),
)
console.log(
  `demo: ${planes.map((p) => `${p.name} ${p.boxes.length}`).join(', ')}; ${stats.layers} layers`,
)
