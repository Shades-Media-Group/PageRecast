/** Figma-free maths for the importer, kept separate so it can be unit tested. */

/** A 2×3 affine matrix: [[a, c, e], [b, d, f]]. */
export type Affine = [[number, number, number], [number, number, number]]

export function invert([[a, c, e], [b, d, f]]: Affine): Affine {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12)
    return [
      [1, 0, 0],
      [0, 1, 0],
    ]
  return [
    [d / det, -c / det, (c * f - d * e) / det],
    [-b / det, a / det, (b * e - a * f) / det],
  ]
}

export function apply([[a, c, e], [b, d, f]]: Affine, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f]
}

/**
 * Figma's `gradientTransform` maps the layer's normalised (0–1) space into
 * gradient space, where a linear gradient runs from (0, 0.5) to (1, 0.5).
 * We build the opposite mapping from the CSS geometry and invert it.
 */
export function linearGradientTransform(angle: number, width: number, height: number): Affine {
  const w = Math.max(width, 1e-6)
  const h = Math.max(height, 1e-6)
  const rad = (angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  // CSS gradient line length: the line through the centre reaching the corners.
  const length = Math.abs(w * dx) + Math.abs(h * dy)
  const sx = w / 2 - (dx * length) / 2
  const sy = h / 2 - (dy * length) / 2
  const ex = w / 2 + (dx * length) / 2
  const ey = h / 2 + (dy * length) / 2
  // Perpendicular axis, same length, so the mapping stays invertible.
  const px = -(ey - sy)
  const py = ex - sx
  const toLayer: Affine = [
    [(ex - sx) / w, px / w, sx / w - (0.5 * px) / w],
    [(ey - sy) / h, py / h, sy / h - (0.5 * py) / h],
  ]
  return invert(toLayer)
}

/** Radial gradients: Figma's unit circle (centre 0.5, radius 0.5) onto the CSS ellipse. */
export function radialGradientTransform(
  center: [number, number],
  radius: [number, number],
): Affine {
  const [cx, cy] = center
  const rx = Math.max(radius[0], 1e-6)
  const ry = Math.max(radius[1], 1e-6)
  return invert([
    [2 * rx, 0, cx - rx],
    [0, 2 * ry, cy - ry],
  ])
}

/**
 * Conic gradients start at 12 o'clock in CSS and at 3 o'clock in Figma, both
 * turning clockwise, so the CSS `from` angle is offset by −90°.
 */
export function angularGradientTransform(angle: number, center: [number, number]): Affine {
  const rad = ((angle - 90) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const [cx, cy] = center
  // Rotate around the gradient's own centre (0.5, 0.5), then move it to the CSS centre.
  return invert([
    [cos, -sin, cx - 0.5 * cos + 0.5 * sin],
    [sin, cos, cy - 0.5 * sin - 0.5 * cos],
  ])
}

/**
 * The relative transform for a node of size w×h rotated clockwise by `degrees`
 * around the centre of the box at (x, y).
 */
export function rotatedTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  degrees: number,
): Affine {
  const rad = (degrees * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const cx = x + width / 2
  const cy = y + height / 2
  return [
    [c, -s, cx - (c * width) / 2 + (s * height) / 2],
    [s, c, cy - (s * width) / 2 - (c * height) / 2],
  ]
}

const WEIGHTS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/light/i, 300],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
  [/regular|normal|book|roman|plain/i, 400],
]

/** Weight and italic-ness of a font style name such as "Semi Bold Italic". */
export function parseStyleName(style: string): { weight: number; italic: boolean } {
  const italic = /italic|oblique/i.test(style)
  const numeric = /\b([1-9]00)\b/.exec(style)
  if (numeric) return { weight: Number(numeric[1]), italic }
  for (const [pattern, weight] of WEIGHTS) if (pattern.test(style)) return { weight, italic }
  return { weight: 400, italic }
}

/** Picks the style closest to a CSS weight, preferring a matching slant. */
export function closestStyle(styles: string[], weight: number, italic: boolean): string | null {
  let best: string | null = null
  let bestScore = Infinity
  for (const style of styles) {
    const parsed = parseStyleName(style)
    // CSS falls back to bolder for weights above 500 and lighter below 400.
    const distance =
      Math.abs(parsed.weight - weight) + (weight >= 500 && parsed.weight < weight ? 1 : 0)
    const score = distance + (parsed.italic === italic ? 0 : 1000)
    if (score < bestScore) {
      bestScore = score
      best = style
    }
  }
  return best
}

const GENERIC: Record<string, string[]> = {
  'sans-serif': ['Inter', 'Roboto', 'Arial'],
  'system-ui': ['SF Pro Text', 'Inter', 'Roboto'],
  '-apple-system': ['SF Pro Text', 'Inter'],
  blinkmacsystemfont: ['SF Pro Text', 'Inter'],
  'segoe ui': ['Segoe UI', 'Inter'],
  'ui-sans-serif': ['Inter', 'Roboto'],
  serif: ['Times New Roman', 'Noto Serif', 'Georgia'],
  'ui-serif': ['Georgia', 'Noto Serif'],
  monospace: ['Roboto Mono', 'JetBrains Mono', 'Source Code Pro', 'Courier New'],
  'ui-monospace': ['SF Mono', 'Roboto Mono', 'JetBrains Mono'],
  sfmono: ['SF Mono', 'Roboto Mono'],
  'sfmono-regular': ['SF Mono', 'Roboto Mono'],
  menlo: ['Menlo', 'Roboto Mono'],
  consolas: ['Consolas', 'Roboto Mono'],
  helvetica: ['Helvetica', 'Helvetica Neue', 'Arial', 'Inter'],
  'helvetica neue': ['Helvetica Neue', 'Helvetica', 'Arial', 'Inter'],
}

/** The family names to try in Figma for a CSS font stack, in order. */
/** Web font packages name variable builds "Inter Variable" or "Inter VF"; Figma lists "Inter". */
export function baseFamily(family: string): string {
  return family.replace(/\s+(variable|vf)$/i, '').trim()
}

export function familyCandidates(stack: string[]): string[] {
  const out: string[] = []
  for (const family of stack) {
    out.push(family)
    if (baseFamily(family) !== family) out.push(baseFamily(family))
    const generic = GENERIC[family.toLowerCase()]
    if (generic) out.push(...generic)
  }
  out.push('Inter')
  return [...new Set(out)]
}
