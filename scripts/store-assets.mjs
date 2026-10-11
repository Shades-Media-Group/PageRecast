// Renders the README banners, the GitHub social preview and the store images
// from real product screenshots in assets/store/source.
// Usage: node scripts/store-assets.mjs
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const source = join(root, 'assets/store/source')
const store = join(root, 'assets/store')
const brand = join(root, 'assets/brand')
await mkdir(store, { recursive: true })

const RED = '#F9000A' // brand red: fields behind large white type
const RED_TEXT = '#E0000A' // white small text on this reaches 4.5:1
const PAPER = '#FDFDFC'
const INK = '#0A0A0B'

const b64 = async (path) => (await readFile(path)).toString('base64')
const shot = async (name) => `data:image/png;base64,${await b64(join(source, name))}`
const font = await b64(
  require.resolve('@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2'),
)

// The full-colour logo on red: the red page turns white, the overlap turns ink,
// the rose layer and the white wordmark stay as they are in logo-dark.svg.
const logoOnRed = (await readFile(join(brand, 'logo-dark.svg'), 'utf8'))
  .replace(`fill="${RED}"`, `fill="${PAPER}"`)
  .replace(`fill="${PAPER}" d="M34 26`, `fill="${INK}" d="M34 26`)

const shots = {
  ready: await shot('ext-ready-light.png'),
  captured: {
    light: await shot('ext-captured-light.png'),
    dark: await shot('ext-captured-dark.png'),
  },
  review: {
    light: await shot('plugin-review-light.png'),
    dark: await shot('plugin-review-dark.png'),
  },
  paste: await shot('plugin-paste-light.png'),
  done: await shot('plugin-done-light.png'),
}

const base = (bg, fg) => `<style>
@font-face { font-family: 'Hanken Grotesk'; font-weight: 100 900; src: url(data:font/woff2;base64,${font}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; }
body { font-family: 'Hanken Grotesk', sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; position: relative;
  background: ${bg}; color: ${fg}; }
.logo { position: absolute; }
.logo svg { display: block; height: 100%; width: auto; }
h1 { position: absolute; font-weight: 720; letter-spacing: -0.045em; line-height: 0.96; }
p { position: absolute; font-weight: 600; letter-spacing: -0.01em; }
/* Panels are flat, top-cropped and allowed to run off the canvas. A tight dark
   contact shadow keeps the edge crisp; a long soft one lifts it off the field. */
.panel { position: absolute; display: block; height: auto; border-radius: var(--r); }
</style>`

const panelShadow = (s, onRed) =>
  `box-shadow: 0 0 0 ${s}px rgba(10,10,11,${onRed ? 0.1 : 0.08}), 0 ${2 * s}px ${4 * s}px rgba(${onRed ? '90,0,0,.28' : '10,10,11,.10'}), 0 ${32 * s}px ${64 * s}px -${16 * s}px rgba(${onRed ? '70,0,0,.6' : '10,10,11,.28'});`

const panel = (src, s, x, y, w, onRed = true) =>
  `<img class="panel" src="${src}" style="--r:${14 * s}px; left:${x}px; top:${y}px; width:${w}px; ${panelShadow(s, onRed)}">`

/**
 * The campaign hero: a red field, the logo, one big white line, and the two
 * real panels (capture in Chrome, review in Figma) running off the bottom edge.
 * Laid out on a 1280 × 640 grid and scaled by height; the panels hug the right.
 */
