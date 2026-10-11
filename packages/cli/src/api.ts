/**
 * The programmatic API of the `pagerecast` package: what the command line and
 * the MCP server run. Everything happens on this machine.
 *
 * Exported signatures carry explicit types: the build turns this file into
 * `dist/index.d.ts` without a full type-check (isolated declarations).
 */
import { existsSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  decode as decodeScene,
  encodeFile,
  type RecastFile,
  type SceneNode,
  type Theme,
} from '@pagerecast/scene'
import { extractTokens, toCssVariables, toDesignMd, toW3CTokens } from '@pagerecast/tokens'
import { captureUrl } from './capture'

export type {
  Asset,
  Capture,
  RecastFile,
  SceneNode,
  Scope,
  Theme,
  Viewport,
} from '@pagerecast/scene'

export interface CaptureOptions {
  /** Viewport widths from 240 to 3840 px. Default `[1440]`. */
  widths?: number[]
  /** Colour scheme to capture. Default `light`. */
  theme?: 'light' | 'dark' | 'both'
  /** The whole page or the first screen. Default `page`. */
  scope?: 'page' | 'viewport'
  /** BCP 47 tag such as `de-DE`; empty keeps the browser's language. */
  language?: string
  /** Wait this long at each width before reading the page, 0 to 60000 ms. Default 0. */
  waitMs?: number
  /** CSS selectors of elements to leave out, such as `['.chat', '#promo']`. */
  hide?: string[]
  /** Cut full-page captures off at this height in CSS px; 0 keeps the whole page. Default 0. */
  maxHeight?: number
  /** Scroll through the page to load lazy content first. Default true. */
  preload?: boolean
  /** Hide cookie and consent banners. Default true. */
  hideOverlays?: boolean
  /** Add a screenshot reference per capture. Default true. */
  screenshot?: boolean
  /**
   * Chrome or Chromium to run. Default: `PAGERECAST_BROWSER`, then Playwright's
   * Chromium, then Google Chrome.
   */
  browser?: string
  /** Called with a short label as the capture moves on. */
  onProgress?: (label: string) => void
}

export type TokenFormat = 'md' | 'css' | 'w3c'

export interface CaptureSummary {
  label: string
  width: number
  height: number
  theme: Theme
  scope: string
  /** Every node in the capture, counted by type below. */
  layers: number
  frames: number
  text: number
  images: number
  svg: number
  raster: number
  screenshot: boolean
}

export interface RecastInfo {
  title: string
  url: string
  capturedAt: string
  generator: RecastFile['generator']
  captures: CaptureSummary[]
  assets: { embeddedImages: number; linkedImages: number; svg: number }
}

/** An option outside its allowed values. The message names the option and its range. */
export class OptionError extends Error {}

const THEMES: Record<string, Theme[]> = {
  light: ['light'],
  dark: ['dark'],
  both: ['light', 'dark'],
}

/** Accepts http(s) and file URLs, bare hosts, and paths to local HTML files. */
export function toUrl(input: string): string {
  if (/^(https?|file):/i.test(input)) return input
  if (existsSync(input)) return pathToFileURL(resolve(input)).href
  return `https://${input}`
}

/** A file name for a capture of `url`, such as `example.com.recast`. */
export function recastFileName(url: string): string {
  const parsed = new URL(url)
  const name =
    parsed.protocol === 'file:'
      ? basename(parsed.pathname, extname(parsed.pathname))
      : parsed.hostname.replace(/^www\./, '')
  return `${name || 'capture'}.recast`
}

/** Opens `url` (or a local HTML file) in headless Chromium and captures it like the extension. */
export async function capture(url: string, options: CaptureOptions = {}): Promise<RecastFile> {
  const widths = options.widths ?? [1440]
  if (!widths.length || widths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840))
    throw new OptionError('widths takes whole numbers from 240 to 3840, such as 1440 and 390.')
  const theme = options.theme ?? 'light'
  const themes = Object.hasOwn(THEMES, theme) ? THEMES[theme] : undefined
  if (!themes) throw new OptionError('theme is light, dark or both.')
  const scope = options.scope ?? 'page'
  if (scope !== 'page' && scope !== 'viewport') throw new OptionError('scope is page or viewport.')
  const waitMs = options.waitMs ?? 0
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 60_000)
    throw new OptionError('waitMs is a whole number of milliseconds from 0 to 60000.')
  const maxHeight = options.maxHeight ?? 0
  if (!Number.isInteger(maxHeight) || maxHeight < 0)
    throw new OptionError(
      'maxHeight is a whole number of pixels, such as 10000, or 0 for no limit.',
    )
  const hide = options.hide ?? []
  if (!Array.isArray(hide) || hide.some((h) => typeof h !== 'string'))
    throw new OptionError('hide is a list of CSS selectors, such as [".chat", "#promo"].')
  return captureUrl(
    toUrl(url),
    {
      widths: [...new Set(widths)],
      themes,
      scope,
      delay: waitMs,
      maxHeight,
      hide: hide.filter((h) => h.trim()).join(', '),
      language: options.language ?? '',
      preload: options.preload ?? true,
      hideOverlays: options.hideOverlays ?? true,
      screenshot: options.screenshot ?? true,
      ...(options.browser ? { browser: options.browser } : {}),
    },
    options.onProgress ?? (() => undefined),
  )
}

/** The bytes of a `.recast` file: gzip-compressed JSON. */
export function encode(file: RecastFile): Promise<Uint8Array> {
  return encodeFile(file)
}

/** Reads `.recast` bytes, plain JSON or a clipboard payload, and checks it like the plugin does. */
export function decode(input: Uint8Array | string): Promise<RecastFile> {
  return decodeScene(input)
}

/** The design tokens the capture repeats, as a DESIGN.md, CSS custom properties or W3C JSON. */
export function tokens(file: RecastFile, format: TokenFormat = 'md'): string {
  const extracted = extractTokens(file)
  if (format === 'w3c') return `${JSON.stringify(toW3CTokens(extracted, file.source), null, 2)}\n`
  if (format === 'css') return toCssVariables(extracted, file.source)
  if (format === 'md') return toDesignMd(extracted, file.source)
  throw new OptionError('format is md, css or w3c.')
}

function count(node: SceneNode, totals: Record<string, number>) {
  totals[node.type] = (totals[node.type] ?? 0) + 1
  if (node.type === 'frame') for (const child of node.children) count(child, totals)
}

/** What a file holds: its source, and per capture the size and layer counts. */
export function info(file: RecastFile): RecastInfo {
  const assets = Object.values(file.assets)
  return {
    title: file.source.title,
    url: file.source.url,
    capturedAt: file.source.capturedAt,
    generator: file.generator,
    captures: file.captures.map((c) => {
      const totals: Record<string, number> = {}
      count(c.root, totals)
      return {
        label: c.label,
        width: c.width,
        height: c.height,
        theme: c.theme,
        scope: c.scope,
        layers: Object.values(totals).reduce((a, b) => a + b, 0),
        frames: totals.frame ?? 0,
        text: totals.text ?? 0,
        images: totals.image ?? 0,
        svg: totals.svg ?? 0,
        raster: totals.raster ?? 0,
        screenshot: Boolean(c.screenshot),
      }
    }),
    assets: {
      embeddedImages: assets.filter((a) => a.kind === 'image' && a.data).length,
      linkedImages: assets.filter((a) => a.kind === 'image' && !a.data).length,
      svg: assets.filter((a) => a.kind === 'svg').length,
    },
  }
}
