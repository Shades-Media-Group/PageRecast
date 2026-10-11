import type { RecastFile } from '@pagerecast/scene'

export interface ImportOptions {
  /** Convert flex containers to Auto Layout where the result matches the page. */
  autoLayout: boolean
  /** Turn repeated patterns (cards, list rows, links) into components and instances. */
  components: boolean
  /** Name layers after their HTML (`div.card`) instead of their role (`Card`). */
  htmlNames: boolean
  /**
   * Create colour variables (with Light/Dark modes when both were captured) and
   * spacing and radius variables for values that recur.
   */
  variables: boolean
  /** Create local text styles for repeated type. */
  textStyles: boolean
  /** Apply matching styles and variables already in the file and its enabled libraries. */
  useLocalStyles: boolean
  /** Keep links on text as Figma hyperlinks. */
  hyperlinks: boolean
  /** Place a locked screenshot of the page next to each import. */
  screenshot: boolean
}

export const DEFAULT_OPTIONS: ImportOptions = {
  autoLayout: true,
  components: true,
  htmlNames: false,
  variables: true,
  textStyles: true,
  useLocalStyles: true,
  hyperlinks: true,
  screenshot: true,
}

/** Options for new sites, options remembered per site, and the review switch. */
export interface Settings {
  defaults: ImportOptions
  domains: Record<string, ImportOptions>
  /** Show the review screen before importing. Holding ⌘ or Ctrl shows it anyway. */
  review: boolean
  /** Successful imports on this device; counted locally, never sent anywhere. */
  imports: number
  /** The one-time rating request has been shown. */
  askedForRating: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  defaults: DEFAULT_OPTIONS,
  domains: {},
  review: true,
  imports: 0,
  askedForRating: false,
}

/** Imports after which the plugin asks, once, for a rating. */
export const RATING_AFTER_IMPORTS = 5

export function optionsFor(settings: Settings, domain: string): ImportOptions {
  return { ...DEFAULT_OPTIONS, ...settings.defaults, ...settings.domains[domain] }
}

export interface FontSubstitution {
  requested: string
  used: string
  count: number
}

export interface ImportReport {
  frames: number
  texts: number
  images: number
  vectors: number
  rasters: number
  autoLayouts: number
  /** Main components: repeated patterns and elements with states. */
  components: number
  /** Instances placed for repeated patterns. */
  instances: number
  variables: number
  textStyles: number
  /** Nodes bound to styles or variables that were already in the file. */
  reusedStyles: number
  /** Nodes bound to variables from the file's enabled team libraries. */
  matchedFromLibrary: number
  substitutions: FontSubstitution[]
  warnings: string[]
  durationMs: number
}

/** Image bytes keyed by asset id, already within Figma's 4096 px limit. */
export type ImageBytes = Record<string, Uint8Array>

/**
 * Screenshots taller than 4096 px arrive as horizontal strips. `y` and
 * `height` are fractions of the full screenshot; `key` indexes `images`.
 */
export type ImageTiles = Record<string, { key: string; y: number; height: number }[]>

export type UiToMain =
  | {
      type: 'import'
      file: RecastFile
      images: ImageBytes
      tiles: ImageTiles
      options: ImportOptions
    }
  | { type: 'settings'; settings: Settings }
  | { type: 'open-url'; url: string }

export type MainToUi =
  | { type: 'ready'; settings: Settings; version: string }
  | { type: 'progress'; phase: 'fonts' | 'layers' | 'styles'; done: number; total: number }
  | { type: 'done'; report: ImportReport }
  | { type: 'error'; message: string }
