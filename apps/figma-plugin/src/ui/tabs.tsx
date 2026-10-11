/** The Web, Extension, MCP and API tabs: ways in that start outside this window. */
import { useState } from 'preact/hooks'
import { captureLink, webUrl } from '@pagerecast/capture'
import { deviceName, rich, t, type MessageKey } from '@pagerecast/i18n'
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
            aria-label={t('snippet.copy', { title })}
            onClick={() => {
              if (!copyText(code)) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
          >
            {copied ? t('common.copied') : t('common.copy')}
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

const WIDTHS: { width: number; icon: IconName }[] = [
  { width: 1440, icon: 'desktop' },
  { width: 1280, icon: 'laptop' },
  { width: 768, icon: 'tablet' },
  { width: 390, icon: 'mobile' },
]
const THEMES = { light: 'theme.light', dark: 'theme.dark', both: 'theme.lightAndDark' } as const

const widthsLabel = (widths: number[]) =>
  widths
    .map((w) => `${WIDTHS.some((p) => p.width === w) ? deviceName(w) : t('device.custom')} ${w}`)
    .join(', ') || t('common.none')

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
        <h1>{t('web.title')}</h1>
        <p>{t('web.body')}</p>
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
              aria-label={t('web.url')}
              aria-invalid={invalid}
              placeholder="https://example.com"
              value={input}
              onInput={(e) => {
                setInput(e.currentTarget.value)
                setSent(null)
              }}
            />
          </div>
          {invalid && <p class="hint hint--error">{t('web.invalid')}</p>}
          <Button type="submit" variant="primary" block disabled={!url || !web.widths.length}>
            {t('web.capture')}
          </Button>
        </form>
        {sent && (
          <div class="sent">
            <Message tone="success">
              {rich('web.sent', { host: sent, button: <strong>{t('web.captureButton')}</strong> })}
            </Message>
          </div>
        )}
      </Section>
      <Section
        title={t('common.capture')}
        aside={
          <button type="button" class="text-button" onClick={() => setEditing(!editing)}>
            {editing ? t('common.done') : t('common.edit')}
          </button>
        }
      >
        {editing ? (
          <>
            <div class="width-list" role="group" aria-label={t('common.widths')}>
              {WIDTHS.map((p) => (
                <label class="width-option">
                  <Icon name={p.icon} size={16} />
                  <span>{deviceName(p.width)}</span>
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
              <span>{t('common.theme')}</span>
              <Segmented
                label={t('common.theme')}
                value={web.theme}
                onChange={(theme) => onChange({ ...web, theme })}
                options={[
                  { value: 'light', label: t('theme.light') },
                  { value: 'dark', label: t('theme.dark') },
                  { value: 'both', label: t('theme.both') },
                ]}
              />
            </div>
            <div class="pr-prop">
              <label for="web-language">{t('language.page')}</label>
              <input
                id="web-language"
                class="pr-input"
                spellcheck={false}
                placeholder={t('web.languagePlaceholder')}
                value={web.language}
                onInput={(e) => onChange({ ...web, language: e.currentTarget.value.trim() })}
              />
            </div>
            {web.language && !language && (
              <p class="hint hint--prop hint--error">{t('web.languageInvalid')}</p>
            )}
          </>
        ) : (
          <dl class="pr-props">
            <div class="pr-prop">
              <dt>{t('common.widths')}</dt>
              <dd class="num truncate">{widthsLabel(web.widths)}</dd>
            </div>
            <div class="pr-prop">
              <dt>{t('common.theme')}</dt>
              <dd>{t(THEMES[web.theme])}</dd>
            </div>
            <div class="pr-prop">
              <dt>{t('language.page')}</dt>
              <dd>{language || t('web.browserDefault')}</dd>
            </div>
          </dl>
        )}
      </Section>
      <Section title={t('web.without')}>
        {/*
         * TODO(renderer): a hosted render endpoint (Cloudflare) would capture public URLs
         * without the extension. When it exists, call it here and keep the extension path
         * for pages behind a login. Until then this text is the honest answer.
         */}
        <p class="body">{t('web.withoutBody')}</p>
        <button type="button" class="text-button text-button--gap" onClick={onExtension}>
          {t('web.getExtension')}
        </button>
      </Section>
    </>
  )
}

export function ExtensionTab({ open }: { open: (url: string) => void }) {
  return (
    <>
      <section class="intro">
        <h1>{t('ext.title')}</h1>
        <p>{t('ext.body')}</p>
        <Button icon="external" onClick={() => open(CHROME_URL)}>
          {t('ext.add')}
        </Button>
        <p class="hint">{t('ext.browsers')}</p>
      </section>
      <Section title={t('ext.captures')}>
        <ul class="facts">
          <li>{t('ext.login')}</li>
          <li>{t('ext.widths')}</li>
          <li>{t('ext.scopes')}</li>
          <li>{t('ext.list')}</li>
        </ul>
      </Section>
      <Section title={t('ext.paste')}>
        <div class="paste">
          <div class="keys" aria-hidden="true">
            <span class="pr-keycap">⌘</span>
            <span class="pr-keycap">V</span>
          </div>
          <p class="body">{t('ext.pasteBody')}</p>
        </div>
      </Section>
    </>
  )
}

const MCP_SNIPPETS: { title: string; aside?: string | MessageKey; code: string }[] = [
  {
    title: 'Claude Code',
    aside: 'mcp.terminal',
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
      return t('mcp.off')
    case 'searching':
      return t('mcp.searching')
    case 'pairing':
      return t('mcp.pairing')
    case 'connected':
      return state.last ? t('mcp.last', { name: state.last }) : t('mcp.connected')
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
        <h1>{t('mcp.title')}</h1>
        <p>{t('mcp.body')}</p>
      </section>
      <Section>
        <Toggle
          label={t('mcp.listen')}
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
            <label for="pairing-code">{t('mcp.code')}</label>
            <input
              id="pairing-code"
              aria-label={t('mcp.pairingCode')}
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
              {t('mcp.pair')}
            </Button>
            {(error ?? state.error) && <p class="hint hint--error">{error ?? state.error}</p>}
          </form>
        )}
      </Section>
      {MCP_SNIPPETS.map((s) => (
        <Snippet {...s} aside={s.aside === 'mcp.terminal' ? t(s.aside) : s.aside} />
      ))}
      <Section>
        <p class="body">{t('mcp.ask')}</p>
        <DocLink label={t('mcp.guide')} href={`${GUIDES}/mcp.md`} open={open} />
      </Section>
    </>
  )
}

export function ApiTab({ open }: { open: (url: string) => void }) {
  return (
    <>
      <section class="intro">
        <h1>{t('api.title')}</h1>
        <p>{t('api.body')}</p>
      </section>
      <Snippet title={t('api.install')} aside="Node 22" code="npm i pagerecast" />
      <Snippet
        title={t('api.cli')}
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
      <Snippet title={t('api.tokens')} code="npx pagerecast tokens example.recast --format md" />
      <Section>
        <div class="doc-links">
          <DocLink label={t('api.guide')} href={`${GUIDES}/api.md`} open={open} />
          <DocLink label={t('api.cliGuide')} href={`${GUIDES}/cli.md`} open={open} />
        </div>
      </Section>
    </>
  )
}
