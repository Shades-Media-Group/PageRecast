import { useEffect, useRef, useState } from 'preact/hooks'
import type { Capture, RecastFile } from '@pagerecast/scene'
import { SceneError } from '@pagerecast/scene'
import {
  Button,
  CREDIT,
  formatBytes,
  Icon,
  IconButton,
  Logomark,
  Notice,
  Progress,
  REPO_URL,
  Segmented,
  Switch,
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

type Stage =
  | { kind: 'empty' }
  | { kind: 'reading'; message: string }
  | { kind: 'ready'; file: RecastFile; selected: Set<string>; bytes: number }
  | { kind: 'importing'; message: string; progress: number }
  | { kind: 'done'; report: ImportReport }
  | { kind: 'error'; message: string }

const send = (message: UiToMain) => parent.postMessage({ pluginMessage: message }, '*')
const openUrl = (url: string) => send({ type: 'open-url', url })
const EXTENSION_URL = `${REPO_URL}#install-the-chrome-extension`
const DOCS_URL = `${REPO_URL}/blob/main/docs/guides/getting-started.md`

const deviceIcon = (width: number): IconName =>
  width >= 1000 ? 'desktop' : width >= 600 ? 'tablet' : 'mobile'

function errorMessage(error: unknown): string {
  if (error instanceof SceneError) return error.message
  return 'Something went wrong while reading that capture. Copy it again and paste it here.'
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(iso).toLocaleDateString()
}

export function App() {
  const [tab, setTab] = useState<'capture' | 'code'>('capture')
  const [stage, setStage] = useState<Stage>({ kind: 'empty' })
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const load = async (read: () => Promise<RecastFile>, size: number) => {
    setStage({ kind: 'reading', message: 'Reading the capture…' })
    try {
      const file = await read()
      setTab('capture')
      setStage({
        kind: 'ready',
        file,
        selected: new Set(file.captures.map((c) => c.id)),
        bytes: size,
      })
    } catch (error) {
      setStage({ kind: 'error', message: errorMessage(error) })
    }
  }

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage?: MainToUi }>) => {
      const message = event.data.pluginMessage
      if (!message) return
      if (message.type === 'ready') setOptions(message.options)
      if (message.type === 'progress') {
        const label =
          message.phase === 'fonts'
            ? 'Loading fonts…'
            : message.phase === 'styles'
              ? 'Creating variables and styles…'
              : `Building layers · ${message.done.toLocaleString()} of ${message.total.toLocaleString()}`
        const progress =
          message.phase === 'fonts'
            ? 0.3
            : message.phase === 'styles'
              ? 0.95
              : 0.3 + 0.65 * (message.done / Math.max(message.total, 1))
        setStage({ kind: 'importing', message: label, progress })
      }
      if (message.type === 'done') {
        setStage({ kind: 'done', report: message.report })
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
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const updateOptions = (patch: Partial<ImportOptions>) => {
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
    setStage({ kind: 'importing', message: 'Preparing images…', progress: 0.05 })
    const { images, tiles, failed } = await prepareImages(file, (done, total) =>
      setStage({
        kind: 'importing',
        message: `Preparing images · ${done} of ${total}`,
        progress: 0.05 + 0.2 * (done / Math.max(total, 1)),
      }),
    )
    if (failed.length) console.warn('PageRecast: images not loaded', failed)
    send({ type: 'import', file, images, tiles, options })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer?.files[0]
    if (file) void load(() => readFile(file), file.size)
  }

  return (
    <div
      class={`app ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <header class="bar">
        <div class="brand">
          <Logomark size={20} />
          <span>PageRecast</span>
        </div>
        <IconButton icon="docs" label="Documentation" onClick={() => openUrl(DOCS_URL)} />
      </header>

      <div class="tabs">
        <Segmented
          label="Import source"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'capture', label: 'Capture', icon: 'paste' },
            { value: 'code', label: 'HTML code', icon: 'code' },
          ]}
        />
      </div>

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
          onImport={(html, width) => load(() => renderHtml(html, width, 'HTML code'), html.length)}
        />
      ) : (
        <main class="body">
          {stage.kind === 'empty' && <Empty onChoose={() => fileInput.current?.click()} />}
          {stage.kind === 'reading' && <Working message={stage.message} progress={0.1} />}
          {stage.kind === 'importing' && (
            <Working message={stage.message} progress={stage.progress} />
          )}
          {stage.kind === 'error' && (
            <div class="stack">
              <Notice tone="error">{stage.message}</Notice>
              <Button icon="refresh" onClick={() => setStage({ kind: 'empty' })}>
                Start over
              </Button>
            </div>
          )}
          {stage.kind === 'ready' && (
            <Ready
              stage={stage}
              options={options}
              onOptions={updateOptions}
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
      )}

      {tab === 'capture' && stage.kind === 'ready' && (
        <footer class="actions">
          <IconButton
            icon="close"
            label="Clear capture"
            onClick={() => setStage({ kind: 'empty' })}
          />
          <Button
            variant="primary"
            size="lg"
            block
            icon="layers"
            disabled={stage.selected.size === 0}
            onClick={startImport}
          >
            Import into Figma
          </Button>
        </footer>
      )}
      {tab === 'capture' && stage.kind === 'done' && (
        <footer class="actions">
          <Button size="lg" block icon="paste" onClick={() => setStage({ kind: 'empty' })}>
            Import another
          </Button>
        </footer>
      )}

      {dragging && (
        <div class="drop-overlay" aria-hidden="true">
          <Icon name="upload" size={24} />
          <span>Drop to import</span>
        </div>
      )}
    </div>
  )
}

function Empty({ onChoose }: { onChoose: () => void }) {
  return (
    <div class="stack">
      <section class="paste-target">
        <div class="paste-icon">
          <Icon name="paste" size={22} />
        </div>
        <h1>Paste a capture</h1>
        <p>
          Copy a page with the PageRecast extension, then press <kbd>⌘V</kbd> here. You can also
          drop a <code>.recast</code> or <code>.html</code> file.
        </p>
        <Button icon="file" onClick={onChoose}>
          Choose file
        </Button>
      </section>

      <section>
        <h2 class="pr-section-title">How to capture a page</h2>
        <ol class="steps">
          <li>
            <Icon name="download" size={18} />
            <span>
              Install the{' '}
              <a
                href={EXTENSION_URL}
                onClick={(e) => {
                  e.preventDefault()
                  openUrl(EXTENSION_URL)
                }}
              >
                PageRecast Chrome extension
              </a>
              .
            </span>
          </li>
          <li>
            <Icon name="lock" size={18} />
            <span>Open any page, including ones behind a login, staging or localhost.</span>
          </li>
          <li>
            <Icon name="capture" size={18} />
            <span>Choose viewports and click Capture, then Copy.</span>
          </li>
        </ol>
      </section>

      <p class="credit">
        Free and open source. Built by {CREDIT.name} |{' '}
        <a
          href={CREDIT.url}
          onClick={(e) => {
            e.preventDefault()
            openUrl(CREDIT.url)
          }}
        >
          {CREDIT.company}
        </a>
      </p>
    </div>
  )
}

function Working({ message, progress }: { message: string; progress: number }) {
  return (
    <div class="working" aria-live="polite">
      <div class="working-mark">
        <Logomark size={44} />
      </div>
      <p>{message}</p>
      <Progress value={progress} />
    </div>
  )
}

function CaptureRow({
  capture,
  checked,
  onToggle,
}: {
  capture: Capture
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label class="capture-row">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <Icon name={deviceIcon(capture.viewport.width)} size={18} />
      <span class="capture-label">{capture.label}</span>
      <span class="data">
        {Math.round(capture.width)} × {Math.round(capture.height)}
      </span>
    </label>
  )
}

function Ready({
  stage,
  options,
  onOptions,
  onToggle,
}: {
  stage: Extract<Stage, { kind: 'ready' }>
  options: ImportOptions
  onOptions: (patch: Partial<ImportOptions>) => void
  onToggle: (id: string) => void
}) {
  const { file } = stage
  const host = (() => {
    try {
      return new URL(file.source.url).host
    } catch {
      return 'Local HTML'
    }
  })()
  const themes = new Set(file.captures.map((c) => c.theme))
  return (
    <div class="stack">
      <section class="source">
        <div class="source-title">{file.source.title || host}</div>
        <div class="source-meta">
          <span class="truncate">{host}</span>
          <span>
            {timeAgo(file.source.capturedAt)} · <span class="data">{formatBytes(stage.bytes)}</span>
          </span>
        </div>
      </section>

      <section>
        <h2 class="pr-section-title">
          Captures{' '}
          <span>
            {stage.selected.size} of {file.captures.length} selected
          </span>
        </h2>
        <div class="list">
          {file.captures.map((capture) => (
            <CaptureRow
              capture={capture}
              checked={stage.selected.has(capture.id)}
              onToggle={() => onToggle(capture.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 class="pr-section-title">Import options</h2>
        <div class="list list--padded">
          <Switch
            icon="autolayout"
            label="Auto Layout"
            hint="Turns flex rows and columns into Auto Layout wherever the result matches the page."
            checked={options.autoLayout}
            onChange={(autoLayout) => onOptions({ autoLayout })}
          />
          <Switch
            icon="variable"
            label="Colour variables"
            hint={
              themes.size > 1
                ? 'Repeated colours become variables with Light and Dark modes.'
                : 'Repeated colours become variables. Capture light and dark to get both modes.'
            }
            checked={options.variables}
            onChange={(variables) => onOptions({ variables })}
          />
          <Switch
            icon="type"
            label="Text styles"
            hint="Repeated type becomes local text styles."
            checked={options.textStyles}
            onChange={(textStyles) => onOptions({ textStyles })}
          />
          <Switch
            icon="screenshot"
            label="Screenshot reference"
            hint="A locked screenshot beside each frame, for side-by-side checks."
            checked={options.screenshot}
            onChange={(screenshot) => onOptions({ screenshot })}
          />
        </div>
      </section>
    </div>
  )
}

function Done({ report }: { report: ImportReport }) {
  const rows: [IconName, string, number][] = [
    ['layers', 'Frames', report.frames],
    ['font', 'Text layers', report.texts],
    ['image', 'Images', report.images],
    ['vector', 'Vectors', report.vectors],
    ['autolayout', 'Auto Layout frames', report.autoLayouts],
    ['variable', 'Colour variables', report.variables],
    ['type', 'Text styles', report.textStyles],
  ]
  if (report.rasters) rows.push(['screenshot', 'Snapshots (canvas, video, embeds)', report.rasters])
  return (
    <div class="stack">
      <Notice tone="success">
        <strong>Imported in {(report.durationMs / 1000).toFixed(1)} s.</strong> The result is
        selected on the canvas.
      </Notice>
      <section>
        <h2 class="pr-section-title">What was created</h2>
        <dl class="list stats">
          {rows.map(([icon, label, value]) => (
            <div>
              <dt>
                <Icon name={icon} size={16} />
                {label}
              </dt>
              <dd class="data">{value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </section>
      {report.substitutions.length > 0 && (
        <section>
          <h2 class="pr-section-title">
            Fonts replaced <span>{report.substitutions.length}</span>
          </h2>
          <div class="list">
            {report.substitutions.map((s) => (
              <div class="sub-row">
                <span class="truncate">{s.requested}</span>
                <Icon name="arrowRight" size={14} />
                <span class="truncate">{s.used}</span>
                <span class="data">{s.count}×</span>
              </div>
            ))}
          </div>
          <p class="hint">Install the missing fonts and import again for an exact match.</p>
        </section>
      )}
      {report.warnings.length > 0 && (
        <details class="warnings">
          <summary>
            <Icon name="warning" size={16} />
            {report.warnings.length} note{report.warnings.length === 1 ? '' : 's'} from the import
          </summary>
          <ul>
            {report.warnings.slice(0, 50).map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

const WIDTHS = [
  { value: '1440', label: 'Desktop', icon: 'desktop' as IconName },
  { value: '768', label: 'Tablet', icon: 'tablet' as IconName },
  { value: '390', label: 'Mobile', icon: 'mobile' as IconName },
]

function CodeTab({ onImport }: { onImport: (html: string, width: number) => void }) {
  const [html, setHtml] = useState('')
  const [width, setWidth] = useState('1440')
  return (
    <>
      <main class="body">
        <div class="stack">
          <section>
            <h2 class="pr-section-title">
              HTML and CSS <span>Rendered here, nothing is uploaded</span>
            </h2>
            <textarea
              class="pr-textarea code-input"
              spellcheck={false}
              placeholder={
                '<style>\n  .card { padding: 24px; border-radius: 16px; }\n</style>\n<div class="card">Hello</div>'
              }
              value={html}
              onInput={(e) => setHtml(e.currentTarget.value)}
            />
          </section>
          <section>
            <h2 class="pr-section-title">Width</h2>
            <div class="width-row">
              <Segmented label="Width preset" value={width} onChange={setWidth} options={WIDTHS} />
              <input
                class="pr-input data width-input"
                type="number"
                min={240}
                max={3840}
                aria-label="Custom width in pixels"
                value={width}
                onInput={(e) => setWidth(e.currentTarget.value)}
              />
            </div>
          </section>
          <Notice>
            Scripts don't run here. For pages built with JavaScript, capture them with the
            extension.
          </Notice>
        </div>
      </main>
      <footer class="actions">
        <Button
          variant="primary"
          size="lg"
          block
          icon="code"
          disabled={!html.trim()}
          onClick={() => onImport(html, Math.min(3840, Math.max(240, Number(width) || 1440)))}
        >
          Render and review
        </Button>
      </footer>
    </>
  )
}
