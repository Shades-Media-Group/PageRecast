import '@fontsource-variable/hanken-grotesk/wght.css'
import './site.css'
import logo from '../../../assets/brand/logo.svg?raw'
import { CHROME, DOCS, FIGMA, REPO, SHADES } from './links'

declare const __VERSION__: string

const base = import.meta.env.BASE_URL

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

/** Produced by scripts/explode.mjs from a real capture of this page. */
interface Explode {
  width: number
  height: number
  image: string
  planes: { name: string; boxes: [number, number, number, number][] }[]
  stats: { layers: number; texts: number; images: number }
  widths: { file: string; label: string; width: number }[]
}

async function explode() {
  const figure = document.querySelector<HTMLElement>('[data-explode]')
  const stage = figure?.querySelector<HTMLElement>('.explode-stage')
  if (!figure || !stage) return
  let data: Explode
  try {
    data = await (await fetch(`${base}demo/explode.json`)).json()
  } catch {
    figure.hidden = true
    return
  }
  // Count the numbers up once the figure is on screen.
  const counters = Object.entries(data.stats)
    .map(
      ([key, value]) => [figure.querySelector<HTMLElement>(`[data-stat="${key}"]`), value] as const,
    )
    .filter((entry): entry is readonly [HTMLElement, number] => entry[0] !== null)
  const countUp = () => {
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200)
      const eased = 1 - Math.pow(1 - p, 3)
      for (const [el, value] of counters)
        el.textContent = Math.round(value * eased).toLocaleString('en')
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  new IntersectionObserver((entries, observer) => {
    if (entries.some((e) => e.isIntersecting)) {
      countUp()
      observer.disconnect()
    }
  }).observe(figure)

  const stack = document.createElement('div')
  stack.className = 'explode-stack'
  stack.style.width = `${data.width}px`
  stack.style.height = `${data.height}px`
  const image = `url(${base}demo/${data.image})`
  const planes = data.planes.map((plane, i) => {
    const el = document.createElement('div')
    el.className = `explode-plane${i === 0 ? ' explode-plane--base' : ''}`
    el.setAttribute('aria-hidden', 'true')
    for (const [x, y, w, h] of plane.boxes) {
      const box = document.createElement('div')
      Object.assign(box.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: image,
        backgroundPosition: `${-x}px ${-y}px`,
        backgroundSize: `${data.width}px auto`,
      })
      el.appendChild(box)
    }
    stack.appendChild(el)
    return el
  })
  stage.appendChild(stack)

  // Scale the page to the stage, then separate the layers as the hero scrolls.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const layout = () => {
    const scale = Math.min(1, (stage.clientWidth * 0.74) / data.width)
    const t = reduced
      ? 1
      : Math.min(
          1,
          Math.max(0.12, 1 - stage.getBoundingClientRect().top / (innerHeight * 0.8)) * 1.3,
        )
    stack.style.transform = `translateX(-50%) scale(${scale}) rotateX(${t * 46}deg) rotateZ(${t * -22}deg)`
    planes.forEach((plane, i) => {
      plane.style.transform = `translateZ(${t * i * 240}px)`
    })
  }
  layout()
  let frame = 0
  const schedule = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(layout)
  }
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)

  const widths = document.querySelector<HTMLElement>('[data-widths]')
  if (widths) {
    widths.innerHTML = data.widths
      .map(
        (w) =>
          `<figure style="flex:${w.width} 1 0"><img src="${base}demo/${w.file}" alt="This page captured at ${w.label}" loading="lazy"><figcaption>${w.label}</figcaption></figure>`,
      )
      .join('')
    widths
      .querySelectorAll('figure')
      .forEach((f, i) => ((f as HTMLElement).style.transitionDelay = `${i * 70}ms`))
    reveal.observe(widths)
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

void explode()
