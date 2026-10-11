/**
 * The `.recast` scene format: what the Chrome extension (or the plugin's HTML
 * import) captures, and what the Figma plugin rebuilds as layers.
 *
 * Coordinates are CSS pixels relative to the capture's root, which is the
 * document's top-left for page captures and the element's border box for
 * element captures. Colours are sRGB, channels 0–1.
 */

export const SCENE_FORMAT = 'pagerecast/scene'
export const SCENE_VERSION = 1

export interface RecastFile {
  format: typeof SCENE_FORMAT
  version: typeof SCENE_VERSION
  generator: { name: 'PageRecast'; version: string; surface: 'extension' | 'figma-plugin' }
  source: { url: string; title: string; capturedAt: string }
  captures: Capture[]
  /** Binary and SVG resources shared by every capture, keyed by asset id. */
  assets: Record<string, Asset>
}

export type Theme = 'light' | 'dark'
export type Scope = 'page' | 'viewport' | 'element'

export interface Viewport {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

export interface Capture {
  id: string
  /** Human label such as "Desktop · 1440 · Light". */
  label: string
  viewport: Viewport
  theme: Theme
  scope: Scope
  /** Full size of what was captured; the root frame uses it. */
  width: number
  height: number
  root: FrameNode
  /** Asset id of a PNG of the same area, used as the screenshot reference. */
  screenshot?: string
}

export type Asset =
  | { kind: 'image'; mime: string; width: number; height: number; data?: string; url?: string }
  | { kind: 'svg'; markup: string }

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface GradientStop {
  position: number
  color: Color
}

export type ImageFit = 'fill' | 'fit' | 'crop' | 'tile'

export type Paint =
  | { type: 'solid'; color: Color }
  | { type: 'linear'; angle: number; stops: GradientStop[] }
  | { type: 'radial'; stops: GradientStop[]; center: [number, number]; radius: [number, number] }
  | { type: 'conic'; angle: number; stops: GradientStop[]; center: [number, number] }
  | { type: 'image'; asset: string; fit: ImageFit; opacity?: number }

export interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: Color
}

export interface Stroke {
  /** Top, right, bottom, left widths. */
  widths: [number, number, number, number]
  color: Color
  style: 'solid' | 'dashed' | 'dotted'
  /** Present when the four sides differ in colour; the plugin draws each side. */
  sides?: [Color, Color, Color, Color]
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface Accessibility {
  role?: string
  label?: string
  alt?: string
  heading?: number
}

interface BaseNode {
  id: string
  /** Stable DOM path; equal across themes of the same viewport. */
  key: string
  name: string
  tag: string
  x: number
  y: number
  width: number
  height: number
  opacity?: number
  blend?: BlendMode
  /** Clockwise rotation in degrees around the node's centre. */
  rotation?: number
  a11y?: Accessibility
  /** The element as written in HTML, e.g. `div#hero.card`, for HTML layer names. */
  html?: string
}

export interface FlexLayout {
  direction: 'row' | 'column'
  wrap: boolean
  gap: [number, number]
  padding: [number, number, number, number]
  justify: 'start' | 'center' | 'end' | 'space-between'
  align: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
}

export interface FrameNode extends BaseNode {
  type: 'frame'
  fills: Paint[]
  stroke?: Stroke
  /** Top-left, top-right, bottom-right, bottom-left. */
  radius?: [number, number, number, number]
  shadows?: Shadow[]
  blur?: number
  backdropBlur?: number
  clips: boolean
  position: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky'
  layout?: FlexLayout
  /** Flex child sizing hints, used only when the parent becomes Auto Layout. */
  grow?: number
  alignSelf?: FlexLayout['align']
  children: SceneNode[]
  /** Interactive elements only, and only when the capture recorded states. */
  states?: NodeStates
}

/** States an interactive element can be captured in. */
export type InteractionState = 'hover' | 'focus' | 'active'

/** A CSS outline, drawn outside the border box. Recorded only inside states. */
export interface Outline {
  width: number
  offset: number
  color: Color
  style: 'solid' | 'dashed' | 'dotted'
}

/**
 * What one node looks like in a state, as fields of the same name on the node.
 * Only fields that differ from the default are present; `null` removes the
 * default value (a border that disappears on hover).
 */
export interface StateOverride {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  opacity?: number
  /** Frames. */
  fills?: Paint[]
  stroke?: Stroke | null
  radius?: [number, number, number, number] | null
  shadows?: Shadow[]
  outline?: Outline | null
  /** Text: replaces the colour and decoration of every run. */
  color?: Color
  decoration?: TextStyle['decoration']
}

/**
 * Per state, the overrides for nodes in the element's subtree, keyed by node
 * `key` (the element's own key included). A state that changes nothing is absent.
 */
export type NodeStates = Partial<Record<InteractionState, Record<string, StateOverride>>>

export interface TextStyle {
  fontFamily: string[]
  fontWeight: number
  italic: boolean
  fontSize: number
  lineHeight: number | null
  letterSpacing: number
  color: Color
  decoration: 'none' | 'underline' | 'line-through'
  transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  href?: string
}

export interface TextRun {
  text: string
  style: TextStyle
}

export interface TextNode extends BaseNode {
  type: 'text'
  /** The first run's style; runs override it per range. */
  style: TextStyle
  runs: TextRun[]
  align: 'left' | 'center' | 'right' | 'justify'
  lines: number
  shadows?: Shadow[]
  /** Gradient or image fill for text drawn with `background-clip: text`. */
  paint?: Paint
}

export interface ImageNode extends BaseNode {
  type: 'image'
  asset: string
  fit: ImageFit
  radius?: [number, number, number, number]
}

export interface SvgNode extends BaseNode {
  type: 'svg'
  asset: string
}

/** Pixels the capture could not describe (canvas, video, iframes, icon fonts). */
export interface RasterNode extends BaseNode {
  type: 'raster'
  asset?: string
  reason: 'canvas' | 'video' | 'iframe' | 'icon-font' | 'form-control' | 'unsupported'
}

export type SceneNode = FrameNode | TextNode | ImageNode | SvgNode | RasterNode
