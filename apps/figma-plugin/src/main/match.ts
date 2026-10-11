import type { Color } from '@pagerecast/scene'

/** Pure value matching for binding captured values to existing variables and styles. */

/** One step of an 8-bit channel, so a colour stored as hex still matches its float. */
export const COLOR_DELTA = 1.5 / 255
const ALPHA_DELTA = 0.01

export interface Candidate<T> {
  color: Color
  value: T
}

/**
 * The candidate closest to `color`, if one is within `delta` on every channel.
 * Earlier candidates win ties, so callers list their preferred source first.
 */
export function nearestColor<T>(
  color: Color,
  candidates: Candidate<T>[],
  delta = COLOR_DELTA,
): T | undefined {
  let best: T | undefined
  let bestDistance = Infinity
  for (const { color: c, value } of candidates) {
    const d = Math.max(Math.abs(c.r - color.r), Math.abs(c.g - color.g), Math.abs(c.b - color.b))
    if (d > delta || Math.abs(c.a - color.a) > ALPHA_DELTA) continue
    if (d < bestDistance) {
      best = value
      bestDistance = d
    }
  }
  return best
}

/** Text styles match on family, style (weight and italic), size and line height. */
export const typeKey = (family: string, style: string, size: number, lineHeight: number | null) =>
  `${family}|${style}|${Math.round(size * 100) / 100}|${lineHeight === null ? 'auto' : Math.round(lineHeight * 100) / 100}`
