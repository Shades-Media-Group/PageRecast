/** The Web, Extension, MCP and API tabs: ways in that start outside this window. */
import { useState } from 'preact/hooks'
import { captureLink, webUrl } from '@pagerecast/capture'
import {
  Button,
  Icon,
  Message,
  REPO_URL,
  Section,
  Segmented,
  Toggle,
  type IconName,
} from '@pagerecast/ui'
import type { WebCapture } from '../shared/messages'
import { cleanCode, type AgentState } from './agent'

export const CHROME_URL =
  'https://chromewebstore.google.com/detail/iidlcnlnejbmdihmbfiojpikhgaggkel'
const GUIDES = `${REPO_URL}/blob/main/docs/guides`

/**
 * Figma's plugin iframe is not granted the async clipboard, so copying goes
 * through a selected, off-screen textarea.
 */
export function copyText(text: string): boolean {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } finally {
    area.remove()
  }
}

/** A command or config to copy: its name and a Copy button, then the code. */
function Snippet({ title, code, aside }: { title: string; code: string; aside?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Section
      title={title}
      aside={
        <span class="snippet-aside">
          {aside && <span class="muted">{aside}</span>}
          <button
            type="button"
            class="text-button"
            aria-label={`Copy ${title}`}
            onClick={() => {
              if (!copyText(code)) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      }
    >
      <pre class="snippet">
        <code>{code}</code>
      </pre>
    </Section>
  )
}

function DocLink({
  label,
  href,
  open,
}: {
  label: string
  href: string
  open: (url: string) => void
}) {
  return (
    <a
      class="link"
      href={href}
      onClick={(e) => {
        e.preventDefault()
        open(href)
      }}
    >
      {label}
      <Icon name="external" size={16} />
    </a>
  )
}

const WIDTHS: { width: number; label: string; icon: IconName }[] = [
  { width: 1440, label: 'Desktop', icon: 'desktop' },
  { width: 1280, label: 'Laptop', icon: 'laptop' },
  { width: 768, label: 'Tablet', icon: 'tablet' },
  { width: 390, label: 'Mobile', icon: 'mobile' },
]
const THEMES = { light: 'Light', dark: 'Dark', both: 'Light and dark' } as const

const widthsLabel = (widths: number[]) =>
  widths.map((w) => `${WIDTHS.find((p) => p.width === w)?.label ?? 'Custom'} ${w}`).join(', ') ||
  'None'

export function WebTab({
  web,
  onChange,
  open,
  onExtension,
}: {
  web: WebCapture
  onChange: (web: WebCapture) => void
  open: (url: string) => void
  /** Shows the Extension tab. */
  onExtension: () => void
}) {
  const [input, setInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const url = webUrl(input)
  const invalid = input.trim() !== '' && !url
  const language = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(web.language) ? web.language : ''

  const capture = () => {
    if (!url || !web.widths.length) return
    open(captureLink({ url, widths: web.widths, theme: web.theme, language }))
    setSent(new URL(url).host)
  }
  const toggleWidth = (width: number) =>
    onChange({
      ...web,
      widths: web.widths.includes(width)
        ? web.widths.filter((w) => w !== width)
        : [...web.widths, width].sort((a, b) => b - a),
    })

  return (
    <>
      <section class="intro">
        <h1>Import a page by URL</h1>
        <p>
          The PageRecast extension opens the page in your browser, captures it and copies it. Then
          paste it here.
        </p>
      </section>
      <Section>
        <form
          class="url-form"
          onSubmit={(e) => {
            e.preventDefault()
            capture()
          }}
        >
          <div class="pr-field">
            <Icon name="globe" size={16} />
            <input
              class="pr-input"
              type="text"
              inputMode="url"
              spellcheck={false}
              autoComplete="off"
              aria-label="Page URL"
              aria-invalid={invalid}
              placeholder="https://example.com"
              value={input}
              onInput={(e) => {
                setInput(e.currentTarget.value)
                setSent(null)
              }}
            />
          </div>
          {invalid && <p class="hint hint--error">Enter a web address, such as example.com.</p>}
          <Button type="submit" variant="primary" block disabled={!url || !web.widths.length}>
            Capture in browser
          </Button>
        </form>
        {sent && (
          <div class="sent">
            <Message tone="success">
              Opened {sent} in your browser. Press <strong>Capture</strong> there, then paste here
              with ⌘V.
            </Message>
          </div>
        )}
      </Section>
      <Section
        title="Capture"
        aside={
          <button type="button" class="text-button" onClick={() => setEditing(!editing)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        }
      >
        {editing ? (
          <>
            <div class="width-list" role="group" aria-label="Widths">
              {WIDTHS.map((p) => (
                <label class="width-option">
                  <Icon name={p.icon} size={16} />
                  <span>{p.label}</span>
                  <span class="num muted">{p.width}</span>
                  <input
                    class="pr-check"
                    type="checkbox"
                    checked={web.widths.includes(p.width)}
                    onChange={() => toggleWidth(p.width)}
                  />
                </label>
              ))}
            </div>
            <div class="pr-prop">
              <span>Theme</span>
              <Segmented
                label="Theme"
                value={web.theme}
                onChange={(theme) => onChange({ ...web, theme })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            </div>
            <div class="pr-prop">
              <label for="web-language">Language</label>
              <input
                id="web-language"
                class="pr-input"
                spellcheck={false}
                placeholder="Browser default, or de-DE"
                value={web.language}
                onInput={(e) => onChange({ ...web, language: e.currentTarget.value.trim() })}
              />
            </div>
            {web.language && !language && (
              <p class="hint hint--prop hint--error">Use a language tag such as de-DE or fr.</p>
            )}
          </>
        ) : (
          <dl class="pr-props">
            <div class="pr-prop">
              <dt>Widths</dt>
              <dd class="num truncate">{widthsLabel(web.widths)}</dd>
            </div>
            <div class="pr-prop">
              <dt>Theme</dt>
              <dd>{THEMES[web.theme]}</dd>
            </div>
            <div class="pr-prop">
              <dt>Language</dt>
              <dd>{language || 'Browser default'}</dd>
            </div>
          </dl>
        )}
      </Section>
      <Section title="Without the extension">
        {/*
         * TODO(renderer): a hosted render endpoint (Cloudflare) would capture public URLs
         * without the extension. When it exists, call it here and keep the extension path
         * for pages behind a login. Until then this text is the honest answer.
         */}
        <p class="body">
          URL import needs the extension for now. Without it, save the page in your browser as a web
          page or .mhtml file and open it in File.
        </p>
        <button type="button" class="text-button text-button--gap" onClick={onExtension}>
          Get the extension
        </button>
      </Section>
    </>
  )
}

export function ExtensionTab({ open }: { open: (url: string) => void }) {
  return (
    <>
      <section class="intro">
        <h1>The PageRecast extension</h1>
        <p>
          Captures what your browser shows, then hands it to this window. Free, with nothing sent
          anywhere.
        </p>
        <Button icon="external" onClick={() => open(CHROME_URL)}>
          Add to Chrome
        </Button>
        <p class="hint">Also works in Edge, Brave and Arc. The Firefox add-on is not listed yet.</p>
      </section>
      <Section title="It captures">
        <ul class="facts">
          <li>Pages behind a login, staging and localhost</li>
          <li>Several widths and both themes in one go</li>
          <li>A whole page, the visible area or one element</li>
          <li>A list of URLs, one after another</li>
        </ul>
      </Section>
      <Section title="Paste a capture">
        <div class="paste">
          <div class="keys" aria-hidden="true">
            <span class="pr-keycap">⌘</span>
            <span class="pr-keycap">V</span>
          </div>
          <p class="body">
            Press Copy for Figma in the extension, then paste anywhere in this window, on any tab.
          </p>
        </div>
      </Section>
    </>
  )
}

const MCP_SNIPPETS: { title: string; aside?: string; code: string }[] = [
  {
    title: 'Claude Code',
    aside: 'Terminal',
    code: 'claude mcp add pagerecast -- npx -y pagerecast-mcp',
  },
  {
    title: 'Claude Desktop',
    aside: 'claude_desktop_config.json',
    code: `{
  "mcpServers": {
    "pagerecast": {
      "command": "npx",
      "args": ["-y", "pagerecast-mcp"]
    }
  }
}`,
  },
  {
    title: 'Codex CLI',
    aside: '~/.codex/config.toml',
    code: `[mcp_servers.pagerecast]
command = "npx"
args = ["-y", "pagerecast-mcp"]
tool_timeout_sec = 180`,
  },
  {
    title: 'Cursor',
    aside: '.cursor/mcp.json',
    code: `{
  "mcpServers": {
    "pagerecast": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "pagerecast-mcp"]
    }
  }
}`,
  },
]

function agentHint(state: AgentState): string {
  switch (state.kind) {
    case 'off':
      return 'Off. Agents can still save captures for you to drop here.'
    case 'searching':
      return 'No agent on this computer yet. Looking every few seconds.'
    case 'pairing':
      return 'An agent is running. Pair with the code it showed you.'
    case 'connected':
      return state.last
        ? `Paired. Imported ${state.last}; waiting for the next capture.`
        : 'Paired. Captures the agent sends import here.'
  }
}

export function McpTab({
  listening,
  state,
  onListen,
  onPair,
  open,
}: {
  listening: boolean
  state: AgentState
  onListen: (on: boolean) => void
  /** Checks a code with the bridge; resolves to an error message, or null when it works. */
  onPair: (code: string) => Promise<string | null>
  open: (url: string) => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const pair = async () => {
    setChecking(true)
    setError(await onPair(cleanCode(code)))
    setChecking(false)
  }
  return (
    <>
      <section class="intro">
        <h1>Import from AI agents</h1>
        <p>
          Claude Code, Codex, Cursor and other agents can capture pages with PageRecast on this
          computer and send them here. Nothing goes through a server.
        </p>
      </section>
      <Section>
        <Toggle
          label="Listen for agent imports"
          hint={agentHint(listening ? state : { kind: 'off' })}
          checked={listening}
          onChange={onListen}
        />
        {listening && state.kind === 'pairing' && (
          <form
            class="pair"
            onSubmit={(e) => {
              e.preventDefault()
              void pair()
            }}
          >
            <label for="pairing-code">Code</label>
            <input
              id="pairing-code"
              aria-label="Pairing code"
              class="pr-input num"
              spellcheck={false}
              autoComplete="off"
              placeholder="7F0Y-5AC6-3PXH-R78Q"
              value={code}
              onInput={(e) => {
                setCode(e.currentTarget.value)
                setError(null)
              }}
            />
            <Button type="submit" disabled={cleanCode(code).length < 19 || checking}>
              Pair
            </Button>
            {(error ?? state.error) && <p class="hint hint--error">{error ?? state.error}</p>}
          </form>
        )}
      </Section>
      {MCP_SNIPPETS.map((s) => (
        <Snippet {...s} />
      ))}
      <Section>
        <p class="body">
          Ask the agent to capture a page and send it to Figma. It shows a pairing code the first
          time.
        </p>
        <DocLink label="Agent setup guide" href={`${GUIDES}/mcp.md`} open={open} />
      </Section>
    </>
  )
}

export function ApiTab({ open }: { open: (url: string) => void }) {
  return (
    <>
      <section class="intro">
        <h1>Capture from code</h1>
        <p>
          The pagerecast package captures pages in headless Chromium on your machine, for scripts,
          CI and design-token builds. Drop its .recast files here.
        </p>
      </section>
      <Snippet title="Install" aside="Node 22" code="npm i pagerecast" />
      <Snippet
        title="Command line"
        code="npx pagerecast capture https://example.com --widths 1440,390 --theme both"
      />
      <Snippet
        title="JavaScript"
        code={`import { writeFile } from 'node:fs/promises'
import { capture, encode } from 'pagerecast'

const file = await capture('https://example.com', {
  widths: [1440, 390],
  theme: 'both',
})
await writeFile('example.recast', await encode(file))`}
      />
      <Snippet title="Design tokens" code="npx pagerecast tokens example.recast --format md" />
      <Section>
        <div class="doc-links">
          <DocLink label="API guide" href={`${GUIDES}/api.md`} open={open} />
          <DocLink label="Command line guide" href={`${GUIDES}/cli.md`} open={open} />
        </div>
      </Section>
    </>
  )
}
