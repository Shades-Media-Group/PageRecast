import type { Color, GradientStop, ImagePosition, Paint, Shadow } from '@pagerecast/scene'

/** Splits on `separator` only outside parentheses and quotes. */
export function splitTopLevel(value: string, separator = ','): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const char of value) {
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth++
    else if (char === ')') depth--
    else if (depth === 0 && (separator === ' ' ? /\s/.test(char) : char === separator)) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Parses the colour syntaxes Chrome emits for computed styles in sRGB. */
export function parseColor(value: string): Color | null {
  const v = value.trim().toLowerCase()
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) : 1 }
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(v)?.[1]
  if (!fn) return null
  const parts = fn.split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const channel = (p: string) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / 255)
  const alpha =
    parts[3] === undefined
      ? 1
      : parts[3].endsWith('%')
        ? parseFloat(parts[3]) / 100
        : parseFloat(parts[3])
  const [r, g, b] = parts as [string, string, string]
  return {
    r: clamp01(channel(r)),
    g: clamp01(channel(g)),
    b: clamp01(channel(b)),
    a: clamp01(alpha),
  }
}

export function parseAngle(value: string): number | null {
  const m = /^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(value.trim())
  if (!m) return null
  const n = parseFloat(m[1]!)
  switch (m[2]) {
    case 'rad':
      return (n * 180) / Math.PI
    case 'turn':
      return n * 360
    case 'grad':
      return n * 0.9
    default:
      return n
  }
}

/** CSS side/corner keywords to an angle, for a box of the given size. */
export function directionToAngle(value: string, width: number, height: number): number | null {
  const words = value
    .replace(/^to\s+/, '')
    .split(/\s+/)
    .sort()
    .join(' ')
  const corner = (Math.atan2(height, width) * 180) / Math.PI
  const table: Record<string, number> = {
    top: 0,
    right: 90,
    bottom: 180,
    left: 270,
    'right top': corner,
    'bottom right': 180 - corner,
    'bottom left': 180 + corner,
    'left top': 360 - corner,
  }
  return table[words] ?? null
}

type ColorResolver = (value: string) => Color | null

function splitStop(part: string): { color: string; positions: string[] } {
  const tokens = splitTopLevel(part, ' ')
  const positions = tokens.filter((t) => /^-?[\d.]+(%|px|deg|turn|rad)?$/.test(t))
  const color = tokens.filter((t) => !positions.includes(t)).join(' ')
  return { color, positions }
}

/** Resolves stop positions to 0–1, distributing unpositioned stops evenly. */
function parseStops(
  parts: string[],
  length: number,
  resolve: ColorResolver,
  unit: 'length' | 'angle',
): GradientStop[] {
  const raw: { color: Color; position: number | null }[] = []
  for (const part of parts) {
    const { color, positions } = splitStop(part)
    if (!color) continue // colour hint
    const resolved = resolve(color)
    if (!resolved) continue
    const toUnit = (p: string): number => {
      if (p.endsWith('%')) return parseFloat(p) / 100
      if (unit === 'angle') return (parseAngle(p) ?? 0) / 360
      return length > 0 ? parseFloat(p) / length : 0
    }
    if (positions.length === 0) raw.push({ color: resolved, position: null })
    for (const p of positions) raw.push({ color: resolved, position: toUnit(p) })
  }
  if (raw.length === 0) return []
  if (raw[0]!.position === null) raw[0]!.position = 0
  if (raw[raw.length - 1]!.position === null) raw[raw.length - 1]!.position = 1
  for (let i = 1; i < raw.length; i++) {
    if (raw[i]!.position !== null) continue
    let j = i
    while (raw[j]!.position === null) j++
    const start = raw[i - 1]!.position!
    const end = raw[j]!.position!
    for (let k = i; k < j; k++)
      raw[k]!.position = start + ((end - start) * (k - i + 1)) / (j - i + 1)
  }
  let last = 0
  return raw.map(({ color, position }) => {
    last = Math.max(last, position!)
    return { color, position: clamp01(last) }
  })
}

