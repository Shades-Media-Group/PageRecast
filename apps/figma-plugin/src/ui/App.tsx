import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { SceneError, type Capture, type RecastFile } from '@pagerecast/scene'
import {
  Button,
  CREDIT,
  DOCS_URL,
  formatBytes,
  Icon,
  IconButton,
  Logo,
  Message,
  Progress,
  REPO_URL,
  Section,
  Segmented,
  Tabs,
  Toggle,
  type IconName,
} from '@pagerecast/ui'
import {
  DEFAULT_SETTINGS,
  optionsFor,
  RATING_AFTER_IMPORTS,
  type ImportOptions,
  type ImportReport,
  type MainToUi,
  type Settings,
  type UiToMain,
} from '../shared/messages'
import { prepareImages, readFile, readText, renderHtml } from './load'

type Tab = 'paste' | 'file' | 'code'
type Stage =
  | { kind: 'empty' }
  | { kind: 'reading' }
  | {
      kind: 'ready'
      file: RecastFile
      selected: Set<string>
      bytes: number
      options: ImportOptions
    }
  | { kind: 'importing'; label: string; progress: number }
  | { kind: 'done'; report: ImportReport; askRating: boolean }
  | { kind: 'error'; message: string }

const send = (message: UiToMain) => parent.postMessage({ pluginMessage: message }, '*')
const openUrl = (url: string) => send({ type: 'open-url', url })
const link = (url: string) => (event: Event) => {
  event.preventDefault()
  openUrl(url)
}
const EXTENSION_URL = 'https://pagerecast.shades.md/#install'
const COMMUNITY_URL = 'https://www.figma.com/community/plugin/1690893819753299295'
const ACCEPT = '.recast,.json,.html,.htm'

const deviceIcon = (width: number): IconName =>
  width >= 1000 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile'

/** The key options are remembered under: the site's host, or "HTML code". */
function domainOf(file: RecastFile) {
  try {
    return new URL(file.source.url).host || 'HTML code'
  } catch {
    return 'HTML code'
  }
}

function screenshotUrl(file: RecastFile, capture?: Capture): string | null {
  const asset = capture?.screenshot ? file.assets[capture.screenshot] : undefined
  return asset?.kind === 'image' && asset.data
    ? `data:${asset.mime || 'image/png'};base64,${asset.data}`
    : null
}

