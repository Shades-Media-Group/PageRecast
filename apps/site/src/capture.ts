/**
 * /capture/#url=…: the Figma plugin's Web tab opens this page. It finds the
 * PageRecast extension (through `externally_connectable`), lets the user start
 * the capture, and copies the result for pasting in Figma. Nothing here talks
 * to a server; the hash never leaves the browser.
 */
import { parseCaptureLink } from '@pagerecast/capture'
import { fill, lang, strings } from './strings'

/** The capture page's translated strings (i18n/<lang>.json, capture.runtime). */
interface CaptureStrings {
  invalid: string
  target: string
  and: string
  language: string
  themes: Record<'light' | 'dark' | 'both', string>
  starting: string
  failed: string
  again: string
  frames: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }
  thePage: string
  copied: string
  ready: string
}
const t = strings<CaptureStrings>()
const plural = new Intl.PluralRules(lang)

/** The Chrome Web Store build; `?extension=<id>` points at an unpacked one. */
const EXTENSION_ID =
  new URLSearchParams(location.search).get('extension') ?? 'iidlcnlnejbmdihmbfiojpikhgaggkel'
/** How long to wait for the extension before suggesting it be installed. */
const FIND_MS = 3_000

type Reply =
  | { type: 'progress'; label: string }
  | { type: 'done'; payload: string; title: string; frames: number }
  | { type: 'error'; message: string }

const main = document.querySelector<HTMLElement>('main.capture')!
const target = document.getElementById('capture-target')!
const run = document.getElementById('capture-run')!
const start = document.getElementById('capture-start') as HTMLButtonElement
const status = document.getElementById('capture-status')!
const copyButton = document.getElementById('capture-copy') as HTMLButtonElement
const install = document.getElementById('capture-install')!

const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime
const link = parseCaptureLink(location.hash)

function show(state: string) {
  main.dataset.state = state
}

/** Whether the extension answers a ping; false when it is missing or off. */
function findExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!runtime?.sendMessage) return resolve(false)
    const timer = setTimeout(() => resolve(false), FIND_MS)
    try {
      runtime.sendMessage(EXTENSION_ID, { type: 'ping' }, (reply: unknown) => {
        clearTimeout(timer)
        // Reading lastError keeps Chrome from logging it when nothing answers.
        resolve(!runtime.lastError && Boolean(reply))
      })
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

async function copy(payload: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(payload)
    return true
  } catch {
    return false
  }
}

function capture() {
  if (!link || !runtime) return
  start.disabled = true
  copyButton.hidden = true
  show('capturing')
  status.textContent = t.starting
  const port = runtime.connect(EXTENSION_ID, { name: 'capture-link' })
  port.onMessage.addListener(async (reply: Reply) => {
    if (reply.type === 'progress') status.textContent = reply.label
    if (reply.type === 'error') {
      show('error')
      status.textContent = fill(t.failed, { message: reply.message })
      start.disabled = false
    }
    if (reply.type === 'done') {
      port.disconnect()
      start.disabled = false
      start.textContent = t.again
      const n = reply.frames
      const frames = fill(t.frames[plural.select(n)] ?? t.frames.other, { n })
      const copied = fill(t.copied, { frames, title: reply.title || t.thePage })
      // The tab is focused again after the capture, so copying usually just works;
      // when the browser wants a click first, the button asks for one.
      if (await copy(reply.payload)) {
        show('copied')
        status.textContent = copied
      } else {
        show('ready')
        status.textContent = fill(t.ready, { frames })
        copyButton.hidden = false
        copyButton.onclick = async () => {
          if (await copy(reply.payload)) {
            show('copied')
            copyButton.hidden = true
            status.textContent = copied
          }
        }
      }
    }
  })
  port.postMessage({ hash: location.hash })
}

if (!link) {
  show('invalid')
  target.textContent = t.invalid
} else {
  target.textContent = fill(t.target, {
    host: new URL(link.url).host,
    widths: link.widths.join(t.and),
    theme: t.themes[link.theme],
    language: link.language ? fill(t.language, { language: link.language }) : '',
  })
  target.title = link.url
  void findExtension().then((found) => {
    show(found ? 'found' : 'missing')
    run.hidden = !found
    install.hidden = found
    if (found) start.focus()
  })
  start.addEventListener('click', capture)
}
