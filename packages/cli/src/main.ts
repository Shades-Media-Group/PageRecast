import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { decode, encodeFile, type RecastFile, type SceneNode, type Theme } from '@pagerecast/scene'
import { extractTokens, toCssVariables, toDesignMd, toW3CTokens } from '@pagerecast/tokens'
import { captureUrl, type CaptureSettings } from './capture'

declare const __VERSION__: string

const HELP = `PageRecast ${__VERSION__}: capture web pages for Figma and extract their design tokens.
Everything runs on this machine; nothing is sent anywhere.

Usage
  pagerecast capture <url> [options]       Write a .recast file the Figma plugin imports
  pagerecast tokens <file.recast|url> [--format w3c|css|md] [--out file]
  pagerecast info <file.recast>            List the captures, frames and layers in a file

Capture options
  --widths 1440,390        Viewport widths, 240 to 3840 (default 1440)
  --theme light|dark|both  Colour scheme to capture (default light; tokens from a URL: both)
  --scope page|viewport    Whole page or the first screen (default page)
  --language de-DE         Capture the page in this browser language
  --out file.recast        Output path (default: named after the page)
  --no-preload             Skip scrolling through the page to load lazy content
  --no-hide-overlays       Keep cookie and consent banners (hidden by default)
  --no-screenshot          Leave out the screenshot reference
  --hide ".chat, .promo"   Leave out elements matching these CSS selectors
  --wait 2000              Wait this many milliseconds at each width before reading the page
  --max-height 10000       Cut full-page captures off at this height in pixels
  --browser <path>         Chrome or Chromium to run (default: Playwright's Chromium, then Chrome)

  -h, --help               Show this help
  -v, --version            Show the version
`

class UsageError extends Error {}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      allowNegative: true,
      options: {
        widths: { type: 'string', default: '1440' },
        theme: { type: 'string' },
        scope: { type: 'string', default: 'page' },
        language: { type: 'string', default: '' },
        out: { type: 'string', short: 'o' },
        format: { type: 'string', short: 'f', default: 'md' },
        preload: { type: 'boolean', default: true },
        'hide-overlays': { type: 'boolean', default: true },
        screenshot: { type: 'boolean', default: true },
        browser: { type: 'string' },
        hide: { type: 'string', default: '' },
        wait: { type: 'string', default: '0' },
        'max-height': { type: 'string', default: '0' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    })
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${HELP}`)
    process.exit(2)
  }
})()

const THEMES: Record<string, Theme[]> = {
  light: ['light'],
  dark: ['dark'],
  both: ['light', 'dark'],
}

const log = (line: string) => process.stderr.write(`${line}\n`)

function settings(defaultTheme: 'light' | 'both'): CaptureSettings {
  const widths = values.widths.split(',').map((w) => Number(w.trim()))
  if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840))
    throw new UsageError('--widths takes whole numbers from 240 to 3840, such as 1440,390.')
  const theme = values.theme ?? defaultTheme
  const themes = THEMES[theme]
  if (!themes) throw new UsageError('--theme is light, dark or both.')
  if (values.scope !== 'page' && values.scope !== 'viewport')
    throw new UsageError('--scope is page or viewport.')
  const delay = Number(values.wait)
  if (!Number.isInteger(delay) || delay < 0 || delay > 60_000)
    throw new UsageError('--wait takes milliseconds from 0 to 60000, such as 2000.')
  const maxHeight = Number(values['max-height'])
  if (!Number.isInteger(maxHeight) || maxHeight < 0)
    throw new UsageError('--max-height takes a whole number of pixels, such as 10000.')
  return {
    hide: values.hide,
    delay,
    maxHeight,
    widths: [...new Set(widths)],
    themes,
    scope: values.scope,
    language: values.language,
    preload: values.preload,
    hideOverlays: values['hide-overlays'],
    screenshot: values.screenshot,
    ...(values.browser ? { browser: values.browser } : {}),
  }
}

/** Accepts http(s) and file URLs, bare hosts, and paths to local HTML files. */
function toUrl(input: string): string {
  if (/^(https?|file):/i.test(input)) return input
  if (existsSync(input)) return pathToFileURL(resolve(input)).href
  return `https://${input}`
}

