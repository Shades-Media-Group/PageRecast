import '@fontsource-variable/hanken-grotesk/wght.css'
import './common.css'
import './site.css'
import logo from '../../../assets/brand/logo.svg?raw'
import { fill, lang, strings } from './strings'

declare const __VERSION__: string

const base = import.meta.env.BASE_URL
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

/** The home page's translated strings (i18n/<lang>.json, home.runtime). */
interface HomeStrings {
  devices: Record<string, string>
  light: string
  dark: string
  viewerAlt: { light: string; dark: string }
  viewerCaption: string
  notes: Record<string, { title: string; detail: string }>
}
const t = strings<HomeStrings>()
// The wordmark follows the text colour, so the logo works in both themes.
const themedLogo = logo.replace('fill="#0A0A0B" transform', 'fill="currentColor" transform')
for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = themedLogo
// The footer sign-off: the wordmark alone, its viewBox fitted to the letters.
for (const el of document.querySelectorAll('[data-wordmark]')) {
  const word = themedLogo.match(/<path fill="currentColor"[^>]*\/>/)?.[0]
  if (!word) continue
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g>${word}</g></svg>`
  const svg = el.querySelector('svg')!
  const box = svg.querySelector('g')!.getBBox()
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`)
}
for (const el of document.querySelectorAll('[data-version]')) el.textContent = __VERSION__

/** Produced by scripts/explode.mjs from this site and a capture of it. */
interface Demo {
  width: number
  height: number
  viewHeight: number
  planes: { name: string; image: string }[]
  stats: { layers: number; texts: number; images: number }
  widths: { file: string; label: string; width: number }[]
  anatomy: {
    image: string
    width: number
    height: number
    notes: { box: [number, number, number, number]; title: string; detail: string }[]
  }
}

// Reveal chapters as they scroll into view.
document.documentElement.classList.add('js')
const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        reveal.unobserve(entry.target)
      }
    }
  },
  { rootMargin: '0px 0px -12% 0px' },
)
for (const el of document.querySelectorAll('[data-reveal]')) reveal.observe(el)

function countUp(scope: HTMLElement, stats: Demo['stats']) {
  const counters = Object.entries(stats)
    .map(
      ([key, value]) => [scope.querySelector<HTMLElement>(`[data-stat="${key}"]`), value] as const,
    )
    .filter((entry): entry is readonly [HTMLElement, number] => entry[0] !== null)
  const run = () => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = reduced ? 1 : Math.min(1, (now - start) / 1200)
      const eased = 1 - Math.pow(1 - p, 3)
      for (const [el, value] of counters)
        el.textContent = Math.round(value * eased).toLocaleString(lang)
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  new IntersectionObserver((entries, observer) => {
    if (entries.some((e) => e.isIntersecting)) {
      run()
      observer.disconnect()
    }
  }).observe(scope)
}

/**
 * The signature moment: the sample page, pinned on screen, separates into its
 * real layers as you scroll through the section.
 */