export function App() {
  const [tab, setTab] = useState<Tab>('paste')
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [stage, setStage] = useState<Stage>({ kind: 'empty' })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [version, setVersion] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const modifier = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const saveSettings = (next: Settings) => {
    setSettings(next)
    send({ type: 'settings', settings: next })
  }

  const runImport = async (file: RecastFile, selected: Set<string>, options: ImportOptions) => {
    const domain = domainOf(file)
    saveSettings({
      ...settingsRef.current,
      domains: { ...settingsRef.current.domains, [domain]: options },
    })
    const chosen: RecastFile = {
      ...file,
      captures: file.captures.filter((c) => selected.has(c.id)),
    }
    setStage({ kind: 'importing', label: 'Preparing images', progress: 0.04 })
    const { images, tiles } = await prepareImages(chosen, (done, total) =>
      setStage({
        kind: 'importing',
        label: `Preparing images  ${done} / ${total}`,
        progress: 0.04 + 0.22 * (done / Math.max(total, 1)),
      }),
    )
    send({ type: 'import', file: chosen, images, tiles, options })
  }

  const load = async (read: () => Promise<RecastFile>, bytes: number) => {
    setView('main')
    setStage({ kind: 'reading' })
    try {
      const file = await read()
      const selected = new Set(file.captures.map((c) => c.id))
      const options = optionsFor(settingsRef.current, domainOf(file))
      if (!settingsRef.current.review && !modifier.current)
        return void runImport(file, selected, options)
      setStage({ kind: 'ready', file, selected, bytes, options })
    } catch (error) {
      setStage({
        kind: 'error',
        message:
          error instanceof SceneError
            ? error.message
            : 'That capture could not be read. Copy it again from the extension.',
      })
    }
  }

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage?: MainToUi }>) => {
      const message = event.data.pluginMessage
      if (!message) return
      if (message.type === 'ready') {
        setSettings(message.settings)
        setVersion(message.version)
      }
      if (message.type === 'progress') {
        const { phase, done, total } = message
        setStage({
          kind: 'importing',
          label:
            phase === 'fonts'
              ? 'Loading fonts'
              : phase === 'styles'
                ? 'Applying variables and styles'
                : `Building layers  ${done.toLocaleString()} / ${total.toLocaleString()}`,
          progress:
            phase === 'fonts'
              ? 0.3
              : phase === 'styles'
                ? 0.96
                : 0.3 + 0.65 * (done / Math.max(total, 1)),
        })
      }
      if (message.type === 'done') {
        // Counted on this device only, to ask for a rating once after a few good imports.
        const current = settingsRef.current
        const imports = current.imports + 1
        const askRating = !current.askedForRating && imports >= RATING_AFTER_IMPORTS
        saveSettings({ ...current, imports, askedForRating: current.askedForRating || askRating })
        setStage({ kind: 'done', report: message.report, askRating })
      }
      if (message.type === 'error') setStage({ kind: 'error', message: message.message })
    }
    const onPaste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.('textarea, input')) return
      const file = event.clipboardData?.files[0]
      if (file) return void load(() => readFile(file), file.size)
      const text = event.clipboardData?.getData('text') ?? ''
      if (text.trim()) void load(() => readText(text), text.length)
    }
    const onKey = (e: KeyboardEvent) => (modifier.current = e.metaKey || e.ctrlKey)
    document.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      document.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  const reset = () => setStage({ kind: 'empty' })
  const feedbackUrl = `${REPO_URL}/issues/new?template=feedback.yml&surface=Figma%20plugin&version=${version}`

  return (
    <div
      class="app"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer?.files[0]
        if (file) void load(() => readFile(file), file.size)
      }}
    >
      <header class="pr-header">
        <Logo height={15} />
        <div class="pr-header__actions">
          <IconButton icon="feedback" label="Send feedback" onClick={() => openUrl(feedbackUrl)} />
          <IconButton icon="help" label="Guides and help" onClick={() => openUrl(DOCS_URL)} />
          <IconButton
            icon="sliders"
            label="Import settings"
            aria-pressed={view === 'settings'}
            onClick={() => setView(view === 'settings' ? 'main' : 'settings')}
          />
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) void load(() => readFile(file), file.size)
          e.currentTarget.value = ''
        }}
      />

      {view === 'settings' ? (
        <>
          <TitleBar title="Import settings" onBack={() => setView('main')} />
          <SettingsView settings={settings} version={version} onChange={saveSettings} />
        </>
      ) : (
        <>
          {stage.kind === 'empty' || stage.kind === 'error' ? (
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { value: 'paste', label: 'Paste' },
                { value: 'file', label: 'File' },
                { value: 'code', label: 'Code' },
              ]}
            />
          ) : (
            <TitleBar
              title={
                stage.kind === 'done' ? 'Imported' : stage.kind === 'ready' ? 'Review' : 'Importing'
              }
              onBack={reset}
            />
          )}

          <main class="scroll">
            {stage.kind === 'error' && (
              <Section>
                <Message tone="error" onDismiss={reset}>
                  {stage.message}
                </Message>
              </Section>
            )}
            {(stage.kind === 'empty' || stage.kind === 'error') && tab === 'paste' && <PasteTab />}
            {(stage.kind === 'empty' || stage.kind === 'error') && tab === 'file' && (
              <FileTab onChoose={() => fileInput.current?.click()} />
            )}
            {(stage.kind === 'empty' || stage.kind === 'error') && tab === 'code' && (
              <CodeTab
                onRender={(html, width) =>
                  load(() => renderHtml(html, width, 'HTML code'), html.length)
                }
              />
            )}
            {stage.kind === 'reading' && <Working label="Reading the capture" progress={0.1} />}
            {stage.kind === 'importing' && (
              <Working label={stage.label} progress={stage.progress} />
            )}
            {stage.kind === 'ready' && (
              <Review stage={stage} onChange={(patch) => setStage({ ...stage, ...patch })} />
            )}
            {stage.kind === 'done' && <Done report={stage.report} askRating={stage.askRating} />}
          </main>

          {stage.kind === 'ready' ? (
            <footer class="dock">
              <Button
                variant="primary"
                size="lg"
                block
                disabled={stage.selected.size === 0}
                onClick={() => runImport(stage.file, stage.selected, stage.options)}
              >
                Import {stage.selected.size > 1 ? `${stage.selected.size} frames` : 'into Figma'}
              </Button>
            </footer>
          ) : stage.kind === 'done' ? (
            <footer class="dock">
              <Button size="lg" block onClick={reset}>
                Import another page
              </Button>
            </footer>
          ) : null}
        </>
      )}

      {dragging && (
        <div class="drop" aria-hidden="true">
          Drop a .recast or .html file
        </div>
      )}
    </div>
  )
}