const hero = (theme, { width, height }) => {
  // Laid out on a 1280 × 640 grid, scaled to fit and centred for other ratios.
  const s = Math.min(height / 640, width / 1280)
  const dy = (height - 640 * s) / 2
  const right = width - 64 * s
  return `${base(RED, PAPER)}<style>
  .logo { left: ${72 * s}px; top: ${64 * s + dy}px; height: ${38 * s}px; }
  h1 { left: ${68 * s}px; top: ${204 * s + dy}px; font-size: ${78 * s}px; }
  p { left: ${72 * s}px; bottom: ${60 * s + dy}px; font-size: ${24 * s}px; line-height: 1.3; }
  </style>
  <div class="logo">${logoOnRed}</div>
  <h1>Any web page.<br>Real Figma<br>layers.</h1>
  <p>Free and open source.<br>No account, no tracking.</p>
  ${panel(shots.captured[theme], s, right - 634 * s, 72 * s + dy, 300 * s)}
  ${panel(shots.review[theme], s, right - 310 * s, 160 * s + dy, 310 * s)}`
}

/** Chrome Web Store screenshots, 1280 × 800: a red column with the line, the product on paper. */
const screenshot = (title, sub, panels) => `${base(PAPER, INK)}<style>
  .field { position: absolute; left: 0; top: 0; width: 500px; height: 100%; background: ${RED_TEXT}; color: ${PAPER}; }
  .logo { left: 56px; top: 56px; height: 30px; }
  h1 { left: 52px; top: 176px; width: 420px; font-size: 60px; }
  p { left: 56px; bottom: 56px; width: 380px; font-size: 20px; font-weight: 500; line-height: 1.4; letter-spacing: 0; }
  </style>
  <div class="field"><div class="logo">${logoOnRed}</div><h1>${title}</h1><p>${sub}</p></div>
  ${panels}`

const jobs = [
  ['readme-banner-light.png', brand, 1280, 640, 2, hero('light', { width: 1280, height: 640 })],
  ['readme-banner-dark.png', brand, 1280, 640, 2, hero('dark', { width: 1280, height: 640 })],
  ['social-preview.png', brand, 1280, 640, 1, hero('light', { width: 1280, height: 640 })],
  ['chrome-promo-marquee.png', store, 1400, 560, 1, hero('light', { width: 1400, height: 560 })],
  ['figma-cover.png', store, 1920, 1080, 1, hero('light', { width: 1920, height: 1080 })],
  [
    'chrome-promo-small.png',
    store,
    440,
    280,
    1,
    `${base(RED, PAPER)}<style>
      .logo { left: 28px; top: 28px; height: 22px; }
      h1 { left: 26px; bottom: 26px; font-size: 34px; }
    </style>
    <div class="logo">${logoOnRed}</div>
    <h1>Any web page.<br>Real Figma<br>layers.</h1>
    ${panel(shots.captured.light, 0.5, 248, 40, 172)}`,
  ],
  [
    'chrome-screenshot-1.png',
    store,
    1280,
    800,
    1,
    screenshot(
      'Every width.<br>Both themes.<br>One capture.',
      'Desktop, tablet, mobile or any width, in light and dark, from the side panel.',
      panel(shots.ready, 1, 660, 72, 460, false),
    ),
  ],
  [
    'chrome-screenshot-2.png',
    store,
    1280,
    800,
    1,
    screenshot(
      'Capture here.<br>Paste in Figma.',
      'Works behind a login, on staging and on localhost. Nothing leaves your computer.',
      `${panel(shots.captured.light, 1, 556, 72, 330, false)}${panel(shots.paste, 1, 914, 196, 330, false)}`,
    ),
  ],
  [
    'chrome-screenshot-3.png',
    store,
    1280,
    800,
    1,
    screenshot(
      'Real frames,<br>text and<br>Auto Layout.',
      'Pick the frames, import, and keep editing. Variables and text styles included.',
      `${panel(shots.review.light, 1, 548, 72, 330, false)}${panel(shots.done, 1, 906, 196, 330, false)}`,
    ),
  ],
]

const browser = await chromium.launch()
for (const [name, dir, width, height, scale, html] of jobs) {
  const file = join(dir, name)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(`<!doctype html><meta charset="utf-8">${html}`, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: file })
  await page.close()
  console.log(file.replace(root, ''))
}
await browser.close()