function defaultName(url: string): string {
  const parsed = new URL(url)
  const name =
    parsed.protocol === 'file:'
      ? basename(parsed.pathname, extname(parsed.pathname))
      : parsed.hostname.replace(/^www\./, '')
  return `${name || 'capture'}.recast`
}

async function save(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

async function readRecast(path: string): Promise<RecastFile> {
  return decode(new Uint8Array(await readFile(path)))
}

async function capture(input: string): Promise<void> {
  const url = toUrl(input)
  const file = await captureUrl(url, settings('light'), log)
  const bytes = await encodeFile(file)
  await decode(bytes) // Refuse to write anything the plugin would not open.
  const out = values.out ?? defaultName(file.source.url)
  await save(out, bytes)
  log(`Saved ${out} (${file.captures.length} captures, ${(bytes.length / 1024).toFixed(0)} KB)`)
}

async function tokens(input: string): Promise<void> {
  const file =
    existsSync(input) && !/\.html?$/i.test(input)
      ? await readRecast(input)
      : await captureUrl(toUrl(input), settings('both'), log)
  const tokens = extractTokens(file)
  const format = values.format
  const output =
    format === 'w3c'
      ? `${JSON.stringify(toW3CTokens(tokens, file.source), null, 2)}\n`
      : format === 'css'
        ? toCssVariables(tokens, file.source)
        : format === 'md'
          ? toDesignMd(tokens, file.source)
          : null
  if (output === null) throw new UsageError('--format is w3c, css or md.')
  if (values.out) {
    await save(values.out, output)
    log(`Saved ${values.out}`)
  } else process.stdout.write(output)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function count(node: SceneNode, totals: Record<string, number>) {
  totals[node.type] = (totals[node.type] ?? 0) + 1
  if (node.type === 'frame') for (const child of node.children) count(child, totals)
}

async function info(path: string): Promise<void> {
  const file = await readRecast(path)
  const { source, generator } = file
  const rows = file.captures.map((c) => {
    const totals: Record<string, number> = {}
    count(c.root, totals)
    const layers = Object.values(totals).reduce((a, b) => a + b, 0)
    return [
      c.label,
      `${c.width} × ${c.height}`,
      c.scope,
      layers,
      totals.frame ?? 0,
      totals.text ?? 0,
      totals.image ?? 0,
      totals.svg ?? 0,
      totals.raster ?? 0,
      c.screenshot ? 'yes' : 'no',
    ].map(String)
  })
  const header = [
    'Capture',
    'Size',
    'Scope',
    'Layers',
    'Frames',
    'Text',
    'Images',
    'SVG',
    'Raster',
    'Screenshot',
  ]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  // Text columns align left, numbers right.
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => (i < 3 || i === 9 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)))
      .join('  ')
      .trimEnd()

  const assets = Object.values(file.assets)
  const embedded = assets.filter((a) => a.kind === 'image' && a.data).length
  const linked = assets.filter((a) => a.kind === 'image' && !a.data).length
  const svgs = assets.filter((a) => a.kind === 'svg').length
  const { size } = await stat(path)
  console.log(
    [
      source.title || source.url,
      source.url,
      `Captured ${source.capturedAt.replace('T', ' ').slice(0, 16)} UTC by PageRecast ${generator.version} (${generator.surface})`,
      '',
      line(header),
      ...rows.map(line),
      '',
      `Assets: ${plural(embedded, 'embedded image')}, ${plural(linked, 'linked image')}, ${svgs} SVG`,
      `File: ${(size / 1024).toFixed(0)} KB`,
    ].join('\n'),
  )
}

async function main() {
  if (values.version) return console.log(__VERSION__)
  const [command, input] = positionals
  if (values.help || !command) return console.log(HELP)
  const run = { capture, tokens, info }[command]
  if (!run) throw new UsageError(`Unknown command “${command}”.`)
  if (!input)
    throw new UsageError(`pagerecast ${command} needs a ${command === 'capture' ? 'URL' : 'file'}.`)
  await run(input)
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message} Run pagerecast --help for usage.`)
    process.exit(2)
  }
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
