/**
 * Capture links from the Figma plugin's Web tab. The plugin opens
 * pagerecast.shades.md/capture/#url=…; that page (apps/site/capture) talks to
 * this extension through `externally_connectable`, so the extension needs no
 * access to the site and no new permission. Only that origin can connect, and
 * the page asks the user to press Capture first.
 */
import { CAPTURE_PAGE, parseCaptureLink } from '@pagerecast/capture'
import { resolveLocale, setLocale, t } from '@pagerecast/i18n'
import { encodeClipboard } from '@pagerecast/scene'
import { CaptureError, captureTab, openTab } from './capture'
import { loadSettings } from './store'

declare const __VERSION__: string

export const LINK_ORIGIN = new URL(CAPTURE_PAGE).origin

/** What the capture page receives on its port. */
export type LinkReply =
  | { type: 'progress'; label: string }
  | { type: 'done'; payload: string; title: string; frames: number }
  | { type: 'error'; message: string }

export function listenForLinks() {
  // A page asks whether the extension is installed before offering to capture.
  chrome.runtime.onMessageExternal.addListener((message, sender, reply) => {
    if (sender.origin !== LINK_ORIGIN || (message as { type?: string })?.type !== 'ping') return
    reply({ version: __VERSION__ })
  })

  chrome.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== 'capture-link' || port.sender?.origin !== LINK_ORIGIN) {
      port.disconnect()
      return
    }
    const send = (reply: LinkReply) => {
      try {
        port.postMessage(reply)
      } catch {
        // The page was closed; nothing to tell.
      }
    }
    port.onMessage.addListener((message: { hash?: string }) => {
      void run(String(message?.hash ?? ''), port.sender?.tab?.id, send)
    })
  })
}

async function run(hash: string, pageTab: number | undefined, send: (r: LinkReply) => void) {
  // The page already checked the link; the extension does not trust it to.
  const settings = await loadSettings()
  // The capture page shows these messages; they follow the panel's language.
  setLocale(resolveLocale(settings.interfaceLanguage))
  const link = parseCaptureLink(hash)
  if (!link) return send({ type: 'error', message: t('link.incomplete') })
  let opened: number | null = null
  try {
    send({ type: 'progress', label: t('progress.opening', { host: new URL(link.url).host }) })
    opened = await openTab(link.url)
    const file = await captureTab(
      opened,
      {
        scope: 'page',
        widths: link.widths,
        themes: link.theme === 'both' ? ['light', 'dark'] : [link.theme],
        hideOverlays: settings.hideOverlays,
        preload: settings.preload,
        screenshot: settings.screenshot,
        states: settings.states,
        language: link.language,
        hide: '',
        delay: settings.delay,
        maxHeight: settings.maxHeight,
      },
      (progress) => send({ type: 'progress', label: progress.label }),
    )
    send({
      type: 'done',
      payload: await encodeClipboard(file),
      title: file.source.title,
      frames: file.captures.length,
    })
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof CaptureError ? error.message : t('link.unexpected'),
    })
  } finally {
    if (opened !== null) await chrome.tabs.remove(opened).catch(() => undefined)
    // Back to the capture page, which copies the result while it has focus.
    if (pageTab !== undefined) await chrome.tabs.update(pageTab, { active: true }).catch(() => {})
  }
}
