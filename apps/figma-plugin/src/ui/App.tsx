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
  DEFAULT_OPTIONS,
  type ImportOptions,
  type ImportReport,
  type MainToUi,
  type UiToMain,
} from '../shared/messages'
import { prepareImages, readFile, readText, renderHtml } from './load'

declare const __VERSION__: string

type Stage =
  | { kind: 'empty' }
  | { kind: 'reading' }
  | { kind: 'ready'; file: RecastFile; selected: Set<string>; bytes: number }
  | { kind: 'importing'; label: string; progress: number }
  | { kind: 'done'; report: ImportReport }
  | { kind: 'error'; message: string }

const send = (message: UiToMain) => parent.postMessage({ pluginMessage: message }, '*')
const open = (url: string) => (event: Event) => {
  event.preventDefault()
  send({ type: 'open-url', url })
}
const EXTENSION_URL = `${REPO_URL}#install`

const deviceIcon = (width: number): IconName =>
  width >= 1000 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile'

function hostOf(url: string) {
  try {
    return new URL(url).host
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
  const [tab, setTab] = useState<'capture' | 'code'>('capture')
  const [stage, setStage] = useState<Stage>({ kind: 'empty' })
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async (read: () => Promise<RecastFile>, bytes: number) => {
    setStage({ kind: 'reading' })
    try {
      const file = await read()
      setTab('capture')
      setStage({ kind: 'ready', file, selected: new Set(file.captures.map((c) => c.id)), bytes })
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
      if (message.type === 'ready') setOptions(message.options)
      if (message.type === 'progress') {
        const { phase, done, total } = message
        setStage({
          kind: 'importing',
          label:
            phase === 'fonts'
              ? 'Loading fonts'
              : phase === 'styles'
                ? 'Creating variables and styles'
                : `Building layers  ${done.toLocaleString()} / ${total.toLocaleString()}`,
          progress:
            phase === 'fonts'
              ? 0.3
              : phase === 'styles'
                ? 0.96
                : 0.3 + 0.65 * (done / Math.max(total, 1)),
        })
      }
      if (message.type === 'done') setStage({ kind: 'done', report: message.report })
      if (message.type === 'error') setStage({ kind: 'error', message: message.message })
    }
    const onPaste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.('textarea, input')) return
      const file = event.clipboardData?.files[0]
      if (file) return void load(() => readFile(file), file.size)
      const text = event.clipboardData?.getData('text') ?? ''
      if (text.trim()) void load(() => readText(text), text.length)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const setOption = (patch: Partial<ImportOptions>) => {
    const next = { ...options, ...patch }
    setOptions(next)
    send({ type: 'options', options: next })
  }

  const startImport = async () => {
    if (stage.kind !== 'ready') return
    const file: RecastFile = {
      ...stage.file,
      captures: stage.file.captures.filter((c) => stage.selected.has(c.id)),
    }
    setStage({ kind: 'importing', label: 'Preparing images', progress: 0.04 })
    const { images, tiles } = await prepareImages(file, (done, total) =>
      setStage({
        kind: 'importing',
        label: `Preparing images  ${done} / ${total}`,
        progress: 0.04 + 0.22 * (done / Math.max(total, 1)),
      }),
    )
    send({ type: 'import', file, images, tiles, options })
  }

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
        <IconButton icon="docs" label="Guides" onClick={open(DOCS_URL)} />
      </header>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'capture', label: 'Capture' },
          { value: 'code', label: 'HTML and CSS' },
        ]}
      />

      <input
        ref={fileInput}
        type="file"
        accept=".recast,.json,.html,.htm"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) void load(() => readFile(file), file.size)
          e.currentTarget.value = ''
        }}
      />

      {tab === 'code' ? (
        <CodeTab
          onRender={(html, width) => load(() => renderHtml(html, width, 'HTML code'), html.length)}
        />
      ) : (
        <>
          <main class="scroll">
            {stage.kind === 'empty' && <Empty onChoose={() => fileInput.current?.click()} />}
            {stage.kind === 'reading' && <Working label="Reading the capture" progress={0.1} />}
            {stage.kind === 'importing' && (
              <Working label={stage.label} progress={stage.progress} />
            )}
            {stage.kind === 'error' && (
              <Section>
                <Message tone="error">{stage.message}</Message>
              </Section>
            )}
            {stage.kind === 'ready' && (
              <Ready
                stage={stage}
                options={options}
                onOption={setOption}
                onToggle={(id) => {
                  const selected = new Set(stage.selected)
                  if (selected.has(id)) selected.delete(id)
                  else selected.add(id)
                  setStage({ ...stage, selected })
                }}
              />
            )}
            {stage.kind === 'done' && <Done report={stage.report} />}
          </main>
          <footer class="dock">
            {stage.kind === 'ready' ? (
              <>
                <IconButton
                  icon="close"
                  label="Discard capture"
                  onClick={() => setStage({ kind: 'empty' })}
                />
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={stage.selected.size === 0}
                  onClick={startImport}
                >
                  Import {stage.selected.size > 1 ? `${stage.selected.size} frames` : 'into Figma'}
                </Button>
              </>
            ) : stage.kind === 'done' || stage.kind === 'error' ? (
              <Button size="lg" block onClick={() => setStage({ kind: 'empty' })}>
                {stage.kind === 'done' ? 'Import another page' : 'Start over'}
              </Button>
            ) : (
              <p class="colophon">
                <span>
                  Free and open source. Built by{' '}
                  <a href={CREDIT.url} onClick={open(CREDIT.url)}>
                    {CREDIT.company}
                  </a>
                </span>
                <span class="num">v{__VERSION__}</span>
              </p>
            )}
          </footer>
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

function Empty({ onChoose }: { onChoose: () => void }) {
  return (
    <>
      <section class="intro">
        <div class="keys" aria-hidden="true">
          <span class="pr-keycap">⌘</span>
          <span class="pr-keycap">V</span>
        </div>
        <h1>Paste a capture</h1>
        <p>Copy a page with the PageRecast extension, then paste it anywhere in this window.</p>
        <div class="intro-actions">
          <Button icon="file" onClick={onChoose}>
            Open file
          </Button>
          <a class="link" href={EXTENSION_URL} onClick={open(EXTENSION_URL)}>
            Get the Chrome extension
            <Icon name="external" size={14} />
          </a>
        </div>
      </section>
      <Section title="Works with">
        <ul class="facts">
          <li>Pages behind a login, staging and localhost</li>
          <li>Any width, light and dark, in one capture</li>
          <li>.html files and pasted HTML and CSS</li>
        </ul>
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

function Ready({
  stage,
  options,
  onOption,
  onToggle,
}: {
  stage: Extract<Stage, { kind: 'ready' }>
  options: ImportOptions
  onOption: (patch: Partial<ImportOptions>) => void
  onToggle: (id: string) => void
}) {
  const { file } = stage
  const first = file.captures.find((c) => stage.selected.has(c.id)) ?? file.captures[0]
  const preview = useMemo(() => screenshotUrl(file, first), [file, first])
  const bothThemes = new Set(file.captures.map((c) => c.theme)).size > 1
  return (
    <>
      {preview && (
        <div class="stage">
          <img class="preview" src={preview} alt={`Screenshot of ${file.source.title}`} />
        </div>
      )}
      <Section>
        <div class="source">
          <h1 class="truncate">{file.source.title || hostOf(file.source.url)}</h1>
          <p class="muted">
            {hostOf(file.source.url)} · <span class="num">{formatBytes(stage.bytes)}</span>
          </p>
        </div>
      </Section>
      <Section title="Frames" aside={`${stage.selected.size} of ${file.captures.length}`}>
        {file.captures.map((capture) => (
          <label class="pr-row capture">
            <input
              class="pr-check"
              type="checkbox"
              checked={stage.selected.has(capture.id)}
              onChange={() => onToggle(capture.id)}
            />
            <Icon name={deviceIcon(capture.viewport.width)} size={16} class="muted" />
            <span class="truncate">{capture.label}</span>
            <span class="num muted">
              {Math.round(capture.width)} × {Math.round(capture.height)}
            </span>
          </label>
        ))}
      </Section>
      <Section title="Options">
        <Toggle
          label="Auto Layout"
          hint="Where it reproduces the page exactly"
          checked={options.autoLayout}
          onChange={(autoLayout) => onOption({ autoLayout })}
        />
        <Toggle
          label="Colour variables"
          hint={bothThemes ? 'With Light and Dark modes' : 'Capture both themes to get Dark mode'}
          checked={options.variables}
          onChange={(variables) => onOption({ variables })}
        />
        <Toggle
          label="Text styles"
          hint="For type used more than once"
          checked={options.textStyles}
          onChange={(textStyles) => onOption({ textStyles })}
        />
        <Toggle
          label="Screenshot reference"
          hint="Locked, beside each frame"
          checked={options.screenshot}
          onChange={(screenshot) => onOption({ screenshot })}
        />
      </Section>
    </>
  )
}

function Done({ report }: { report: ImportReport }) {
  const rows: [string, number][] = [
    ['Frames', report.frames],
    ['Text layers', report.texts],
    ['Images', report.images],
    ['Vectors', report.vectors],
    ['Auto Layout frames', report.autoLayouts],
    ['Colour variables', report.variables],
    ['Text styles', report.textStyles],
  ]
  if (report.rasters) rows.push(['Snapshots of canvas, video and embeds', report.rasters])
  return (
    <>
      <Section>
        <Message tone="success">
          <strong>Imported in {(report.durationMs / 1000).toFixed(1)} s.</strong> It's selected on
          the canvas.
        </Message>
      </Section>
      <Section title="Created">
        <dl class="stats">
          {rows.map(([label, value]) => (
            <div class="pr-row">
              <dt>{label}</dt>
              <dd class="num">{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {report.substitutions.length > 0 && (
        <Section title="Fonts replaced" aside="Install them for an exact match">
          <dl class="stats">
            {report.substitutions.map((s) => (
              <div class="pr-row">
                <dt class="truncate">
                  {s.requested} <span class="muted">→ {s.used}</span>
                </dt>
                <dd class="num muted">{s.count}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      {report.warnings.length > 0 && (
        <Section title="Notes" aside={report.warnings.length}>
          <ul class="facts facts--notes">
            {report.warnings.slice(0, 40).map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
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
      <main class="scroll">
        <Section title="Markup" aside="Rendered in this window">
          <textarea
            class="pr-textarea code"
            spellcheck={false}
            placeholder={
              '<style>\n  .card { padding: 24px; border-radius: 16px; }\n</style>\n<div class="card">Hello</div>'
            }
            value={html}
            onInput={(e) => setHtml(e.currentTarget.value)}
          />
        </Section>
        <Section title="Width">
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
        </Section>
        <Section>
          <Message>
            Scripts don't run here. Capture pages that rely on JavaScript with the extension.
          </Message>
        </Section>
      </main>
      <footer class="dock">
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!html.trim()}
          onClick={() => onRender(html, Math.min(3840, Math.max(240, Number(width) || 1440)))}
        >
          Render
        </Button>
      </footer>
    </>
  )
}