/** A title row in place of the tabs, with a way back. */
function TitleBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div class="pr-tabs pr-tabs--title">
      <button type="button" onClick={onBack} aria-label={`Back from ${title}`}>
        <Icon name="chevronRight" size={16} class="flip" />
        {title}
      </button>
    </div>
  )
}

function PasteTab() {
  return (
    <>
      <section class="intro">
        <div class="keys" aria-hidden="true">
          <span class="pr-keycap">⌘</span>
          <span class="pr-keycap">V</span>
        </div>
        <h1>Paste a capture</h1>
        <p>Copy a page with the PageRecast extension, then paste it anywhere in this window.</p>
        <a class="link" href={EXTENSION_URL} onClick={link(EXTENSION_URL)}>
          Get the Chrome extension
          <Icon name="external" size={16} />
        </a>
      </section>
      <Section title="The extension captures">
        <ul class="facts">
          <li>Pages behind a login, staging and localhost</li>
          <li>Several widths and both themes in one go</li>
          <li>A whole page, the visible area or one element</li>
        </ul>
      </Section>
      <Credit />
    </>
  )
}

function Credit() {
  return (
    <p class="credit">
      Free and open source. Built by{' '}
      <a href={CREDIT.url} onClick={link(CREDIT.url)}>
        {CREDIT.company}
      </a>
      . Nothing you import leaves this computer.
    </p>
  )
}

function FileTab({ onChoose }: { onChoose: () => void }) {
  return (
    <>
      <section class="intro">
        <h1>Open a file</h1>
        <p>Drop a file anywhere in this window, or choose one.</p>
        <Button icon="file" onClick={onChoose}>
          Choose file
        </Button>
      </section>
      <Section title="Supported files">
        <dl class="pr-props">
          <div class="pr-prop">
            <dt>.recast</dt>
            <dd>Saved from the extension or sent by a teammate</dd>
          </div>
          <div class="pr-prop">
            <dt>.html, .htm</dt>
            <dd>Rendered here, without scripts</dd>
          </div>
        </dl>
      </Section>
      <Credit />
    </>
  )
}

function Working({ label, progress }: { label: string; progress: number }) {
  return (
    <>
      <Progress value={progress} />
      <section class="working" aria-live="polite">
        <span class="pr-spinner" />
        <span class="num">{label}</span>
      </section>
    </>
  )
}

