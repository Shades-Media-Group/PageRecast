import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  CLIPBOARD_PREFIX,
  decode,
  SceneError,
  type Capture,
  type RecastFile,
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
  importKey,
  optionsFor,
  RATING_AFTER_IMPORTS,
  type ImportOptions,
  type ImportReport,
  type MainToUi,
  type Settings,
  type UiToMain,
} from '../shared/messages'
import { pageOf, pageTitle } from '../shared/pages'
import {
  fontLink,
  fontUsage,
  rememberChoices,
  type FontChoices,
  type MissingFont,
} from '../shared/fonts'
import { prepareImages, readFile, readFiles, readText, renderHtml } from './load'
import { BridgeClient, listen, Unauthorized, type AgentState } from './agent'
import { ApiTab, ExtensionTab, McpTab, WebTab } from './tabs'

const sizeOf = (files: File[]) => files.reduce((sum, f) => sum + f.size, 0)

type Tab = 'web' | 'extension' | 'file' | 'code' | 'mcp' | 'api'

const TABS: { value: Tab; label: string }[] = [
  { value: 'web', label: 'Web' },
  { value: 'extension', label: 'Extension' },
  { value: 'file', label: 'File' },
  { value: 'code', label: 'Code' },
  { value: 'mcp', label: 'MCP' },
  { value: 'api', label: 'API' },
]
type Stage =
  | { kind: 'empty' }
  | { kind: 'reading' }
  | {
      kind: 'ready'
      file: RecastFile
      selected: Set<string>
      bytes: number
      options: ImportOptions
      /** Import keys of captures already on the current page. */
      existing: Set<string>
      /** Replace those frames rather than adding new ones. */
      update: boolean
      /** Keep these options as the site's defaults for its next import. */
      remember: boolean
      /** Fonts Figma lacks and every family it has; absent until the plugin answers. */
      fonts?: { missing: MissingFont[]; families: string[] }
      /** The family picked for each missing font. */
      fontChoices: FontChoices
      /** "Check again" for newly installed fonts: running, or what it found. */
      fontCheck?: 'checking' | 'found' | 'same'
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
const COMMUNITY_URL = 'https://www.figma.com/community/plugin/1690893819753299295'
const ACCEPT = '.recast,.json,.html,.htm,.zip,.mhtml,.mht,.eml'

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
  const [tab, setTab] = useState<Tab>('web')
  const [view, setView] = useState<'main' | 'settings'>('main')
  const [stage, setStage] = useState<Stage>({ kind: 'empty' })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [version, setVersion] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const modifier = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const stageRef = useRef(stage)
  stageRef.current = stage
  const [agent, setAgent] = useState<AgentState>({ kind: 'off' })

  const saveSettings = (next: Settings) => {
    setSettings(next)
    send({ type: 'settings', settings: next })
  }

  const runImport = async (
    file: RecastFile,
    selected: Set<string>,
    options: ImportOptions,
    fonts: FontChoices,
    update = true,
    remember = true,
  ) => {
    if (remember)
      saveSettings({
        ...settingsRef.current,
        domains: { ...settingsRef.current.domains, [domainOf(file)]: options },
      })
    const chosen: RecastFile = {
      ...file,
      captures: file.captures.filter((c) => selected.has(c.id)),
    }
    setStage({ kind: 'importing', label: 'Preparing images', progress: 0.04 })
    const { images, tiles } = await prepareImages(
      chosen,
      (done, total) =>
        setStage({
          kind: 'importing',
          label: `Preparing images  ${done} / ${total}`,
          progress: 0.04 + 0.22 * (done / Math.max(total, 1)),
        }),
      options.smallerImages,
    )
    send({ type: 'import', file: chosen, images, tiles, options, fonts, update })
  }

  const load = async (read: () => Promise<RecastFile>, bytes: number) => {
    setView('main')
    setStage({ kind: 'reading' })
    try {
      const file = await read()
      const selected = new Set(file.captures.map((c) => c.id))
      const options = optionsFor(settingsRef.current, domainOf(file))
      // Without the review, fonts take the replacements remembered from earlier imports.
      if (!settingsRef.current.review && !modifier.current)
        return void runImport(file, selected, options, settingsRef.current.fonts)
      setStage({
        kind: 'ready',
        file,
        selected,
        bytes,
        options,
        existing: new Set(),
        update: true,
        remember: true,
        fontChoices: {},
      })
      const keys = file.captures.flatMap((c) => importKey(file.source.url, c) ?? [])
      if (keys.length) send({ type: 'find-imported', keys })
      send({ type: 'check-fonts', uses: fontUsage(file) })
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
      if (message.type === 'imported') {
        const keys = message.keys
        setStage((s) => (s.kind === 'ready' ? { ...s, existing: new Set(keys) } : s))
      }
      if (message.type === 'fonts') {
        const { missing, families } = message
        const known = new Map(families.map((f) => [f.toLowerCase(), f]))
        const saved = settingsRef.current.fonts
        setStage((s) => {
          if (s.kind !== 'ready') return s
          // Keep picks made on this screen, then the family remembered for each
          // font if Figma still has it, then the automatic pick.
          const pick = (m: MissingFont) =>
            known.get(s.fontChoices[m.requested]?.toLowerCase() ?? '') ??
            known.get(saved[m.requested]?.toLowerCase() ?? '') ??
            m.replacement
          const fontChoices = Object.fromEntries(missing.map((m) => [m.requested, pick(m)]))
          // After "Check again": did any of the fonts turn up?
          const fontCheck =
            s.fontCheck === 'checking'
              ? missing.length < (s.fonts?.missing.length ?? 0)
                ? 'found'
                : 'same'
              : undefined
          return { ...s, fonts: { missing, families }, fontChoices, fontCheck }
        })
      }
      if (message.type === 'error') setStage({ kind: 'error', message: message.message })
    }
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text') ?? ''
      // Fields keep what is pasted into them, except a capture, which imports from any tab.
      const inField = (event.target as HTMLElement)?.closest?.('textarea, input')
      if (inField && !text.trimStart().startsWith(CLIPBOARD_PREFIX)) return
      if (inField) event.preventDefault()
      const file = event.clipboardData?.files[0]
      if (file) return void load(() => readFile(file), file.size)
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

  // Captures an AI agent sends through the local bridge (docs/guides/mcp.md).
  const listening = settings.agent.listen
  useEffect(() => {
    if (!listening) return setAgent({ kind: 'off' })
    return listen({
      code: () => settingsRef.current.agent.code,
      // Files wait while a review or an import is on screen.
      ready: () => ['empty', 'error', 'done'].includes(stageRef.current.kind),
      onState: (next) =>
        setAgent((current) =>
          next.kind === 'connected' && !next.last && current.kind === 'connected' ? current : next,
        ),
      onFile: (_file, bytes) => void load(() => decode(bytes), bytes.length),
      onUnauthorized: () =>
        saveSettings({
          ...settingsRef.current,
          agent: { ...settingsRef.current.agent, code: '' },
        }),
    })
  }, [listening])

  const pair = async (code: string): Promise<string | null> => {
    try {
      await new BridgeClient().list(code)
    } catch (error) {
      return error instanceof Unauthorized
        ? 'That code does not match. Check the code the agent showed you.'
        : 'The agent stopped answering. Start it again, then pair.'
    }
    saveSettings({ ...settingsRef.current, agent: { listen: true, code } })
    setAgent({ kind: 'connected' })
    return null
  }

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
        const files = [...(e.dataTransfer?.files ?? [])]
        if (files.length) void load(() => readFiles(files), sizeOf(files))
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
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])]
          if (files.length) void load(() => readFiles(files), sizeOf(files))
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
            <Tabs value={tab} onChange={setTab} options={TABS} />
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
            {(stage.kind === 'empty' || stage.kind === 'error') && (
              <>
                {tab === 'web' && (
                  <WebTab
                    web={settings.web}
                    onChange={(web) => saveSettings({ ...settingsRef.current, web })}
                    open={openUrl}
                    onExtension={() => setTab('extension')}
                  />
                )}
                {tab === 'extension' && <ExtensionTab open={openUrl} />}
                {tab === 'file' && <FileTab onChoose={() => fileInput.current?.click()} />}
                {tab === 'code' && (
                  <CodeTab
                    onRender={(html, width) =>
                      load(() => renderHtml(html, width, 'HTML code'), html.length)
                    }
                  />
                )}
                {tab === 'mcp' && (
                  <McpTab
                    listening={listening}
                    state={agent}
                    onListen={(on) =>
                      saveSettings({
                        ...settingsRef.current,
                        agent: { ...settingsRef.current.agent, listen: on },
                      })
                    }
                    onPair={pair}
                    open={openUrl}
                  />
                )}
                {tab === 'api' && <ApiTab open={openUrl} />}
                <Credit />
              </>
            )}
            {stage.kind === 'reading' && <Working label="Reading the capture" progress={0.1} />}
            {stage.kind === 'importing' && (
              <Working label={stage.label} progress={stage.progress} />
            )}
            {stage.kind === 'ready' && (
              <Review
                stage={stage}
                onChange={(patch) => {
                  setStage({ ...stage, ...patch })
                  // Font picks are kept at once, so reopening the plugin after
                  // installing a font does not lose them.
                  if (patch.fontChoices && stage.fonts)
                    saveSettings({
                      ...settingsRef.current,
                      fonts: rememberChoices(
                        settingsRef.current.fonts,
                        stage.fonts.missing,
                        patch.fontChoices,
                      ),
                    })
                }}
              />
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
                onClick={() =>
                  runImport(
                    stage.file,
                    stage.selected,
                    stage.options,
                    stage.fontChoices,
                    stage.update,
                    stage.remember,
                  )
                }
              >
                {importLabel(stage)}
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
          Drop .recast, .html, .zip or .mhtml files
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
        <p>Drop files anywhere in this window, or choose them. Several files import together.</p>
        <Button icon="file" onClick={onChoose}>
          Choose files
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
          <div class="pr-prop">
            <dt>.zip</dt>
            <dd>A site folder with its styles, images and fonts</dd>
          </div>
          <div class="pr-prop">
            <dt>.mhtml</dt>
            <dd>A page saved by the browser as a single file</dd>
          </div>
          <div class="pr-prop">
            <dt>.eml</dt>
            <dd>An HTML email with its images</dd>
          </div>
        </dl>
      </Section>
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

/** Captures in the review that were imported onto this page before. */
function updating(stage: Extract<Stage, { kind: 'ready' }>) {
  return stage.file.captures.filter((c) => {
    const key = importKey(stage.file.source.url, c)
    return stage.selected.has(c.id) && key !== null && stage.existing.has(key)
  }).length
}

function importLabel(stage: Extract<Stage, { kind: 'ready' }>) {
  const n = stage.selected.size
  if (stage.update && n > 0 && updating(stage) === n)
    return n > 1 ? `Update ${n} frames` : 'Update in Figma'
  return n > 1 ? `Import ${n} frames` : 'Import into Figma'
}

function OptionToggles({
  options,
  onChange,
  aside,
}: {
  options: ImportOptions
  onChange: (patch: Partial<ImportOptions>) => void
  /** Says whom the options are for, beside the first title. */
  aside?: string
}) {
  return (
    <>
      <Section title="Structure" aside={aside}>
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
          label="Interaction states"
          hint="Hover, focus and active looks as variants"
          checked={options.states}
          onChange={(states) => onChange({ states })}
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
        <Toggle
          label="Smaller images"
          hint="Twice their size on the page, for a lighter file"
          checked={options.smallerImages}
          onChange={(smallerImages) => onChange({ smallerImages })}
        />
      </Section>
    </>
  )
}

/**
 * One row per captured width of each page, with the light and dark frames of
 * that width. A combined file names its page in front of the label.
 */
interface WidthGroup {
  page: string
  width: number
  device: string
  light?: Capture
  dark?: Capture
}

function groupByWidth(captures: Capture[]): WidthGroup[] {
  const groups = new Map<string, WidthGroup>()
  for (const capture of captures) {
    const width = capture.viewport.width
    const key = `${pageOf(capture)}|${width}`
    const page = pageTitle(capture)
    const group = groups.get(key) ?? {
      page,
      width,
      device: capture.label.slice(page ? page.length + 3 : 0).split(' · ')[0] || 'Frame',
    }
    group[capture.theme] ??= capture
    groups.set(key, group)
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
  const shownGroup = groups.find((g) => g.light === shown || g.dark === shown)!
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
          {groups.map((group, i) => [
            group.page && group.page !== groups[i - 1]?.page && (
              <p class="frames-page truncate">{group.page}</p>
            ),
            <div class={group === shownGroup ? 'frame-row is-shown' : 'frame-row'}>
              <button
                type="button"
                class="frame-pick"
                aria-pressed={group === shownGroup}
                aria-label={`Preview ${group.page} ${group.device} ${group.width}`.trim()}
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
            </div>,
          ])}
        </div>
      </Section>
      {updating(stage) > 0 && (
        <Section
          title="Imported before"
          aside={
            <span class="num">
              {updating(stage)} of {stage.selected.size}
            </span>
          }
        >
          <Segmented
            label="Frames imported before"
            value={stage.update ? 'update' : 'new'}
            onChange={(value) => onChange({ update: value === 'update' })}
            options={[
              { value: 'update', label: 'Update existing' },
              { value: 'new', label: 'Add as new' },
            ]}
          />
          <p class="hint">
            {stage.update
              ? 'Replaces the earlier frames in place, keeping their position and name.'
              : 'Keeps the earlier frames and adds new ones beside them.'}
          </p>
        </Section>
      )}
      {stage.fonts && (stage.fonts.missing.length > 0 || stage.fontCheck === 'found') && (
        <FontReplacements
          missing={stage.fonts.missing}
          families={stage.fonts.families}
          choices={stage.fontChoices}
          check={stage.fontCheck}
          sources={file.fontSources}
          onChange={(requested, family) =>
            onChange({ fontChoices: { ...stage.fontChoices, [requested]: family } })
          }
          onCheck={() => {
            onChange({ fontCheck: 'checking' })
            send({ type: 'check-fonts', uses: fontUsage(file) })
          }}
        />
      )}
      <OptionToggles
        aside="For this import"
        options={stage.options}
        onChange={(patch) => onChange({ options: { ...stage.options, ...patch } })}
      />
      <Section>
        <Toggle
          label={`Remember for ${domain}`}
          hint={
            stage.remember
              ? 'The next import from this site starts with these options'
              : 'These options apply to this import only'
          }
          checked={stage.remember}
          onChange={(remember) => onChange({ remember })}
        />
      </Section>
    </>
  )
}

/**
 * Fonts the capture uses that Figma lacks. Each shows the family the import
 * will use, the automatic pick unless another is chosen, a way to get the
 * real font, and "Check again" to look for it once installed.
 */
function FontReplacements({
  missing,
  families,
  choices,
  check,
  sources,
  onChange,
  onCheck,
}: {
  missing: MissingFont[]
  families: string[]
  choices: FontChoices
  check?: 'checking' | 'found' | 'same'
  sources?: Record<string, string>
  onChange: (requested: string, family: string) => void
  onCheck: () => void
}) {
  const known = useMemo(() => new Map(families.map((f) => [f.toLowerCase(), f])), [families])
  return (
    <Section
      title="Fonts"
      aside={
        <button type="button" class="text-button" disabled={check === 'checking'} onClick={onCheck}>
          {check === 'checking' ? 'Checking' : 'Check again'}
        </button>
      }
    >
      <datalist id="font-families">
        {families.map((family) => (
          <option value={family} />
        ))}
      </datalist>
      {missing.map((font) => (
        <div class="font-row">
          <span class="font-row__family truncate">{font.requested}</span>
          <FamilyInput
            label={`Use instead of ${font.requested}`}
            value={choices[font.requested] ?? font.replacement}
            automatic={font.replacement}
            known={known}
            onChange={(family) => onChange(font.requested, family)}
          />
          <span class="font-row__meta truncate" title={font.styles.join(', ')}>
            {font.styles.join(', ')} ·{' '}
            <span class="num">
              {font.count.toLocaleString()} {font.count === 1 ? 'use' : 'uses'}
            </span>
          </span>
          <button
            type="button"
            class="text-button"
            aria-label={`Get ${font.requested}`}
            onClick={() => openUrl(fontLink(font.requested, sources))}
          >
            Get font
          </button>
        </div>
      ))}
      <p class="hint" aria-live="polite">
        {missing.length === 0
          ? 'Every font is installed now and imports as itself.'
          : check === 'same'
            ? 'Still not found. If you just installed it, close and reopen PageRecast; your picks are kept.'
            : `${missing.length} ${missing.length === 1 ? 'font is' : 'fonts are'} not in Figma. Get and install ${missing.length === 1 ? 'it' : 'them'}, then check again, or import with the family shown.`}
      </p>
    </Section>
  )
}

/**
 * A family name field that suggests installed families and only accepts one
 * of them. The automatic pick says so, so no replacement goes unnoticed.
 */
function FamilyInput({
  label,
  value,
  automatic,
  known,
  onChange,
}: {
  label: string
  value: string
  automatic: string
  known: Map<string, string>
  onChange: (family: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    // Empty goes back to the automatic pick; an unknown name is undone.
    const family = draft.trim() ? known.get(draft.trim().toLowerCase()) : automatic
    if (family && family !== value) onChange(family)
    setDraft(null)
  }
  return (
    <input
      class="pr-input"
      list="font-families"
      aria-label={label}
      spellcheck={false}
      value={draft ?? (value === automatic ? `${value} (automatic)` : value)}
      onFocus={(e) => {
        setDraft(value)
        const input = e.currentTarget
        requestAnimationFrame(() => input.select())
      }}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onChange={commit}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(value)
        if (e.key === 'Enter') commit()
      }}
    />
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
  if (report.updated) rows.unshift(['Frames updated in place', report.updated])
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
      <RememberedFonts
        fonts={settings.fonts}
        onChange={(fonts) => onChange({ ...settings, fonts })}
      />
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

/** Font replacements picked during earlier reviews, each one forgettable. */
function RememberedFonts({
  fonts,
  onChange,
}: {
  fonts: FontChoices
  onChange: (fonts: FontChoices) => void
}) {
  const entries = Object.entries(fonts).sort(([a], [b]) => a.localeCompare(b))
  const forget = (requested: string) => {
    const rest = { ...fonts }
    delete rest[requested]
    onChange(rest)
  }
  return (
    <Section
      title="Fonts"
      aside={
        entries.length > 1 ? (
          <button type="button" class="text-button" onClick={() => onChange({})}>
            Forget all
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <p class="hint">
          Replacements you pick for missing fonts while reviewing an import are kept here.
        </p>
      ) : (
        <dl class="font-memory">
          {entries.map(([requested, family]) => (
            <div>
              <dt class="truncate">
                {requested} <span class="muted">as {family}</span>
              </dt>
              <IconButton
                icon="trash"
                label={`Forget the replacement for ${requested}`}
                onClick={() => forget(requested)}
              />
            </div>
          ))}
        </dl>
      )}
    </Section>
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
