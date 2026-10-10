import type { RecastFile } from '@pagerecast/scene'

export interface ImportOptions {
  /** Convert flex containers to Auto Layout where the result matches the page. */
  autoLayout: boolean
  /** Create colour variables (with Light/Dark modes when both were captured). */
  variables: boolean
  /** Create local text styles for repeated type. */
  textStyles: boolean
  /** Place a locked screenshot of the page next to each import. */
  screenshot: boolean
}

export const DEFAULT_OPTIONS: ImportOptions = {
  autoLayout: true,
  variables: true,
  textStyles: true,
  screenshot: true,
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
  variables: number
  textStyles: number
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
  | { type: 'options'; options: ImportOptions }
  | { type: 'resize'; width: number; height: number }
  | { type: 'open-url'; url: string }

export type MainToUi =
  | { type: 'ready'; options: ImportOptions; fileName: string }
  | { type: 'progress'; phase: 'fonts' | 'layers' | 'styles'; done: number; total: number }
  | { type: 'done'; report: ImportReport }
  | { type: 'error'; message: string }
