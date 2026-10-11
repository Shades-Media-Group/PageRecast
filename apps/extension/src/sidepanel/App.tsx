import { useCallback, useEffect, useState } from 'preact/hooks'
import {
  decode,
  encodeClipboard,
  encodeFile,
  FILE_EXTENSION,
  type SceneNode,
  type Scope,
} from '@pagerecast/scene'
import {
  Button,
  CREDIT,
  DOCS_URL,
  formatBytes,
  FrameLineup,
  Icon,
  IconButton,
  Logo,
  Message,
  Progress,
  REPO_URL,
  Section,
  Segmented,
  Toggle,
  type IconName,
  type LineupFrame,
} from '@pagerecast/ui'
import { CaptureError, captureTab, openTab, type CaptureProgress } from '../capture'
import {
  addHistory,
  DEFAULT_SETTINGS,
  LANGUAGES,
  listHistory,
  loadSettings,
  PRESET_WIDTHS,
  removeHistory,
  saveSettings,
  type PendingCapture,
  type Settings,
} from '../store'
import { frameThumbs, type Entry } from './frames'

declare const __VERSION__: string

interface Tab {
  id: number
  title: string
  url: string
  favicon?: string
  capturable: boolean
}

type Status =
  | { kind: 'idle' }
  | { kind: 'capturing'; progress: CaptureProgress }
  | { kind: 'error'; message: string }

const SCOPES = { page: 'Full page', viewport: 'Visible area', element: 'One element' } as const
const THEMES = { light: 'Light', dark: 'Dark', both: 'Light and dark' } as const

const countLayers = (node: SceneNode): number =>
  1 + (node.type === 'frame' ? node.children.reduce((n, c) => n + countLayers(c), 0) : 0)

const UNCAPTURABLE =
  'Chrome doesn’t let extensions capture its own pages or the Web Store. Open a website, then capture.'

const isCapturable = (url = '') =>
  /^(https?|file):/.test(url) &&
  !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/.test(url)

function hostOf(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' ? 'Local file' : u.host
  } catch {
    return url
  }
}