function parsePosition(value: string, width: number, height: number): [number, number] {
  const tokens = value.trim().split(/\s+/)
  const axis = (token: string | undefined, size: number, fallback: number) => {
    if (!token) return fallback
    const keywords: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }
    if (token in keywords) return keywords[token]!
    if (token.endsWith('%')) return parseFloat(token) / 100
    return size > 0 ? parseFloat(token) / size : 0.5
  }
  let [xToken, yToken] = tokens
  if (xToken === 'top' || xToken === 'bottom') [xToken, yToken] = [yToken, xToken]
  return [axis(xToken, width, 0.5), axis(yToken, height, 0.5)]
}

/** One `background-image` layer (a gradient) to a paint, or null if unsupported. */
export function parseGradient(
  value: string,
  width: number,
  height: number,
  resolve: ColorResolver = parseColor,
): Paint | null {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(value.trim())
  if (!m) return null
  const kind = m[2]!
  const args = splitTopLevel(m[3]!)
  const first = args[0] ?? ''
  if (kind === 'linear') {
    let angle = 180
    let stopParts = args
    const explicit = parseAngle(first)
    if (explicit !== null) {
      angle = explicit
      stopParts = args.slice(1)
    } else if (first.startsWith('to ')) {
      angle = directionToAngle(first, width, height) ?? 180
      stopParts = args.slice(1)
    }
    const rad = (angle * Math.PI) / 180
    const length = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad))
    const stops = parseStops(stopParts, length, resolve, 'length')
    return stops.length ? { type: 'linear', angle: ((angle % 360) + 360) % 360, stops } : null
  }
  if (kind === 'radial') {
    const isShape =
      !resolve(splitStop(first).color) || /\b(circle|ellipse|at|closest|farthest)\b/.test(first)
    const shape = isShape ? first : ''
    const stopParts = isShape ? args.slice(1) : args
    const [sizePart = '', positionPart = 'center'] = shape.split(/\bat\b/)
    const center = parsePosition(positionPart, width, height)
    const cx = center[0] * width
    const cy = center[1] * height
    const circle = /\bcircle\b/.test(sizePart)
    const dx = Math.max(cx, width - cx)
    const dy = Math.max(cy, height - cy)
    const nearX = Math.min(cx, width - cx)
    const nearY = Math.min(cy, height - cy)
    let rx: number
    let ry: number
    const lengths = sizePart.match(/-?[\d.]+(px|%)/g)
    if (lengths && lengths.length > 0) {
      const toPx = (t: string, size: number) =>
        t.endsWith('%') ? (parseFloat(t) / 100) * size : parseFloat(t)
      rx = toPx(lengths[0]!, width)
      ry = lengths[1] ? toPx(lengths[1], height) : rx
    } else if (/closest-side/.test(sizePart)) {
      rx = circle ? Math.min(nearX, nearY) : nearX
      ry = circle ? rx : nearY
    } else if (/farthest-side/.test(sizePart)) {
      rx = circle ? Math.max(dx, dy) : dx
      ry = circle ? rx : dy
    } else if (/closest-corner/.test(sizePart)) {
      rx = circle ? Math.hypot(nearX, nearY) : nearX * Math.SQRT2
      ry = circle ? rx : nearY * Math.SQRT2
    } else {
      // farthest-corner, the default
      rx = circle ? Math.hypot(dx, dy) : dx * Math.SQRT2
      ry = circle ? rx : dy * Math.SQRT2
    }
    const stops = parseStops(stopParts, Math.max(rx, 1), resolve, 'length')
    return stops.length
      ? {
          type: 'radial',
          stops,
          center,
          radius: [width ? rx / width : 0.5, height ? ry / height : 0.5],
        }
      : null
  }
  let angle = 0
  let center: [number, number] = [0.5, 0.5]
  let stopParts = args
  if (/^(from|at)\b/.test(first)) {
    const from = /from\s+(\S+)/.exec(first)?.[1]
    const at = /at\s+(.+)$/.exec(first)?.[1]
    if (from) angle = parseAngle(from) ?? 0
    if (at) center = parsePosition(at, width, height)
    stopParts = args.slice(1)
  }
  const stops = parseStops(stopParts, 1, resolve, 'angle')
  return stops.length ? { type: 'conic', angle, stops, center } : null
}

