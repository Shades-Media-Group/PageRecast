import { parseContent } from './css'

export interface PrepareOptions {
  hideOverlays: boolean
  freezeAnimations: boolean
}

const CONSENT_SELECTORS = [
  '#onetrust-banner-sdk',
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '#usercentrics-root',
  '#didomi-host',
  '.fc-consent-root',
  '.qc-cmp2-container',
  '#truste-consent-track',
  '.osano-cm-window',
  '#cookie-law-info-bar',
  '.cc-window',
  '.cookie-banner',
  '#cookie-banner',
  '#cookieConsent',
  '.cookie-consent',
  '[aria-label*="cookie" i]',
]
const CONSENT_PATTERN = /cookie|consent|gdpr|onetrust|cookiebot|didomi|usercentrics|cmp/i
const VOID = new Set([
  'img',
  'input',
  'br',
  'hr',
  'area',
  'col',
  'embed',
  'source',
  'track',
  'wbr',
  'svg',
  'video',
  'canvas',
  'iframe',
  'select',
  'textarea',
])

/**
 * Gets the live page ready for a faithful capture and returns a function that
 * puts everything back.
 */
export function prepare(doc: Document, options: PrepareOptions): () => void {
  const win = doc.defaultView!
  const undo: (() => void)[] = []
  const style = doc.createElement('style')
  style.setAttribute('data-pagerecast', '')
  let css =
    '[data-pr-hide-before]::before{content:none!important}[data-pr-hide-after]::after{content:none!important}'
  if (options.freezeAnimations) {
    // Jump every animation and transition to its end state: reveal effects show their final frame.
    css +=
      '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;' +
      'transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}'
  }
  style.textContent = css
  doc.head.appendChild(style)
  undo.push(() => style.remove())

  if (options.hideOverlays) {
    const hidden = new Set<HTMLElement>()
    for (const selector of CONSENT_SELECTORS) {
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) hidden.add(el)
    }
    for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('body > *, body > * > *'))) {
      const cs = win.getComputedStyle(el)
      if (
        (cs.position === 'fixed' || cs.position === 'sticky') &&
        CONSENT_PATTERN.test(`${el.id} ${el.className} ${el.getAttribute('aria-label') ?? ''}`)
      ) {
        hidden.add(el)
      }
    }
    for (const el of hidden) {
      const previous = el.style.getPropertyValue('display')
      const priority = el.style.getPropertyPriority('display')
      el.style.setProperty('display', 'none', 'important')
      undo.push(() => el.style.setProperty('display', previous, priority))
    }
    // Consent dialogs often lock scrolling on the page behind them.
    for (const el of [doc.documentElement, doc.body]) {
      if (win.getComputedStyle(el).overflowY === 'hidden') {
        const previous = el.style.overflow
        el.style.setProperty('overflow', 'visible', 'important')
        undo.push(() => (el.style.overflow = previous))
      }
    }
  }

  undo.push(materializePseudoElements(doc))
  return () => {
    for (const fn of undo.reverse()) fn()
  }
}

/**
 * Pseudo-elements have no DOM node and no geometry API. Each visible one is
 * replaced by a real <pr-pseudo> element with the same computed style, so the
 * walker can measure it; the original pseudo-element is hidden meanwhile.
 */
function materializePseudoElements(doc: Document): () => void {
  const win = doc.defaultView!
  const created: Element[] = []
  const marked: [Element, string][] = []
  const elements = Array.from(doc.body.querySelectorAll('*'))
  const work: [Element, '::before' | '::after', CSSStyleDeclaration, string][] = []
  for (const el of elements) {
    if (VOID.has(el.localName) || el.localName === 'pr-pseudo') continue
    for (const which of ['::before', '::after'] as const) {
      const ps = win.getComputedStyle(el, which)
      const content = parseContent(ps.content)
      if (content === null || ps.display === 'none') continue
      const decorative =
        ps.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        ps.backgroundImage !== 'none' ||
        ps.borderTopStyle !== 'none' ||
        ps.boxShadow !== 'none'
      if (content === '' && !decorative) continue
      work.push([el, which, ps, content])
    }
  }
  // Read every style before writing, so inserting elements cannot change later reads.
  const snapshots = work.map(([el, which, ps, content]) => {
    const props: [string, string][] = []
    for (let i = 0; i < ps.length; i++) {
      const name = ps.item(i)
      if (name === 'content') continue
      props.push([name, ps.getPropertyValue(name)])
    }
    return { el, which, props, content }
  })
  for (const { el, which, props, content } of snapshots) {
    const span = doc.createElement('pr-pseudo')
    for (const [name, value] of props) span.style.setProperty(name, value)
    span.textContent = content
    if (which === '::before') el.prepend(span)
    else el.append(span)
    const attr = which === '::before' ? 'data-pr-hide-before' : 'data-pr-hide-after'
    el.setAttribute(attr, '')
    created.push(span)
    marked.push([el, attr])
  }
  return () => {
    for (const span of created) span.remove()
    for (const [el, attr] of marked) el.removeAttribute(attr)
  }
}

/** Scrolls through the page so lazy-loaded images and reveal effects fire. */
export async function preload(doc: Document, maxSteps = 40): Promise<void> {
  const win = doc.defaultView!
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const step = Math.max(200, win.innerHeight * 0.9)
  for (let i = 0; i < maxSteps; i++) {
    const before = win.scrollY
    win.scrollTo(0, before + step)
    await wait(90)
    if (win.scrollY === before) break
  }
  win.scrollTo(0, 0)
  await wait(120)
  for (const img of Array.from(doc.images)) {
    if (img.loading === 'lazy') img.loading = 'eager'
  }
  const pending = Array.from(doc.images).filter((img) => !img.complete)
  await Promise.race([Promise.allSettled(pending.map((img) => img.decode())), wait(4000)])
  await Promise.race([doc.fonts.ready, wait(3000)])
}