function explode(data: Demo) {
  const section = document.querySelector<HTMLElement>('[data-explode]')
  const stage = section?.querySelector<HTMLElement>('.explode-stage')
  if (!section || !stage) return
  countUp(section, data.stats)

  const stack = document.createElement('div')
  stack.className = 'explode-stack'
  stack.style.width = `${data.width}px`
  stack.style.height = `${data.height}px`
  const planes = data.planes.map((plane, i) => {
    const el = document.createElement('div')
    el.className = `explode-plane explode-plane--${i}`
    el.style.backgroundImage = `url(${base}demo/${plane.image})`
    el.setAttribute('aria-hidden', 'true')
    stack.appendChild(el)
    return el
  })
  stage.appendChild(stack)

  const layout = () => {
    const rect = section.getBoundingClientRect()
    const travel = Math.max(1, rect.height - innerHeight)
    const t = reduced
      ? 1
      : Math.min(1, Math.max(0, (innerHeight * 0.35 - rect.top) / travel) * 1.25)
    const scale = Math.min(
      0.6,
      (stage.clientWidth * 0.72) / data.width,
      (stage.clientHeight * 0.95) / data.height,
    )
    stack.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(${t * 52}deg) rotateZ(${t * -26}deg)`
    planes.forEach((plane, i) => {
      plane.style.transform = `translateZ(${t * i * 170}px)`
    })
    section.style.setProperty('--t', t.toFixed(3))
  }
  layout()
  let frame = 0
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(layout)
  }
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
}

/** Width and theme viewer: one stage, the real capture at true relative scale. */
function viewer(data: Demo) {
  const root = document.querySelector<HTMLElement>('[data-viewer]')
  const image = root?.querySelector<HTMLImageElement>('[data-viewer-image]')
  const stage = root?.querySelector<HTMLElement>('.viewer-stage')
  const frame = root?.querySelector<HTMLElement>('.viewer-frame')
  const caption = root?.querySelector<HTMLElement>('[data-viewer-caption]')
  const widthGroup = root?.querySelector<HTMLElement>('[data-viewer-widths]')
  if (!root || !image || !stage || !frame || !caption || !widthGroup) return
  const widths = [...new Set(data.widths.map((w) => w.width))].sort((a, b) => b - a)
  widthGroup.innerHTML = widths
    .map(
      (w, i) =>
        `<button type="button" role="radio" aria-checked="${i === 0}" data-width="${w}">${t.devices[w] ?? w} <span>${w}</span></button>`,
    )
    .join('')
  let width = widths[0]!
  let theme: 'light' | 'dark' = 'light'
  const max = Math.max(...widths)
  const render = () => {
    const shot =
      data.widths.find((w) => w.width === width && w.file.includes(theme)) ?? data.widths[0]!
    const scale = Math.min(1, stage.clientWidth / max)
    const full = Math.round(max * scale)
    const shown = Math.round(width * scale)
    frame.style.width = `${full}px`
    frame.style.height = `${Math.round(data.viewHeight * scale * 0.82)}px`
    // The frame is always full width; clipping opens or closes it to the new width.
    frame.style.clipPath = `inset(0 ${(full - shown) / 2}px round 14px)`
    image.style.width = `${shown}px`
    if (!image.src.endsWith(shot.file)) {
      image.style.opacity = '0.3'
      image.onload = () => (image.style.opacity = '1')
      image.src = `${base}demo/${shot.file}`
    }
    image.alt = fill(t.viewerAlt[theme], { width })
    caption.innerHTML = `<b>${width} px</b> · ${fill(t.viewerCaption, { theme: t[theme] })}`
  }
  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button) return
    if (button.dataset.width) width = Number(button.dataset.width)
    if (button.dataset.theme) theme = button.dataset.theme as typeof theme
    for (const b of button.parentElement!.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b === button))
    }
    render()
  })
  addEventListener('resize', render)
  render()
}

/** A real section of this page, marked with the layers PageRecast builds from it. */
function anatomy(data: Demo['anatomy']) {
  const root = document.querySelector<HTMLElement>('[data-anatomy]')
  const stage = root?.querySelector<HTMLElement>('.anatomy-stage')
  const image = root?.querySelector<HTMLImageElement>('[data-anatomy-image]')
  const list = root?.querySelector<HTMLElement>('[data-anatomy-notes]')
  if (!root || !stage || !image || !list) return
  image.src = `${base}demo/${data.image}`
  image.width = data.width
  image.height = data.height
  // Numbered top to bottom, so the margin reads like a spec sheet.
  const notes = [...data.notes].sort((a, b) => a.box[1] - b.box[1])
  const pairs = notes.map((note, i) => {
    const box = document.createElement('span')
    box.className = 'anatomy-box'
    const pin = document.createElement('span')
    pin.className = 'anatomy-pin'
    pin.innerHTML = `<b>${i + 1}</b><i></i>`
    stage.append(box, pin)
    const item = document.createElement('li')
    item.innerHTML = `<strong></strong><span></span>`
    // explode.json is written in English; the dictionary has each note translated.
    const text = t.notes[note.title] ?? note
    item.querySelector('strong')!.textContent = text.title
    item.querySelector('span')!.textContent = text.detail
    list.appendChild(item)
    return { note, box, pin, item }
  })
  const place = () => {
    const scale = image.clientWidth / data.width
    for (const { note, box, pin } of pairs) {
      const [x, y, w, h] = note.box
      const left = image.offsetLeft + x * scale
      const top = image.offsetTop + y * scale
      box.style.left = `${left}px`
      box.style.top = `${top}px`
      box.style.width = `${w * scale}px`
      box.style.height = `${h * scale}px`
      // The pin sits in the left margin; its leader runs to the element's edge.
      pin.style.top = `${top + (h * scale) / 2}px`
      pin.style.width = `${left - 8}px`
    }
  }
  for (const { box, pin, item } of pairs) {
    const on = (state: boolean) => {
      root.classList.toggle('is-hovering', state)
      for (const el of [box, pin, item]) el.classList.toggle('is-on', state)
    }
    for (const el of [box, pin, item]) {
      el.addEventListener('mouseenter', () => on(true))
      el.addEventListener('mouseleave', () => on(false))
    }
  }
  image.addEventListener('load', place)
  addEventListener('resize', place)
  place()
}

fetch(`${base}demo/explode.json`)
  .then((r) => r.json() as Promise<Demo>)
  .then((data) => {
    explode(data)
    viewer(data)
    anatomy(data.anatomy)
  })
  .catch(() => document.querySelector<HTMLElement>('[data-explode]')?.setAttribute('hidden', ''))
