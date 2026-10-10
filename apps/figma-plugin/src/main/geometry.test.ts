import { describe, expect, it } from 'vitest'
import {
  angularGradientTransform,
  apply,
  closestStyle,
  familyCandidates,
  invert,
  linearGradientTransform,
  parseStyleName,
  radialGradientTransform,
  rotatedTransform,
} from './geometry'

const close = ([x, y]: [number, number], [ex, ey]: [number, number]) => {
  expect(x).toBeCloseTo(ex, 6)
  expect(y).toBeCloseTo(ey, 6)
}

describe('gradient transforms', () => {
  it('maps a left-to-right gradient onto the identity', () => {
    const t = linearGradientTransform(90, 200, 100)
    close(apply(t, 0, 0.5), [0, 0.5])
    close(apply(t, 1, 0.5), [1, 0.5])
  })

  it('maps a top-to-bottom gradient so the top edge is the start', () => {
    const t = linearGradientTransform(180, 200, 100)
    close(apply(t, 0.5, 0), [0, 0.5])
    close(apply(t, 0.5, 1), [1, 0.5])
  })

  it('puts the corners of a 45° gradient at the ends of the line', () => {
    const t = linearGradientTransform(45, 100, 100)
    expect(apply(t, 0, 1)[0]).toBeCloseTo(0, 6) // bottom-left starts
    expect(apply(t, 1, 0)[0]).toBeCloseTo(1, 6) // top-right ends
  })

  it('maps a radial centre and radius onto the unit circle', () => {
    const t = radialGradientTransform([0.25, 0.5], [0.25, 0.5])
    close(apply(t, 0.25, 0.5), [0.5, 0.5])
    close(apply(t, 0.5, 0.5), [1, 0.5])
  })

  it('rotates conic gradients so 0° points up', () => {
    const t = angularGradientTransform(0, [0.5, 0.5])
    close(apply(t, 0.5, 0.5), [0.5, 0.5])
    // The top centre of the layer lies on the gradient's 0° axis (pointing right in gradient space).
    const [gx, gy] = apply(t, 0.5, 0)
    expect(gx).toBeGreaterThan(0.5)
    expect(gy).toBeCloseTo(0.5, 6)
  })

  it('inverts affine matrices', () => {
    const m: [[number, number, number], [number, number, number]] = [
      [2, 1, 3],
      [0.5, 4, -2],
    ]
    close(apply(invert(m), ...apply(m, 0.3, 0.7)), [0.3, 0.7])
  })
})

describe('rotatedTransform', () => {
  it('keeps the centre in place', () => {
    const t = rotatedTransform(10, 20, 100, 40, 45)
    close(apply(t, 50, 20), [60, 40])
  })
})

describe('font matching', () => {
  it('parses style names', () => {
    expect(parseStyleName('Semi Bold Italic')).toEqual({ weight: 600, italic: true })
    expect(parseStyleName('ExtraBold')).toEqual({ weight: 800, italic: false })
    expect(parseStyleName('Regular')).toEqual({ weight: 400, italic: false })
    expect(parseStyleName('Black')).toEqual({ weight: 900, italic: false })
  })

  it('picks the nearest weight with the right slant', () => {
    const styles = ['Regular', 'Italic', 'Medium', 'Bold', 'Bold Italic']
    expect(closestStyle(styles, 700, false)).toBe('Bold')
    expect(closestStyle(styles, 600, false)).toBe('Bold')
    expect(closestStyle(styles, 400, true)).toBe('Italic')
    expect(closestStyle(styles, 300, false)).toBe('Regular')
  })

  it('expands generic families and always ends with Inter', () => {
    expect(familyCandidates(['Brand Sans', 'system-ui', 'sans-serif'])).toEqual([
      'Brand Sans',
      'system-ui',
      'SF Pro Text',
      'Inter',
      'Roboto',
      'sans-serif',
      'Arial',
    ])
  })
})