export function parseShadows(value: string, resolve: ColorResolver = parseColor): Shadow[] {
  if (!value || value === 'none') return []
  const shadows: Shadow[] = []
  for (const part of splitTopLevel(value)) {
    const tokens = splitTopLevel(part, ' ')
    const inset = tokens.includes('inset')
    const lengths = tokens.filter((t) => /^-?[\d.]+(px)?$/.test(t)).map(parseFloat)
    const colorToken = tokens.find((t) => t !== 'inset' && !/^-?[\d.]+(px)?$/.test(t))
    const color = (colorToken && resolve(colorToken)) || { r: 0, g: 0, b: 0, a: 1 }
    if (lengths.length < 2 || color.a === 0) continue
    shadows.push({
      inset,
      x: lengths[0]!,
      y: lengths[1]!,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      color,
    })
  }
  return shadows
}

/** Rotation and scale from a computed `transform` matrix. */
export function parseTransform(value: string): {
  rotation: number
  scaleX: number
  scaleY: number
} {
  const identity = { rotation: 0, scaleX: 1, scaleY: 1 }
  if (!value || value === 'none') return identity
  const m2 = /^matrix\(([^)]+)\)$/.exec(value)
  const m3 = /^matrix3d\(([^)]+)\)$/.exec(value)
  let a: number, b: number, c: number, d: number
  if (m2) {
    ;[a, b, c, d] = m2[1]!.split(',').map(parseFloat) as [number, number, number, number]
  } else if (m3) {
    const v = m3[1]!.split(',').map(parseFloat)
    ;[a, b, c, d] = [v[0]!, v[1]!, v[4]!, v[5]!]
  } else return identity
  const scaleX = Math.hypot(a, b)
  const det = a * d - b * c
  const scaleY = scaleX ? det / scaleX : Math.hypot(c, d)
  const rotation = (Math.atan2(b, a) * 180) / Math.PI
  return { rotation: Math.round(rotation * 100) / 100, scaleX, scaleY }
}

export function parseBlur(value: string): number {
  const m = /blur\((-?[\d.]+)px\)/.exec(value || '')
  return m ? parseFloat(m[1]!) : 0
}

export function parseUrl(value: string): string | null {
  const m = /^url\((['"]?)(.*)\1\)$/s.exec(value.trim())
  return m ? m[2]! : null
}

/** The text a pseudo-element's `content` would render, or null for none. */
export function parseContent(value: string): string | null {
  if (!value || value === 'none' || value === 'normal') return null
  let text = ''
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(value))) {
    text += (match[1] ?? match[2] ?? '')
      .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/\\(.)/g, '$1')
  }
  return text
}

const POSITION_KEYWORDS: Record<string, number> = {
  left: 0,
  top: 0,
  center: 0.5,
  right: 1,
  bottom: 1,
}

/**
 * One axis of `object-position` or `background-position` as a fraction of the
 * free space (box minus drawn image): `50%` is 0.5, `0` is 0. Pixel offsets
 * need the free space; without it (or for `calc()`) the axis stays centred.
 */
function positionAxis(token: string | undefined, free: number | null): number {
  if (!token) return 0.5
  const value = token.trim().toLowerCase()
  if (value in POSITION_KEYWORDS) return POSITION_KEYWORDS[value]!
  const percent = /^(-?[\d.]+)%$/.exec(value)
  if (percent) return Number(percent[1]) / 100
  const px = /^(-?[\d.]+)px$/.exec(value)
  if (px && free) return Number(px[1]) / free
  return 0.5
}

/**
 * Where an image sits in its box, from computed `x` and `y` position values,
 * or undefined when it is centred (the default the importer already draws).
 * `free` is the box size minus the drawn image size per axis, when known.
 */
export function parseImagePosition(
  x: string,
  y: string,
  free: [number | null, number | null] = [null, null],
): ImagePosition | undefined {
  const position: ImagePosition = [positionAxis(x, free[0]), positionAxis(y, free[1])]
  const round = (v: number) => Math.round(v * 10000) / 10000 || 0
  if (position.every((v) => Math.abs(v - 0.5) < 0.0005)) return undefined
  return [round(position[0]), round(position[1])]
}