function OptionToggles({
  options,
  onChange,
}: {
  options: ImportOptions
  onChange: (patch: Partial<ImportOptions>) => void
}) {
  return (
    <>
      <Section title="Structure">
        <Toggle
          label="Auto Layout"
          hint="Where it reproduces the page exactly"
          checked={options.autoLayout}
          onChange={(autoLayout) => onChange({ autoLayout })}
        />
        <Toggle
          label="Components"
          hint="From repeated cards, rows and links"
          checked={options.components}
          onChange={(components) => onChange({ components })}
        />
        <Toggle
          label="HTML layer names"
          hint="div.card instead of Card"
          checked={options.htmlNames}
          onChange={(htmlNames) => onChange({ htmlNames })}
        />
      </Section>
      <Section title="Styles">
        <Toggle
          label="Use the file's styles"
          hint="Reuse matching variables and styles, libraries included"
          checked={options.useLocalStyles}
          onChange={(useLocalStyles) => onChange({ useLocalStyles })}
        />
        <Toggle
          label="Create variables"
          hint="Colour, spacing and radius, with Light and Dark modes"
          checked={options.variables}
          onChange={(variables) => onChange({ variables })}
        />
        <Toggle
          label="Create text styles"
          hint="For type used more than once"
          checked={options.textStyles}
          onChange={(textStyles) => onChange({ textStyles })}
        />
      </Section>
      <Section title="Content">
        <Toggle
          label="Links"
          hint="Keep links on text"
          checked={options.hyperlinks}
          onChange={(hyperlinks) => onChange({ hyperlinks })}
        />
        <Toggle
          label="Screenshot reference"
          hint="Locked, beside each frame"
          checked={options.screenshot}
          onChange={(screenshot) => onChange({ screenshot })}
        />
      </Section>
    </>
  )
}

/** One row per captured width, with the light and dark frames of that width. */
interface WidthGroup {
  width: number
  device: string
  light?: Capture
  dark?: Capture
}

function groupByWidth(captures: Capture[]): WidthGroup[] {
  const groups = new Map<number, WidthGroup>()
  for (const capture of captures) {
    const width = capture.viewport.width
    const group = groups.get(width) ?? {
      width,
      device: capture.label.split(' · ')[0] || 'Frame',
    }
    group[capture.theme] ??= capture
    groups.set(width, group)
  }
  return [...groups.values()]
}

/** The frame being previewed, large and scrollable, at its relative width. */
function Preview({ file, capture }: { file: RecastFile; capture: Capture }) {
  const src = useMemo(() => screenshotUrl(file, capture), [file, capture])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.scrollTo({ top: 0 }), [capture.id])
  if (!src) return null
  // Desktop fills the stage; narrower frames keep their proportion to it.
  const share = Math.min(100, Math.max(36, (capture.viewport.width / 1440) * 100))
  return (
    <div class="preview" ref={ref} tabIndex={0} aria-label={`Preview of ${capture.label}`}>
      <img src={src} alt={`Screenshot of ${capture.label}`} style={{ width: `${share}%` }} />
    </div>
  )
}

