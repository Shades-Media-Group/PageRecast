import { useCallback, useEffect, useState } from 'preact/hooks'
import {
  decode,
  encodeClipboard,
  encodeFile,
  FILE_EXTENSION,
  mergeFiles,
  type SceneNode,
  type Scope,
} from '@pagerecast/scene'
import {
  formatAgo,
  formatBytes,
  formatNumber,
  formatSeconds,
  fromEnglish,
  resolveLocale,
  rich,
  setLocale,
  t,
} from '@pagerecast/i18n'
import {
  Button,
  CREDIT,
  DOCS_URL,
  FrameLineup,
  Icon,
  IconButton,
  InterfaceLanguage,
  InterfaceTheme,
  applyAppearance,
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
import { splitTopLevel } from '@pagerecast/capture'
import {
  canEmulate,
  CaptureCancelled,
  CaptureError,
  captureTab,
  openTab,
  type CaptureProgress,
} from '../capture'

import {
  addHistory,
  DEFAULT_SETTINGS,
  LANGUAGES,
  listHistory,
  loadSettings,
  loadSite,
  PRESET_WIDTHS,
  removeHistory,
  saveSettings,
  saveSite,
  SITE_KEYS,
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

const SCOPES = {
  page: 'panel.scope.page',
  viewport: 'panel.scope.viewport',
  element: 'panel.scope.element',
} as const
const THEMES = { light: 'theme.light', dark: 'theme.dark', both: 'theme.lightAndDark' } as const
const DEVICES = {
  desktop: 'device.desktop',
  laptop: 'device.laptop',
  tablet: 'device.tablet',
  mobile: 'device.mobile',
} as const
const delays = () => [
  { value: '0', label: t('panel.noDelay') },
  ...[1000, 3000, 5000].map((ms) => ({ value: String(ms), label: formatSeconds(ms, 0) })),
]

/** The selectors in a comma-separated list that the browser rejects. */
function invalidSelectors(list: string): string[] {
  const probe = document.createDocumentFragment()
  return splitTopLevel(list).filter((selector) => {
    try {
      probe.querySelector(selector)
      return false
    } catch {
      return true
    }
  })
}

const countLayers = (node: SceneNode): number =>
  1 + (node.type === 'frame' ? node.children.reduce((n, c) => n + countLayers(c), 0) : 0)

const uncapturable = () =>
  t(canEmulate ? 'panel.uncapturable.chrome' : 'panel.uncapturable.firefox')

const isCapturable = (url = '') =>
  /^(https?|file):/.test(url) &&
  !/^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|addons\.mozilla\.org)/.test(
    url,
  )

function hostOf(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'file:' ? t('panel.localFile') : u.host
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

function save(data: Uint8Array, name: string) {
  const href = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/gzip' }))
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
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

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  // The interface language: chosen in settings, else the browser's. Set before rendering.
  setLocale(resolveLocale(settings.interfaceLanguage))
  applyAppearance(settings.appearance)
  /** The site whose remembered area, widths and theme are applied. */
  const [siteHost, setSiteHost] = useState<string | null>()
  const [pending, setPending] = useState<PendingCapture | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
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
      title: active.title || t('panel.untitled'),
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

  const host = tab?.capturable ? hostOf(tab.url) : null

  // Each site keeps the area, widths and theme last used on it; new sites start from the last used.
  useEffect(() => {
    if (!loaded) return
    let live = true
    void Promise.all([loadSettings(), host ? loadSite(host) : {}]).then(([global, site]) => {
      if (!live) return
      setSettings((s) => {
        const next = {
          ...s,
          scope: global.scope,
          widths: global.widths,
          theme: global.theme,
          // Elements to hide belong to one site; a new site starts with none.
          hide: '',
        }
        Object.assign(next, site)
        const known = [...PRESET_WIDTHS.map((p) => p.width), ...s.customWidths]
        return { ...next, widths: next.widths.filter((w) => known.includes(w)) }
      })
      setSiteHost(host)
    })
    return () => {
      live = false
    }
  }, [loaded, host])

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
    if (host && SITE_KEYS.some((key) => key in patch))
      void saveSite(host, {
        scope: next.scope,
        widths: next.widths,
        theme: next.theme,
        hide: next.hide,
      })
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
  // Firefox captures the theme the page shows, so each width is one frame.
  const views = settings.widths.length * (canEmulate ? themes.length : 1)
  const busy = status.kind === 'capturing'
  const language = settings.language
    ? (LANGUAGES.find((l) => l.value === settings.language)?.label ?? settings.language)
    : t('panel.pageDefault')
  const invalid = invalidSelectors(settings.hide)

  const capture = async ({
    url: targetUrl,
    scope = settings.scope,
  }: { url?: string; scope?: Scope } = {}) => {
    if (busy) return
    if (!targetUrl && !tab?.capturable)
      return setStatus({
        kind: 'error',
        message: tab ? uncapturable() : t('panel.errorOpen'),
      })
    if (views === 0) return setStatus({ kind: 'error', message: t('panel.errorWidths') })
    setSelecting(false)
    setStatus({
      kind: 'capturing',
      progress: {
        label: targetUrl
          ? t('progress.opening', { host: hostOf(targetUrl) })
          : t('progress.starting'),
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
          hide: settings.hide,
          delay: settings.delay,
          maxHeight: settings.maxHeight,
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
      if (host && !targetUrl)
        void saveSite(host, {
          scope: settings.scope,
          widths: settings.widths,
          theme: settings.theme,
          hide: settings.hide,
        })
      setLatest(entry.id)
      setUrl('')
      setStatus({ kind: 'idle' })
      return entry.id
    } catch (error) {
      console.error(error)
      if (error instanceof CaptureCancelled) return setStatus({ kind: 'idle' })
      setStatus({
        kind: 'error',
        message:
          error instanceof CaptureError ? fromEnglish(error.message) : t('panel.errorUnexpected'),
      })
    } finally {
      if (openedTab !== null) void chrome.tabs.remove(openedTab).catch(() => undefined)
    }
  }

  /**
   * Several URLs at once: each is captured in turn into Recent, then they are
   * picked for one combined copy. A URL that fails stops the rest.
   */
  const captureUrls = async (urls: string[]) => {
    if (urls.length === 1) return void capture({ url: urls[0] })
    const ids: string[] = []
    for (const url of urls) {
      const id = await capture({ url })
      if (!id) break
      ids.push(id)
    }
    if (ids.length > 1) {
      setSelecting(true)
      setPicked(new Set(ids))
    }
  }

  const copy = async (entry: Entry) => {
    await navigator.clipboard.writeText(await encodeClipboard(await decode(entry.data)))
    setCopied(entry.id)
    setTimeout(() => setCopied((id) => (id === entry.id ? null : id)), 2400)
  }

  const download = (entry: Entry) => save(entry.data, fileName(entry.title))

  const chosen = history.filter((h) => picked.has(h.id))
  const merged = async () => mergeFiles(await Promise.all(chosen.map((h) => decode(h.data))))

  const copyChosen = async () => {
    await navigator.clipboard.writeText(await encodeClipboard(await merged()))
    setCopied('tray')
    setTimeout(() => setCopied((id) => (id === 'tray' ? null : id)), 2400)
  }

  const downloadChosen = async () =>
    save(await encodeFile(await merged()), fileName(`${chosen.length}-pages`))

  const pick = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }

  const remove = async (entry: Entry) => {
    await removeHistory(entry.id)
    if (latest === entry.id) setLatest(null)
    setHistory(await listHistory())
  }

  useEffect(() => {
    if (!pending || busy || !loaded || siteHost !== host || tab?.id !== pending.tabId) return
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
  // Several URLs can be pasted at once, separated by spaces, commas or lines.
  const targetUrls = [
    ...new Set(
      url
        .split(/[\s,]+/)
        .map(normaliseUrl)
        .filter((u): u is string => u !== null),
    ),
  ]
  const feedbackUrl = `${REPO_URL}/issues/new?template=feedback.yml&surface=${canEmulate ? 'Chrome' : 'Firefox'}%20extension&version=${__VERSION__}`

  return (
    <div class="panel">
      <header class="pr-header">
        <Logo height={15} />
        <div class="pr-header__actions">
          <IconButton
            icon="feedback"
            label={t('common.feedback')}
            onClick={() => chrome.tabs.create({ url: feedbackUrl })}
          />
          <IconButton
            icon="help"
            label={t('common.help')}
            onClick={() => chrome.tabs.create({ url: DOCS_URL })}
          />
          <IconButton
            icon="settings"
            label={t('panel.settings')}
            aria-pressed={settings.editing}
            onClick={() => update({ editing: !settings.editing })}
          />
        </div>
      </header>

      <main class="scroll">
        {current && <Result entry={current} />}

        <Section title={current ? t('panel.captureAnother') : t('panel.page')}>
          {(!current || current.url !== tab?.url) && (
            <div class="target" aria-live="polite">
              {tab?.favicon ? (
                <img src={tab.favicon} alt="" width={16} height={16} />
              ) : (
                <Icon name="page" size={16} class="muted" />
              )}
              <div class="target-text">
                <p class="truncate target-title">{tab?.title ?? t('panel.noPage')}</p>
                <p class="truncate muted">{tab ? hostOf(tab.url) : t('panel.openWebsite')}</p>
              </div>
            </div>
          )}
          {tab && !tab.capturable && (
            <p class="hint">
              {t(canEmulate ? 'panel.restricted.chrome' : 'panel.restricted.firefox')}
            </p>
          )}
          <form
            class="pr-field url"
            onSubmit={(e) => {
              e.preventDefault()
              if (targetUrls.length) void captureUrls(targetUrls)
            }}
          >
            <Icon name="globe" size={16} />
            <input
              class="pr-input"
              type="text"
              inputMode="url"
              spellcheck={false}
              placeholder={t('panel.urlPlaceholder')}
              aria-label={t('panel.urlLabel')}
              value={url}
              onInput={(e) => setUrl(e.currentTarget.value)}
            />
            <IconButton
              type="submit"
              icon="arrowRight"
              label={
                targetUrls.length > 1
                  ? t('panel.captureUrls', { count: targetUrls.length })
                  : t('panel.captureUrl')
              }
              disabled={!targetUrls.length || busy}
            />
          </form>
          {targetUrls.length > 1 && (
            <p class="hint">{t('panel.urlsHint', { count: targetUrls.length })}</p>
          )}
        </Section>

        {settings.editing ? (
          <>
            <Section title={t('common.capture')}>
              <div class="pr-prop">
                <span>{t('panel.area')}</span>
                <Segmented
                  label={t('panel.areaLabel')}
                  value={settings.scope}
                  onChange={(scope) => update({ scope })}
                  options={[
                    { value: 'page', label: t('panel.scope.page') },
                    { value: 'viewport', label: t('panel.scopeShort.viewport') },
                    { value: 'element', label: t('panel.scopeShort.element') },
                  ]}
                />
              </div>
              {settings.scope === 'element' && (
                <p class="hint hint--prop">{t('panel.elementHint')}</p>
              )}
              {settings.scope === 'page' && (
                <label class="pr-prop">
                  <span>{t('panel.maxHeight')}</span>
                  <input
                    class="pr-input"
                    type="number"
                    min={0}
                    step={500}
                    placeholder={t('panel.noLimit')}
                    value={settings.maxHeight || ''}
                    onInput={(e) =>
                      update({
                        maxHeight: Math.max(0, Math.round(Number(e.currentTarget.value) || 0)),
                      })
                    }
                  />
                </label>
              )}
              {canEmulate ? (
                <>
                  <div class="pr-prop">
                    <span>{t('common.theme')}</span>
                    <Segmented
                      label={t('panel.colourScheme')}
                      value={settings.theme}
                      onChange={(theme) => update({ theme })}
                      options={[
                        { value: 'light', label: t('theme.light') },
                        { value: 'dark', label: t('theme.dark') },
                        { value: 'both', label: t('theme.both') },
                      ]}
                    />
                  </div>
                  <label class="pr-prop">
                    <span>{t('language.page')}</span>
                    <select
                      class="pr-input"
                      value={settings.language}
                      onChange={(e) => update({ language: e.currentTarget.value })}
                    >
                      {LANGUAGES.map((l) => (
                        <option value={l.value} lang={l.value || undefined}>
                          {l.value ? l.label : t('panel.pageDefault')}
                        </option>
                      ))}
                    </select>
                  </label>
                  {settings.language && <p class="hint hint--prop">{t('panel.languageHint')}</p>}
                </>
              ) : (
                <p class="hint">{t('panel.firefoxHint')}</p>
              )}
            </Section>

            <Section
              title={t('common.widths')}
              aside={
                <span class="num">{t('panel.selected', { count: settings.widths.length })}</span>
              }
            >
              <div class={settings.customWidths.length ? 'widths widths--custom' : 'widths'}>
                {[
                  ...PRESET_WIDTHS,
                  ...settings.customWidths.map((width) => ({
                    width,
                    custom: true,
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
                    <span>{'custom' in p ? t('device.custom') : t(DEVICES[p.icon])}</span>
                    <span class="num muted">{p.width}</span>
                    {'custom' in p ? (
                      <IconButton
                        icon="close"
                        label={t('panel.removeWidth', { width: String(p.width) })}
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
                  placeholder={t('panel.widthPlaceholder')}
                  aria-label={t('panel.widthLabel')}
                  value={customWidth}
                  onInput={(e) => setCustomWidth(e.currentTarget.value)}
                />
                <IconButton
                  type="submit"
                  icon="plus"
                  label={t('panel.addWidth')}
                  disabled={!customWidth}
                />
              </form>
            </Section>

            <Section title={t('panel.before')}>
              <Toggle
                label={t('panel.hideOverlays')}
                hint={t('panel.hideOverlaysHint')}
                checked={settings.hideOverlays}
                onChange={(hideOverlays) => update({ hideOverlays })}
              />
              <Toggle
                label={t('panel.preload')}
                hint={t('panel.preloadHint')}
                checked={settings.preload}
                onChange={(preload) => update({ preload })}
              />
              <Toggle
                label={t('panel.states')}
                hint={t('panel.statesHint')}
                checked={settings.states}
                onChange={(states) => update({ states })}
              />
              <Toggle
                label={t('common.screenshotReference')}
                hint={t('panel.screenshotHint')}
                checked={settings.screenshot}
                onChange={(screenshot) => update({ screenshot })}
              />
              <div class="pr-prop">
                <span>{t('panel.wait')}</span>
                <Segmented
                  label={t('panel.waitLabel')}
                  value={String(settings.delay)}
                  onChange={(delay) => update({ delay: Number(delay) })}
                  options={delays()}
                />
              </div>
              {settings.delay > 0 && <p class="hint hint--prop">{t('panel.waitHint')}</p>}
              <label class="pr-prop">
                <span>{t('panel.hide')}</span>
                <input
                  class="pr-input"
                  type="text"
                  spellcheck={false}
                  placeholder=".chat-widget, .promo-bar"
                  aria-describedby="hide-hint"
                  value={settings.hide}
                  onInput={(e) => update({ hide: e.currentTarget.value })}
                />
              </label>
              <p class="hint hint--prop" id="hide-hint">
                {invalid.length
                  ? t('panel.hideInvalid', { selectors: invalid.join(', ') })
                  : host
                    ? t('panel.hideSite', { host })
                    : t('panel.hideAny')}
              </p>
            </Section>

            <Section title={t('panel.panel')}>
              <InterfaceLanguage
                value={settings.interfaceLanguage}
                onChange={(interfaceLanguage) => update({ interfaceLanguage })}
              />
              <InterfaceTheme
                value={settings.appearance}
                onChange={(appearance) => update({ appearance })}
              />
            </Section>
          </>
        ) : (
          <Section
            title={t('panel.summary')}
            aside={
              <button type="button" class="text-button" onClick={() => update({ editing: true })}>
                {t('common.edit')}
              </button>
            }
          >
            <dl class="pr-props">
              <div class="pr-prop">
                <dt>{t('panel.area')}</dt>
                <dd>{t(SCOPES[settings.scope])}</dd>
              </div>
              <div class="pr-prop">
                <dt>{t('common.widths')}</dt>
                <dd class="num truncate">{settings.widths.join(', ') || t('common.none')}</dd>
              </div>
              <div class="pr-prop">
                <dt>{t('common.theme')}</dt>
                <dd>{canEmulate ? t(THEMES[settings.theme]) : t('panel.asShown')}</dd>
              </div>
              <div class="pr-prop">
                <dt>{t('language.page')}</dt>
                <dd class="truncate">{canEmulate ? language : t('panel.asShown')}</dd>
              </div>
              {settings.hide.trim() && (
                <div class="pr-prop">
                  <dt>{t('panel.hide')}</dt>
                  <dd class="truncate">{settings.hide}</dd>
                </div>
              )}
              {settings.delay > 0 && (
                <div class="pr-prop">
                  <dt>{t('panel.wait')}</dt>
                  <dd class="num">{formatSeconds(settings.delay, 0)}</dd>
                </div>
              )}
              {settings.scope === 'page' && settings.maxHeight > 0 && (
                <div class="pr-prop">
                  <dt>{t('panel.maxHeight')}</dt>
                  <dd class="num">{formatNumber(settings.maxHeight)} px</dd>
                </div>
              )}
            </dl>
          </Section>
        )}

        {older.length > 0 && (
          <Section
            title={t('panel.recent')}
            aside={
              history.length > 1 ? (
                <button
                  type="button"
                  class="text-button"
                  onClick={() => {
                    setSelecting(!selecting)
                    setPicked(new Set())
                  }}
                >
                  {selecting ? t('common.done') : t('panel.select')}
                </button>
              ) : (
                t('panel.onDevice')
              )
            }
          >
            <History
              entries={selecting ? history : older}
              copied={copied}
              picked={selecting ? picked : null}
              onPick={pick}
              onCopy={copy}
              onDownload={download}
              onRemove={remove}
            />
          </Section>
        )}

        <p class="credit">
          {rich('credit.built', {
            company: (
              <a href={CREDIT.url} target="_blank" rel="noreferrer">
                {CREDIT.company}
              </a>
            ),
          })}{' '}
          <span class="num">v{__VERSION__}</span>
        </p>
      </main>

      <footer class="dock">
        {status.kind === 'error' && (
          <Message tone="error" onDismiss={() => setStatus({ kind: 'idle' })}>
            {status.message}
          </Message>
        )}
        {canEmulate && !settings.seenDebuggerNote && status.kind === 'idle' && (
          <Message>
            {rich('panel.debugger', { notice: <strong>{t('panel.debuggerNotice')}</strong> })}
          </Message>
        )}
        {busy ? (
          <div class="progress" aria-live="polite">
            <Progress value={(status.progress.step + 0.5) / Math.max(status.progress.steps, 1)} />
            <div class="progress-line">
              <span class="pr-spinner" />
              <span class="truncate">{status.progress.label}</span>
              <span class="num muted">
                {t('common.countOf', {
                  count: Math.min(status.progress.step + 1, status.progress.steps),
                  total: status.progress.steps,
                })}
              </span>
            </div>
          </div>
        ) : selecting ? (
          <>
            <p class="next">
              {chosen.length > 1 ? t('panel.combineReady') : t('panel.combinePick')}
            </p>
            <div class="dock-row">
              <Button
                variant="primary"
                size="lg"
                block
                icon={copied === 'tray' ? 'check' : 'copy'}
                data-done={copied === 'tray' ? '' : undefined}
                disabled={chosen.length === 0}
                onClick={copyChosen}
              >
                {copied === 'tray'
                  ? t('common.copied')
                  : chosen.length
                    ? t('panel.copyMany', { count: chosen.length })
                    : t('panel.combineChoose')}
              </Button>
              {chosen.length > 0 && (
                <IconButton
                  icon="download"
                  label={t('panel.downloadOne')}
                  onClick={downloadChosen}
                />
              )}
            </div>
          </>
        ) : current ? (
          <>
            <p class="next">{t('panel.next')}</p>
            <div class="dock-row">
              <Button
                variant="primary"
                size="lg"
                block
                icon={copied === current.id ? 'check' : 'copy'}
                data-done={copied === current.id ? '' : undefined}
                onClick={() => copy(current)}
              >
                {copied === current.id ? t('common.copied') : t('common.copyForFigma')}
              </Button>
              <IconButton
                icon="download"
                label={t('common.downloadRecast')}
                onClick={() => download(current)}
              />
              <IconButton
                icon="refresh"
                label={t('panel.captureAgain')}
                onClick={() => capture()}
              />
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
            {views > 1 ? t('panel.captureFrames', { count: views }) : t('panel.capturePage')}
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
          <span class="num">{t('count.frames', { count: frames.length })}</span>
          <span class="num">{t('count.layers', { count: entry.layers })}</span>
          <span class="num">{formatBytes(entry.bytes)}</span>
        </p>
      </div>
    </section>
  )
}

/** Recent captures; with `picked` set, each row is a checkbox for the combined copy. */
function History({
  entries,
  copied,
  picked,
  onPick,
  onCopy,
  onDownload,
  onRemove,
}: {
  entries: Entry[]
  copied: string | null
  picked: Set<string> | null
  onPick: (id: string) => void
  onCopy: (entry: Entry) => void
  onDownload: (entry: Entry) => void
  onRemove: (entry: Entry) => void
}) {
  return (
    <ul class={picked ? 'history history--pick' : 'history'}>
      {entries.map((entry) => {
        const thumb = entry.frames?.[0]?.src ?? entry.thumbnail
        const body = (
          <>
            {thumb ? <img src={thumb} alt="" /> : <span class="thumb" />}
            <div class="history-text">
              <p class="truncate">{entry.title}</p>
              <p class="truncate muted">
                <span class="num">{t('count.frames', { count: entry.views.length })}</span> ·{' '}
                {formatAgo(entry.createdAt)}
              </p>
            </div>
          </>
        )
        return picked ? (
          <li>
            <label class="pick">
              <input
                class="pr-check"
                type="checkbox"
                checked={picked.has(entry.id)}
                onChange={() => onPick(entry.id)}
              />
              {body}
            </label>
          </li>
        ) : (
          <li>
            {body}
            <div class="history-actions">
              <IconButton
                icon={copied === entry.id ? 'check' : 'copy'}
                label={t('common.copyForFigma')}
                onClick={() => onCopy(entry)}
              />
              <IconButton
                icon="download"
                label={t('common.downloadRecast')}
                onClick={() => onDownload(entry)}
              />
              <IconButton icon="trash" label={t('common.delete')} onClick={() => onRemove(entry)} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