function normaliseUrl(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`)
    return (/^https?:$/.test(url.protocol) && url.hostname.includes('.')) ||
      url.hostname === 'localhost'
      ? url.href
      : null
  } catch {
    return null
  }
}

function ago(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : new Date(ms).toLocaleDateString()
}

function fileName(title: string) {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'capture'
  return `${slug}${FILE_EXTENSION}`
}

/** Frames for captures saved before crops were kept: drawn as empty frames. */
const framesOf = (entry: Entry): LineupFrame[] =>
  entry.frames ??
  entry.views.map((label) => ({
    label,
    width: Number(/(\d{3,4})/.exec(label)?.[1] ?? 1440),
    theme: /dark/i.test(label) ? 'dark' : 'light',
    height: 720,
  }))

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState<PendingCapture | null>(null)
  const [tab, setTab] = useState<Tab | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [history, setHistory] = useState<Entry[]>([])
  const [latest, setLatest] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [customWidth, setCustomWidth] = useState('')
  const [url, setUrl] = useState('')

  const refreshTab = useCallback(async () => {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    if (!active?.id) return setTab(null)
    setTab({
      id: active.id,
      title: active.title || 'Untitled page',
      url: active.url ?? '',
      favicon: active.favIconUrl,
      capturable: isCapturable(active.url),
    })
  }, [])

  useEffect(() => {
    void loadSettings().then((loaded) => {
      setSettings(loaded)
      setLoaded(true)
    })
    void listHistory().then(setHistory)
    void refreshTab()
    const onChange = () => void refreshTab()
    chrome.tabs.onActivated.addListener(onChange)
    chrome.tabs.onUpdated.addListener(onChange)
    chrome.windows.onFocusChanged.addListener(onChange)
    return () => {
      chrome.tabs.onActivated.removeListener(onChange)
      chrome.tabs.onUpdated.removeListener(onChange)
      chrome.windows.onFocusChanged.removeListener(onChange)
    }
  }, [refreshTab])

  // Captures asked for from the right-click menu or the shortcut, for this window only.
  useEffect(() => {
    let windowId: number | undefined
    const take = async () => {
      windowId ??= (await chrome.windows.getCurrent()).id
      const { pending } = (await chrome.storage.session.get('pending')) as {
        pending?: PendingCapture
      }
      if (!pending || pending.windowId !== windowId) return
      await chrome.storage.session.remove('pending')
      // A request the panel never picked up should not fire much later.
      if (Date.now() - pending.at > 15_000) return
      setPending(pending)
      void refreshTab()
    }
    void take()
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.pending?.newValue) void take()
    }
    chrome.storage.session.onChanged.addListener(onChanged)
    return () => chrome.storage.session.onChanged.removeListener(onChanged)
  }, [refreshTab])

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (!('editing' in patch)) setLatest(null)
    void saveSettings(next)
  }

  const toggleWidth = (width: number) => {
    const widths = settings.widths.includes(width)
      ? settings.widths.filter((w) => w !== width)
      : [...settings.widths, width].sort((a, b) => b - a)
    update({ widths })
  }

  const addCustomWidth = () => {
    const width = Math.round(Number(customWidth))
    if (!width || width < 240 || width > 3840) return
    setCustomWidth('')
    const known =
      settings.customWidths.includes(width) || PRESET_WIDTHS.some((p) => p.width === width)
    update({
      customWidths: known ? settings.customWidths : [...settings.customWidths, width],
      widths: settings.widths.includes(width)
        ? settings.widths
        : [...settings.widths, width].sort((a, b) => b - a),
    })
  }

  const removeCustomWidth = (width: number) =>
    update({
      customWidths: settings.customWidths.filter((w) => w !== width),
      widths: settings.widths.filter((w) => w !== width),
    })

  const themes =
    settings.theme === 'both' ? (['light', 'dark'] as const) : ([settings.theme] as const)
  const views = settings.widths.length * themes.length
  const busy = status.kind === 'capturing'
  const language = LANGUAGES.find((l) => l.value === settings.language)?.label ?? settings.language

  const capture = async ({
    url: targetUrl,
    scope = settings.scope,
  }: { url?: string; scope?: Scope } = {}) => {
    if (busy) return
    if (!targetUrl && !tab?.capturable)
      return setStatus({
        kind: 'error',
        message: tab ? UNCAPTURABLE : 'Open a website to capture it.',
      })
    if (views === 0)
      return setStatus({ kind: 'error', message: 'Choose at least one width, then capture.' })
    setStatus({
      kind: 'capturing',
      progress: {
        label: targetUrl ? `Opening ${hostOf(targetUrl)}` : 'Starting',
        step: 0,
        steps: views,
      },
    })
    let openedTab: number | null = null
    try {
      const tabId = targetUrl ? (openedTab = await openTab(targetUrl)) : tab!.id
      const file = await captureTab(
        tabId,
        {
          scope: targetUrl && scope === 'element' ? 'page' : scope,
          widths: settings.widths,
          themes: [...themes],
          hideOverlays: settings.hideOverlays,
          preload: settings.preload,
          screenshot: settings.screenshot,
          states: settings.states,
          language: settings.language,
        },
        (progress) => setStatus({ kind: 'capturing', progress }),
      )
      const data = await encodeFile(file)
      const frames = await frameThumbs(file)
      const entry: Entry = {
        id: crypto.randomUUID(),
        title: file.source.title || hostOf(file.source.url),
        url: file.source.url,
        createdAt: Date.now(),
        views: file.captures.map((c) => c.label),
        layers: file.captures.reduce((n, c) => n + countLayers(c.root), 0),
        bytes: data.byteLength,
        thumbnail: frames[0]?.src,
        frames,
        data,
      }
      await addHistory(entry)
      setHistory(await listHistory())
      const next = { ...settings, seenDebuggerNote: true, editing: false }
      setSettings(next)
      void saveSettings(next)
      setLatest(entry.id)
      setUrl('')
      setStatus({ kind: 'idle' })
    } catch (error) {
      console.error(error)
      if (error instanceof CaptureError && error.message === 'Capture cancelled.')
        return setStatus({ kind: 'idle' })
      setStatus({
        kind: 'error',
        message:
          error instanceof CaptureError
            ? error.message
            : 'The capture stopped unexpectedly. Reload the page and try again.',
      })
    } finally {
      if (openedTab !== null) void chrome.tabs.remove(openedTab).catch(() => undefined)
    }
  }

  const copy = async (entry: Entry) => {
    await navigator.clipboard.writeText(await encodeClipboard(await decode(entry.data)))
    setCopied(entry.id)
    setTimeout(() => setCopied((id) => (id === entry.id ? null : id)), 2400)
  }

  const download = (entry: Entry) => {
    const href = URL.createObjectURL(
      new Blob([entry.data as BlobPart], { type: 'application/gzip' }),
    )
    const a = document.createElement('a')
    a.href = href
    a.download = fileName(entry.title)
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const remove = async (entry: Entry) => {
    await removeHistory(entry.id)
    if (latest === entry.id) setLatest(null)
    setHistory(await listHistory())
  }

  useEffect(() => {
    if (!pending || busy || !loaded || tab?.id !== pending.tabId) return
    setPending(null)
    // "Capture this page" keeps a saved visible-area choice; picking always picks.
    const scope =
      pending.scope === 'element' || settings.scope !== 'viewport' ? pending.scope : 'viewport'
    void capture({ scope })
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void capture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const current = history.find((h) => h.id === latest)
  const older = history.filter((h) => h.id !== latest)
  const targetUrl = normaliseUrl(url)
  const feedbackUrl = `${REPO_URL}/issues/new?template=feedback.yml&surface=Chrome%20extension&version=${__VERSION__}`

  return (
    <div class="panel">
      <header class="pr-header">
        <Logo height={15} />
        <div class="pr-header__actions">
          <IconButton
            icon="feedback"
            label="Send feedback"
            onClick={() => chrome.tabs.create({ url: feedbackUrl })}
          />
          <IconButton
            icon="help"
            label="Guides and help"
            onClick={() => chrome.tabs.create({ url: DOCS_URL })}
          />
          <IconButton
            icon="sliders"
            label="Capture settings"
            aria-pressed={settings.editing}
            onClick={() => update({ editing: !settings.editing })}
          />
        </div>
      </header>

      <main class="scroll">
        {current && <Result entry={current} />}

        <Section title={current ? 'Capture another' : 'Page'}>
          {(!current || current.url !== tab?.url) && (
            <div class="target" aria-live="polite">
              {tab?.favicon ? (
                <img src={tab.favicon} alt="" width={16} height={16} />
              ) : (
                <Icon name="page" size={16} class="muted" />
              )}
              <div class="target-text">
                <p class="truncate target-title">{tab?.title ?? 'No page selected'}</p>
                <p class="truncate muted">
                  {tab ? hostOf(tab.url) : 'Open a website to capture it'}
                </p>
              </div>
            </div>
          )}
          {tab && !tab.capturable && (
            <p class="hint">Chrome doesn't let extensions read its own pages or the Web Store.</p>
          )}
          <form
            class="pr-field url"
            onSubmit={(e) => {
              e.preventDefault()
              if (targetUrl) void capture({ url: targetUrl })
            }}
          >
            <Icon name="globe" size={16} />
            <input
              class="pr-input"
              type="url"
              inputMode="url"
              placeholder="Capture another URL"
              aria-label="URL to capture"
              value={url}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <IconButton
              type="submit"
              icon="arrowRight"
              label="Capture this URL"
              disabled={!targetUrl || busy}
            />
          </form>
        </Section>

        {settings.editing ? (
          <>
            <Section title="Capture">
              <div class="pr-prop">
                <span>Area</span>
                <Segmented
                  label="Capture area"
                  value={settings.scope}
                  onChange={(scope) => update({ scope })}
                  options={[
                    { value: 'page', label: 'Full page' },
                    { value: 'viewport', label: 'Visible' },
                    { value: 'element', label: 'Element' },
                  ]}
                />
              </div>
              {settings.scope === 'element' && (
                <p class="hint hint--prop">
                  After you press Capture, click the part of the page you want.
                </p>
              )}
              <div class="pr-prop">
                <span>Theme</span>
                <Segmented
                  label="Colour scheme"
                  value={settings.theme}
                  onChange={(theme) => update({ theme })}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'both', label: 'Both' },
                  ]}
                />
              </div>
              <label class="pr-prop">
                <span>Language</span>
                <select
                  class="pr-input"
                  value={settings.language}
                  onChange={(e) => update({ language: e.currentTarget.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option value={l.value}>{l.label}</option>
                  ))}
                </select>
              </label>
              {settings.language && (
                <p class="hint hint--prop">The page reloads once in this language.</p>
              )}
            </Section>

            <Section
              title="Widths"
              aside={<span class="num">{settings.widths.length} selected</span>}
            >
              <div class={settings.customWidths.length ? 'widths widths--custom' : 'widths'}>
                {[
                  ...PRESET_WIDTHS,
                  ...settings.customWidths.map((width) => ({
                    width,
                    label: 'Custom',
                    icon: 'width' as const,
                  })),
                ].map((p) => (
                  <label class="width-row">
                    <input
                      class="pr-check"
                      type="checkbox"
                      checked={settings.widths.includes(p.width)}
                      onChange={() => toggleWidth(p.width)}
                    />
                    <Icon name={p.icon as IconName} size={16} class="muted" />
                    <span>{p.label}</span>
                    <span class="num muted">{p.width}</span>
                    {p.label === 'Custom' ? (
                      <IconButton
                        icon="close"
                        label={`Remove ${p.width}`}
                        onClick={() => removeCustomWidth(p.width)}
                      />
                    ) : (
                      settings.customWidths.length > 0 && <span />
                    )}
                  </label>
                ))}
              </div>
              <form
                class="pr-field add-width"
                onSubmit={(e) => {
                  e.preventDefault()
                  addCustomWidth()
                }}
              >
                <Icon name="width" size={16} />
                <input
                  class="pr-input"
                  type="number"
                  min={240}
                  max={3840}
                  placeholder="Add a width, e.g. 1024"
                  aria-label="Custom width in pixels"
                  value={customWidth}
                  onInput={(e) => setCustomWidth(e.currentTarget.value)}
                />
                <IconButton type="submit" icon="plus" label="Add width" disabled={!customWidth} />
              </form>
            </Section>

            <Section title="Before capturing">
              <Toggle
                label="Hide cookie banners"
                hint="And unlock scrolling they block"
                checked={settings.hideOverlays}
                onChange={(hideOverlays) => update({ hideOverlays })}
              />
              <Toggle
                label="Load lazy content"
                hint="Scrolls the page once first"
                checked={settings.preload}
                onChange={(preload) => update({ preload })}
              />
              <Toggle
                label="Hover and focus states"
                hint="Buttons and links become components with variants"
                checked={settings.states}
                onChange={(states) => update({ states })}
              />
              <Toggle
                label="Screenshot reference"
                hint="To compare against in Figma"
                checked={settings.screenshot}
                onChange={(screenshot) => update({ screenshot })}
              />
            </Section>
          </>
        ) : (
          <Section
            title="Settings"
            aside={
              <button type="button" class="text-button" onClick={() => update({ editing: true })}>
                Edit
              </button>
            }
          >
            <dl class="pr-props">
              <div class="pr-prop">
                <dt>Area</dt>
                <dd>{SCOPES[settings.scope]}</dd>
              </div>
              <div class="pr-prop">
                <dt>Widths</dt>
                <dd class="num truncate">{settings.widths.join(', ') || 'None'}</dd>
              </div>
              <div class="pr-prop">
                <dt>Theme</dt>
                <dd>{THEMES[settings.theme]}</dd>
              </div>
              <div class="pr-prop">
                <dt>Language</dt>
                <dd class="truncate">{language}</dd>
              </div>
            </dl>
          </Section>
        )}

        {older.length > 0 && (
          <Section title="Recent" aside="On this device">
            <History
              entries={older}
              copied={copied}
              onCopy={copy}
              onDownload={download}
              onRemove={remove}
            />
          </Section>
        )}

        <p class="credit">
          Free and open source. Built by{' '}
          <a href={CREDIT.url} target="_blank" rel="noreferrer">
            {CREDIT.company}
          </a>
          . <span class="num">v{__VERSION__}</span>
        </p>
      </main>

      <footer class="dock">
        {status.kind === 'error' && (
          <Message tone="error" onDismiss={() => setStatus({ kind: 'idle' })}>
            {status.message}
          </Message>
        )}
        {!settings.seenDebuggerNote && status.kind === 'idle' && (
          <Message>
            While capturing, Chrome shows{' '}
            <strong>“PageRecast started debugging this browser”</strong>. That's how it reads the
            page at other widths. It closes when the capture ends.
          </Message>
        )}
        {busy ? (
          <div class="progress" aria-live="polite">
            <Progress value={(status.progress.step + 0.5) / Math.max(status.progress.steps, 1)} />
            <div class="progress-line">
              <span class="pr-spinner" />
              <span class="truncate">{status.progress.label}</span>
              <span class="num muted">
                {Math.min(status.progress.step + 1, status.progress.steps)} of{' '}
                {status.progress.steps}
              </span>
            </div>
          </div>
        ) : current ? (
          <>
            <p class="next">Then paste it into the PageRecast plugin in Figma.</p>
            <div class="dock-row">
              <Button
                variant="primary"
                size="lg"
                block
                icon={copied === current.id ? 'check' : 'copy'}
                data-done={copied === current.id ? '' : undefined}
                onClick={() => copy(current)}
              >
                {copied === current.id ? 'Copied' : 'Copy for Figma'}
              </Button>
              <IconButton
                icon="download"
                label="Download .recast file"
                onClick={() => download(current)}
              />
              <IconButton icon="refresh" label="Capture again" onClick={() => capture()} />
            </div>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!tab?.capturable || views === 0}
            onClick={() => capture()}
          >
            {views > 1 ? `Capture ${views} frames` : 'Capture this page'}
            <kbd>⌘↵</kbd>
          </Button>
        )}
      </footer>
    </div>
  )
}

/** The latest capture: its real frames on the stage, then what it holds. */
function Result({ entry }: { entry: Entry }) {
  const frames = framesOf(entry)
  return (
    <section class="result" aria-live="polite">
      <div class="result-stage">
        <FrameLineup frames={frames} maxHeight={112} />
      </div>
      <div class="result-text">
        <h1 class="truncate">{entry.title}</h1>
        <p>
          <span class="truncate">{hostOf(entry.url)}</span>
          <span class="num">{plural(frames.length, 'frame')}</span>
          <span class="num">{plural(entry.layers, 'layer')}</span>
          <span class="num">{formatBytes(entry.bytes)}</span>
        </p>
      </div>
    </section>
  )
}

function History({
  entries,
  copied,
  onCopy,
  onDownload,
  onRemove,
}: {
  entries: Entry[]
  copied: string | null
  onCopy: (entry: Entry) => void
  onDownload: (entry: Entry) => void
  onRemove: (entry: Entry) => void
}) {
  return (
    <ul class="history">
      {entries.map((entry) => {
        const thumb = entry.frames?.[0]?.src ?? entry.thumbnail
        return (
          <li>
            {thumb ? <img src={thumb} alt="" /> : <span class="thumb" />}
            <div class="history-text">
              <p class="truncate">{entry.title}</p>
              <p class="truncate muted">
                <span class="num">{plural(entry.views.length, 'frame')}</span> ·{' '}
                {ago(entry.createdAt)}
              </p>
            </div>
            <div class="history-actions">
              <IconButton
                icon={copied === entry.id ? 'check' : 'copy'}
                label="Copy for Figma"
                onClick={() => onCopy(entry)}
              />
              <IconButton
                icon="download"
                label="Download .recast file"
                onClick={() => onDownload(entry)}
              />
              <IconButton icon="trash" label="Delete" onClick={() => onRemove(entry)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
