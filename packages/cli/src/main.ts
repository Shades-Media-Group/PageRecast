import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import {
  capture as captureUrl,
  decode,
  encode,
  info as describe,
  OptionError,
  recastFileName,
  tokens as toTokens,
  type CaptureOptions,
  type RecastFile,
  type TokenFormat,
} from './api'

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
  --browser <path>         Chrome or Chromium to run (default: $PAGERECAST_BROWSER,
                           then Playwright's Chromium, then Chrome)

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

const log = (line: string) => process.stderr.write(`${line}\n`)

function settings(defaultTheme: 'light' | 'both'): CaptureOptions {
  return {
    widths: values.widths.split(',').map((w) => Number(w.trim())),
    theme: (values.theme ?? defaultTheme) as CaptureOptions['theme'],
    scope: values.scope as CaptureOptions['scope'],
    hide: values.hide ? [values.hide] : [],
    waitMs: Number(values.wait),
    maxHeight: Number(values['max-height']),
    language: values.language,
    preload: values.preload,
    hideOverlays: values['hide-overlays'],
    screenshot: values.screenshot,
    onProgress: log,
    ...(values.browser ? { browser: values.browser } : {}),
  }
}

async function save(path: string, data: Uint8Array | string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

async function readRecast(path: string): Promise<RecastFile> {
  return decode(new Uint8Array(await readFile(path)))
}

async function capture(input: string): Promise<void> {
  const file = await captureUrl(input, settings('light'))
  const bytes = await encode(file)
  await decode(bytes) // Refuse to write anything the plugin would not open.
  const out = values.out ?? recastFileName(file.source.url)
  await save(out, bytes)
  log(`Saved ${out} (${file.captures.length} captures, ${(bytes.length / 1024).toFixed(0)} KB)`)
}

async function tokens(input: string): Promise<void> {
  const format = values.format
  if (!['md', 'css', 'w3c'].includes(format)) throw new UsageError('--format is w3c, css or md.')
  const file =
    existsSync(input) && !/\.html?$/i.test(input)
      ? await readRecast(input)
      : await captureUrl(input, settings('both'))
  const output = toTokens(file, format as TokenFormat)
  if (values.out) {
    await save(values.out, output)
    log(`Saved ${values.out}`)
  } else process.stdout.write(output)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

async function info(path: string): Promise<void> {
  const file = await readRecast(path)
  const { title, url, capturedAt, generator, captures, assets } = describe(file)
  const rows = captures.map((c) =>
    [
      c.label,
      `${c.width} × ${c.height}`,
      c.scope,
      c.layers,
      c.frames,
      c.text,
      c.images,
      c.svg,
      c.raster,
      c.screenshot ? 'yes' : 'no',
    ].map(String),
  )
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

  const { size } = await stat(path)
  console.log(
    [
      title || url,
      url,
      `Captured ${capturedAt.replace('T', ' ').slice(0, 16)} UTC by PageRecast ${generator.version} (${generator.surface})`,
      '',
      line(header),
      ...rows.map(line),
      '',
      `Assets: ${plural(assets.embeddedImages, 'embedded image')}, ${plural(assets.linkedImages, 'linked image')}, ${assets.svg} SVG`,
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
  if (error instanceof UsageError || error instanceof OptionError) {
    console.error(`${error.message} Run pagerecast --help for usage.`)
    process.exit(2)
  }
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
