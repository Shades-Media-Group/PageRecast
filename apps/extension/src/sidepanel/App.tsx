import { useCallback, useEffect, useState } from 'preact/hooks'
import {
  decode,
  encodeClipboard,
  encodeFile,
  FILE_EXTENSION,
  toBase64,
  type RecastFile,
  type SceneNode,
} from '@pagerecast/scene'
import {
  Button,
  CREDIT,
  DOCS_URL,
  formatBytes,
  Icon,
  IconButton,
  Logo,
  Message,
  REPO_URL,
  Section,
  Segmented,
  Toggle,
  FramesGraphic,
  framesFromLabels,
  type IconName,
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
  type HistoryEntry,
  type Settings,
} from '../store'

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

/** The top of the first screenshot, small, for the stage and the history list. */
async function thumbnail(file: RecastFile): Promise<string | undefined> {
  const id = file.captures[0]?.screenshot
  const asset = id ? file.assets[id] : undefined
  if (!asset || asset.kind !== 'image' || !asset.data) return undefined
  const bitmap = await createImageBitmap(
    await (await fetch(`data:${asset.mime};base64,${asset.data}`)).blob(),
  )
  const width = 720
  const scale = width / bitmap.width
  const height = Math.min(Math.round(bitmap.height * scale), 420)
  const canvas = new OffscreenCanvas(width, height)
  canvas
    .getContext('2d')!
    .drawImage(bitmap, 0, 0, bitmap.width, height / scale, 0, 0, width, height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.78 })
  return `data:image/jpeg;base64,${toBase64(new Uint8Array(await blob.arrayBuffer()))}`
}

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [tab, setTab] = useState<Tab | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [history, setHistory] = useState<HistoryEntry[]>([])
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
    void loadSettings().then(setSettings)
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

  const capture = async (targetUrl?: string) => {
    if (busy || views === 0) return
    if (!targetUrl && !tab?.capturable) return
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
          scope: targetUrl && settings.scope === 'element' ? 'page' : settings.scope,
          widths: settings.widths,
          themes: [...themes],
          hideOverlays: settings.hideOverlays,
          preload: settings.preload,
          screenshot: settings.screenshot,
          language: settings.language,
        },
        (progress) => setStatus({ kind: 'capturing', progress }),
      )
      const data = await encodeFile(file)
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        title: file.source.title || hostOf(file.source.url),
        url: file.source.url,
        createdAt: Date.now(),
        views: file.captures.map((c) => c.label),
        layers: file.captures.reduce((n, c) => n + countLayers(c.root), 0),
        bytes: data.byteLength,
        thumbnail: await thumbnail(file),
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

  const copy = async (entry: HistoryEntry) => {
    await navigator.clipboard.writeText(await encodeClipboard(await decode(entry.data)))
    setCopied(entry.id)
    setTimeout(() => setCopied((id) => (id === entry.id ? null : id)), 2400)
  }

  const download = (entry: HistoryEntry) => {
    const href = URL.createObjectURL(
      new Blob([entry.data as BlobPart], { type: 'application/gzip' }),
    )
    const a = document.createElement('a')
    a.href = href
    a.download = fileName(entry.title)
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  const remove = async (entry: HistoryEntry) => {
    await removeHistory(entry.id)
    if (latest === entry.id) setLatest(null)
    setHistory(await listHistory())
  }

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
      </header>

      <main class="scroll">
        {current && (
          <section class="result" aria-live="polite">
            <FramesGraphic frames={framesFromLabels(current.views)} height={34} />
            <div class="result-text">
              <p class="truncate result-title">{current.title}</p>
              <p class="result-count">
                <span class="num">{current.views.length}</span>{' '}
                {current.views.length === 1 ? 'frame' : 'frames'} ·{' '}
                <span class="num">{current.layers.toLocaleString()}</span> layers
              </p>
              <p class="truncate muted">
                {hostOf(current.url)} · <span class="num">{formatBytes(current.bytes)}</span>
              </p>
            </div>
            <p class="next">
              Copy it, then paste it into the <strong>PageRecast</strong> plugin in Figma.
            </p>
          </section>
        )}

        <Section title={current ? 'Capture another' : 'Page'}>
          {(!current || current.url !== tab?.url) && (
            <div class="pr-row target" aria-live="polite">
              {tab?.favicon ? (
                <img src={tab.favicon} alt="" width={16} height={16} />
              ) : (
                <Icon name="page" size={16} class="muted" />
              )}
              <div class="grow">
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
            class="pr-row url"
            onSubmit={(e) => {
              e.preventDefault()
              if (targetUrl) void capture(targetUrl)
            }}
          >
            <Icon name="globe" size={16} class="muted" />
            <input
              class="pr-input"
              type="url"
              inputMode="url"
              placeholder="Or capture another URL"
              aria-label="URL to capture"
              value={url}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <Button type="submit" disabled={!targetUrl || busy}>
              Capture
            </Button>
          </form>
        </Section>

        {settings.editing ? (
          <>
            <Section title="Area">
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
              {settings.scope === 'element' && (
                <p class="hint">After you press Capture, click the part of the page you want.</p>
              )}
            </Section>

            <Section title="Widths" aside={`${settings.widths.length} selected`}>
              {[
                ...PRESET_WIDTHS,
                ...settings.customWidths.map((width) => ({
                  width,
                  label: 'Custom',
                  icon: 'width' as const,
                })),
              ].map((p) => (
                <label class="pr-row width-row">
                  <input
                    class="pr-check"
                    type="checkbox"
                    checked={settings.widths.includes(p.width)}
                    onChange={() => toggleWidth(p.width)}
                  />
                  <Icon name={p.icon as IconName} size={16} class="muted" />
                  <span class="grow">{p.label}</span>
                  <span class="num muted">{p.width}</span>
                  {p.label === 'Custom' && (
                    <IconButton
                      icon="close"
                      label={`Remove ${p.width}`}
                      onClick={() => removeCustomWidth(p.width)}
                    />
                  )}
                </label>
              ))}
              <form
                class="pr-row add-width"
                onSubmit={(e) => {
                  e.preventDefault()
                  addCustomWidth()
                }}
              >
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
                <Button type="submit" disabled={!customWidth}>
                  Add
                </Button>
              </form>
            </Section>

            <Section title="Theme and language">
              <Segmented
                label="Colour scheme"
                value={settings.theme}
                onChange={(theme) => update({ theme })}
                options={[
                  { value: 'light', label: 'Light', icon: 'sun' },
                  { value: 'dark', label: 'Dark', icon: 'moon' },
                  { value: 'both', label: 'Both', icon: 'contrast' },
                ]}
              />
              <div class="pr-row language">
                <Icon name="globe" size={16} class="muted" />
                <select
                  class="pr-input grow"
                  value={settings.language}
                  onChange={(e) => update({ language: e.currentTarget.value })}
                  aria-label="Language"
                >
                  {LANGUAGES.map((l) => (
                    <option value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              {settings.language && <p class="hint">The page reloads once in this language.</p>}
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
            <dl class="summary">
              <div class="pr-row">
                <dt>Area</dt>
                <dd>{SCOPES[settings.scope]}</dd>
              </div>
              <div class="pr-row">
                <dt>Widths</dt>
                <dd class="num">{settings.widths.join(', ') || 'None'}</dd>
              </div>
              <div class="pr-row">
                <dt>Theme</dt>
                <dd>{THEMES[settings.theme]}</dd>
              </div>
              <div class="pr-row">
                <dt>Language</dt>
                <dd>{language}</dd>
              </div>
            </dl>
          </Section>
        )}

        {older.length > 0 && (
          <Section title="Recent" aside="On this device">
            <ul class="history">
              {older.map((entry) => (
                <li class="pr-row">
                  {entry.thumbnail ? <img src={entry.thumbnail} alt="" /> : <span class="thumb" />}
                  <div class="grow history-text">
                    <p class="truncate">{entry.title}</p>
                    <p class="muted">
                      {entry.views.length} frame{entry.views.length === 1 ? '' : 's'} ·{' '}
                      {ago(entry.createdAt)}
                    </p>
                  </div>
                  <IconButton
                    icon={copied === entry.id ? 'check' : 'copy'}
                    label="Copy for Figma"
                    onClick={() => copy(entry)}
                  />
                  <IconButton
                    icon="download"
                    label="Download .recast file"
                    onClick={() => download(entry)}
                  />
                  <IconButton icon="trash" label="Delete" onClick={() => remove(entry)} />
                </li>
              ))}
            </ul>
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
          <div class="progress-line" aria-live="polite">
            <span class="pr-spinner" />
            <span class="truncate">{status.progress.label}</span>
            <span class="num muted">
              {Math.min(status.progress.step + 1, status.progress.steps)} / {status.progress.steps}
            </span>
          </div>
        ) : current ? (
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

      <footer class="toolbar">
        <IconButton
          icon="sliders"
          label="Capture settings"
          aria-pressed={settings.editing}
          onClick={() => update({ editing: !settings.editing })}
        />
        <a href={feedbackUrl} target="_blank" rel="noreferrer">
          Send feedback
        </a>
        <IconButton
          icon="help"
          label="Guides and help"
          onClick={() => chrome.tabs.create({ url: DOCS_URL })}
        />
      </footer>
    </div>
  )
}
