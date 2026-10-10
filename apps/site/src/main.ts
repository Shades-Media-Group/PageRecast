import '@fontsource-variable/hanken-grotesk/wght.css'
import './site.css'
import logo from '../../../assets/brand/logo.svg?raw'
import { CHROME, DOCS, FIGMA, REPO, SHADES } from './links'

declare const __VERSION__: string

const base = import.meta.env.BASE_URL
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const links: Record<string, string> = {
  chrome: CHROME,
  figma: FIGMA,
  docs: DOCS,
  repo: REPO,
  shades: SHADES,
  format: `${REPO}/blob/main/docs/scene-format.md`,
  privacy: `${REPO}/blob/main/PRIVACY.md`,
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
}
for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-link]')) {
  a.href = links[a.dataset.link!] ?? '#'
  a.rel = 'noopener'
}
for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = logo
for (const el of document.querySelectorAll('[data-version]')) el.textContent = __VERSION__

/** Produced by scripts/explode.mjs from the sample page and a capture of it. */
interface Demo {
  width: number
  height: number
  planes: { name: string; image: string }[]
  stats: { layers: number; texts: number; images: number }
  widths: { file: string; label: string; width: number }[]
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
        el.textContent = Math.round(value * eased).toLocaleString('en')
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
    const scale = Math.min(0.6, (stage.clientWidth * 0.68) / data.width)
    stack.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(${t * 52}deg) rotateZ(${t * -26}deg)`
    planes.forEach((plane, i) => {
      plane.style.transform = `translateZ(${t * i * 220}px)`
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
  const names: Record<number, string> = {
    1440: 'Desktop',
    1280: 'Laptop',
    768: 'Tablet',
    390: 'Mobile',
  }
  widthGroup.innerHTML = widths
    .map(
      (w, i) =>
        `<button type="button" role="radio" aria-checked="${i === 0}" data-width="${w}">${names[w] ?? w} <span>${w}</span></button>`,
    )
    .join('')
  let width = widths[0]!
  let theme = 'light'
  const max = Math.max(...widths)
  const render = () => {
    const shot =
      data.widths.find((w) => w.width === width && w.file.includes(theme)) ?? data.widths[0]!
    const scale = Math.min(1, stage.clientWidth / max)
    const full = Math.round(max * scale)
    const shown = Math.round(width * scale)
    frame.style.width = `${full}px`
    frame.style.height = `${Math.round(data.height * scale * 0.82)}px`
    // The frame is always full width; clipping opens or closes it to the new width.
    frame.style.clipPath = `inset(0 ${(full - shown) / 2}px round 14px)`
    image.style.width = `${shown}px`
    if (!image.src.endsWith(shot.file)) {
      image.style.opacity = '0.3'
      image.onload = () => (image.style.opacity = '1')
      image.src = `${base}demo/${shot.file}`
    }
    image.alt = `The sample page captured at ${width} px in ${theme} mode`
    caption.innerHTML = `<b>${width} px</b> · ${theme === 'dark' ? 'Dark' : 'Light'} · one frame in Figma`
  }
  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button) return
    if (button.dataset.width) width = Number(button.dataset.width)
    if (button.dataset.theme) theme = button.dataset.theme
    for (const b of button.parentElement!.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b === button))
    }
    render()
  })
  addEventListener('resize', render)
  render()
}

fetch(`${base}demo/explode.json`)
  .then((r) => r.json() as Promise<Demo>)
  .then((data) => {
    explode(data)
    viewer(data)
  })
  .catch(() => document.querySelector<HTMLElement>('[data-explode]')?.setAttribute('hidden', ''))