function Review({
  stage,
  onChange,
}: {
  stage: Extract<Stage, { kind: 'ready' }>
  onChange: (patch: Partial<Extract<Stage, { kind: 'ready' }>>) => void
}) {
  const { file, selected } = stage
  const groups = useMemo(() => groupByWidth(file.captures), [file])
  const themes = (['light', 'dark'] as const).filter((t) => groups.some((g) => g[t]))
  const [previewId, setPreviewId] = useState(file.captures[0]!.id)
  const shown = file.captures.find((c) => c.id === previewId) ?? file.captures[0]!
  const shownGroup = groups.find((g) => g.width === shown.viewport.width)!
  const domain = domainOf(file)

  const toggle = (capture: Capture) => {
    const next = new Set(selected)
    if (next.has(capture.id)) next.delete(capture.id)
    else next.add(capture.id)
    onChange({ selected: next })
  }
  const pick = (group: WidthGroup) =>
    setPreviewId((group[shown.theme] ?? group.light ?? group.dark)!.id)

  return (
    <>
      <Preview file={file} capture={shown} />
      <div class="preview-bar">
        <span class="truncate">
          {shownGroup.device}{' '}
          <span class="num muted">
            {Math.round(shown.width)} × {Math.round(shown.height)}
          </span>
        </span>
        {shownGroup.light && shownGroup.dark && (
          <Segmented
            label="Preview theme"
            value={shown.theme}
            onChange={(theme) => setPreviewId(shownGroup[theme]!.id)}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        )}
      </div>

      <Section>
        <div class="source">
          <h1 class="truncate">{file.source.title || domain}</h1>
          <p class="truncate muted">
            {domain} · <span class="num">{formatBytes(stage.bytes)}</span>
          </p>
        </div>
      </Section>

      <Section
        title="Frames"
        aside={
          <span class="num">
            {selected.size} of {file.captures.length} selected
          </span>
        }
      >
        <div class="frames" style={{ '--themes': themes.length }}>
          <div class="frames-head" aria-hidden="true">
            <span>Width</span>
            {themes.map((t) => (
              <span>{t === 'dark' ? 'Dark' : 'Light'}</span>
            ))}
          </div>
          {groups.map((group) => (
            <div class={group === shownGroup ? 'frame-row is-shown' : 'frame-row'}>
              <button
                type="button"
                class="frame-pick"
                aria-pressed={group === shownGroup}
                aria-label={`Preview ${group.device} ${group.width}`}
                onClick={() => pick(group)}
              >
                <Icon name={deviceIcon(group.width)} size={16} />
                <span class="truncate">{group.device}</span>
                <span class="num">{group.width}</span>
              </button>
              {themes.map((theme) => {
                const capture = group[theme]
                return (
                  <span class="frame-cell">
                    {capture && (
                      <input
                        class="pr-check"
                        type="checkbox"
                        aria-label={`Import ${capture.label}`}
                        checked={selected.has(capture.id)}
                        onChange={() => toggle(capture)}
                      />
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </Section>
      <OptionToggles
        options={stage.options}
        onChange={(patch) => onChange({ options: { ...stage.options, ...patch } })}
      />
      <p class="credit">These options are remembered for {domain}.</p>
    </>
  )
}

function Done({ report, askRating }: { report: ImportReport; askRating: boolean }) {
  const [rating, setRating] = useState(askRating)
  const rows: [string, number][] = [
    ['Text layers', report.texts],
    ['Images', report.images],
    ['Vectors', report.vectors],
    ['Auto Layout frames', report.autoLayouts],
    ['Components', report.components],
    ['Instances', report.instances],
    ['New variables', report.variables],
    ['New text styles', report.textStyles],
    ['Layers using existing styles', report.reusedStyles],
    ['Layers using library variables', report.matchedFromLibrary],
  ]
  if (report.rasters) rows.push(['Snapshots of canvas, video and embeds', report.rasters])
  return (
    <>
      <Section>
        <div class="source source--lead">
          <h1>
            <span class="num">{report.frames}</span> {report.frames === 1 ? 'frame' : 'frames'} on
            the canvas
          </h1>
          <p class="muted">
            Selected and ready to edit. Built in{' '}
            <span class="num">{(report.durationMs / 1000).toFixed(1)}</span> s.
          </p>
        </div>
      </Section>
      {rating && (
        <Section title="Enjoying PageRecast?">
          <p class="body">
            A rating on the Figma Community helps other designers find it. We only ask once.
          </p>
          <div class="actions">
            <Button
              onClick={() => {
                openUrl(COMMUNITY_URL)
                setRating(false)
              }}
            >
              Rate PageRecast
            </Button>
            <Button variant="ghost" onClick={() => setRating(false)}>
              Not now
            </Button>
          </div>
        </Section>
      )}
      <Section title="Created">
        <dl class="pr-stats">
          {rows.map(([label, value]) => (
            <div>
              <dt>{label}</dt>
              <dd class={value === 0 ? 'is-zero' : undefined}>{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {report.substitutions.length > 0 && (
        <Section title="Fonts replaced" aside="Install them for an exact match">
          <dl class="pr-stats">
            {report.substitutions.map((s) => (
              <div>
                <dt class="truncate">
                  {s.requested} <span class="muted">as {s.used}</span>
                </dt>
                <dd>{s.count.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {report.warnings.length > 0 && (
        <Section title="Notes" aside={<span class="num">{report.warnings.length}</span>}>
          <ul class="facts">
            {report.warnings.slice(0, 40).map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function SettingsView({
  settings,
  version,
  onChange,
}: {
  settings: Settings
  version: string
  onChange: (settings: Settings) => void
}) {
  const [scope, setScope] = useState('default')
  const domains = Object.keys(settings.domains).sort()
  const current = scope === 'default' ? settings.defaults : optionsFor(settings, scope)
  const update = (patch: Partial<ImportOptions>) =>
    scope === 'default'
      ? onChange({ ...settings, defaults: { ...settings.defaults, ...patch } })
      : onChange({
          ...settings,
          domains: { ...settings.domains, [scope]: { ...current, ...patch } },
        })
  const forget = () => {
    const rest = { ...settings.domains }
    delete rest[scope]
    onChange({ ...settings, domains: rest })
    setScope('default')
  }
  return (
    <main class="scroll settings">
      <Section>
        <div class={scope === 'default' ? 'pr-prop' : 'pr-prop scope--site'}>
          <label for="settings-scope">Options for</label>
          <div class="scope">
            <select
              id="settings-scope"
              class="pr-input"
              value={scope}
              onChange={(e) => setScope(e.currentTarget.value)}
            >
              <option value="default">New sites</option>
              {domains.length > 0 && (
                <optgroup label="Sites">
                  {domains.map((d) => (
                    <option value={d}>{d}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {scope !== 'default' && (
              <IconButton icon="trash" label={`Forget ${scope}`} onClick={forget} />
            )}
          </div>
        </div>
        <p class="hint hint--prop">Each site remembers the options you last imported it with.</p>
      </Section>
      <OptionToggles options={current} onChange={update} />
      <Section title="Workflow">
        <Toggle
          label="Review before importing"
          hint="When off, pasting imports right away. Hold ⌘ while pasting to review anyway."
          checked={settings.review}
          onChange={(review) => onChange({ ...settings, review })}
        />
      </Section>
      <Section title="About">
        <dl class="pr-props">
          <div class="pr-prop">
            <dt>Version</dt>
            <dd class="num">
              <a href={`${REPO_URL}/releases`} onClick={link(`${REPO_URL}/releases`)}>
                {version}
              </a>
            </dd>
          </div>
          <div class="pr-prop">
            <dt>Source code</dt>
            <dd>
              <a href={REPO_URL} onClick={link(REPO_URL)}>
                GitHub
              </a>
            </dd>
          </div>
        </dl>
      </Section>
      <Credit />
    </main>
  )
}

const WIDTHS = [
  { value: '1440', label: 'Desktop' },
  { value: '768', label: 'Tablet' },
  { value: '390', label: 'Mobile' },
]

function CodeTab({ onRender }: { onRender: (html: string, width: number) => void }) {
  const [html, setHtml] = useState('')
  const [width, setWidth] = useState('1440')
  return (
    <>
      <Section title="HTML and CSS" aside="Rendered here, without scripts">
        <textarea
          class="pr-textarea code"
          spellcheck={false}
          aria-label="HTML and CSS"
          placeholder={
            '<style>\n  .card { padding: 24px; border-radius: 16px; }\n</style>\n<div class="card">Hello</div>'
          }
          value={html}
          onInput={(e) => setHtml(e.currentTarget.value)}
        />
        <div class="pr-prop code-width">
          <span>Width</span>
          <div class="width">
            <Segmented label="Width preset" value={width} onChange={setWidth} options={WIDTHS} />
            <input
              class="pr-input"
              type="number"
              min={240}
              max={3840}
              aria-label="Width in pixels"
              value={width}
              onInput={(e) => setWidth(e.currentTarget.value)}
            />
          </div>
        </div>
      </Section>
      <Section>
        <Button
          variant="primary"
          block
          disabled={!html.trim()}
          onClick={() => onRender(html, Math.min(3840, Math.max(240, Number(width) || 1440)))}
        >
          Render and review
        </Button>
      </Section>
    </>
  )
}
