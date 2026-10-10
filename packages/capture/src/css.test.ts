import { describe, expect, it } from 'vitest'
import {
  directionToAngle,
  parseAngle,
  parseBlur,
  parseColor,
  parseContent,
  parseGradient,
  parseShadows,
  parseTransform,
  parseUrl,
  splitTopLevel,
} from './css'

describe('splitTopLevel', () => {
  it('ignores separators inside parentheses and quotes', () => {
    expect(splitTopLevel('rgb(1, 2, 3) 0%, url("a,b.png"), red')).toEqual([
      'rgb(1, 2, 3) 0%',
      'url("a,b.png")',
      'red',
    ])
    expect(splitTopLevel('rgba(0, 0, 0, 0.1) 0px 4px', ' ')).toEqual([
      'rgba(0, 0, 0, 0.1)',
      '0px',
      '4px',
    ])
  })
})

describe('parseColor', () => {
  it('reads rgb, rgba, space syntax, hex and transparent', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
    expect(parseColor('rgb(0 0 255 / 25%)')).toEqual({ r: 0, g: 0, b: 1, a: 0.25 })
    expect(parseColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('transparent')?.a).toBe(0)
  })
  it('returns null for colour spaces it cannot convert', () => {
    expect(parseColor('oklch(0.6 0.2 30)')).toBeNull()
  })
})

describe('angles', () => {
  it('converts units', () => {
    expect(parseAngle('90deg')).toBe(90)
    expect(parseAngle('0.5turn')).toBe(180)
    expect(parseAngle('100grad')).toBe(90)
  })
  it('maps side and corner keywords using the box ratio', () => {
    expect(directionToAngle('to right', 100, 100)).toBe(90)
    expect(directionToAngle('to top right', 100, 100)).toBeCloseTo(45)
    expect(directionToAngle('to bottom left', 200, 100)).toBeCloseTo(180 + 26.565, 2)
  })
})

describe('parseGradient', () => {
  it('parses a linear gradient with positions', () => {
    const paint = parseGradient(
      'linear-gradient(90deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)',
      200,
      100,
    )
    expect(paint).toMatchObject({ type: 'linear', angle: 90 })
    expect(paint?.type === 'linear' && paint.stops.map((s) => s.position)).toEqual([0, 1])
  })
  it('defaults to top-to-bottom and distributes unpositioned stops', () => {
    const paint = parseGradient(
      'linear-gradient(red, lime, blue)'.replace(
        /red|lime|blue/g,
        (c) => ({ red: '#f00', lime: '#0f0', blue: '#00f' })[c]!,
      ),
      10,
      10,
    )
    expect(paint).toMatchObject({ type: 'linear', angle: 180 })
    expect(paint?.type === 'linear' && paint.stops.map((s) => s.position)).toEqual([0, 0.5, 1])
  })
  it('converts pixel stops to fractions of the gradient line', () => {
    const paint = parseGradient(
      'linear-gradient(to right, rgb(0, 0, 0) 50px, rgb(255, 255, 255) 100px)',
      200,
      50,
    )
    expect(paint?.type === 'linear' && paint.stops.map((s) => s.position)).toEqual([0.25, 0.5])
  })
  it('parses a radial gradient centre and radius', () => {
    const paint = parseGradient(
      'radial-gradient(circle at 25% 50%, rgb(255, 255, 255) 0%, rgb(0, 0, 0) 100%)',
      100,
      100,
    )
    expect(paint).toMatchObject({ type: 'radial', center: [0.25, 0.5] })
  })
  it('parses a conic gradient', () => {
    const paint = parseGradient(
      'conic-gradient(from 90deg at 50% 50%, rgb(255, 0, 0) 0deg, rgb(0, 0, 255) 180deg)',
      100,
      100,
    )
    expect(paint).toMatchObject({ type: 'conic', angle: 90 })
    expect(paint?.type === 'conic' && paint.stops.map((s) => s.position)).toEqual([0, 0.5])
  })
  it('returns null for non-gradients', () => {
    expect(parseGradient('url("a.png")', 10, 10)).toBeNull()
  })
})

describe('parseShadows', () => {
  it('parses multiple shadows including inset', () => {
    const shadows = parseShadows(
      'rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgb(255, 0, 0) 1px 2px 0px 0px inset',
    )
    expect(shadows).toHaveLength(2)
    expect(shadows[0]).toMatchObject({ x: 0, y: 4, blur: 6, spread: -1, inset: false })
    expect(shadows[1]).toMatchObject({ inset: true, x: 1, y: 2 })
  })
  it('skips none and fully transparent shadows', () => {
    expect(parseShadows('none')).toEqual([])
    expect(parseShadows('rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toEqual([])
  })
})

describe('parseTransform', () => {
  it('extracts rotation and scale from a matrix', () => {
    const t = parseTransform('matrix(0, 1, -1, 0, 0, 0)')
    expect(t.rotation).toBe(90)
    expect(t.scaleX).toBeCloseTo(1)
    expect(parseTransform('matrix(2, 0, 0, 3, 10, 10)')).toMatchObject({
      rotation: 0,
      scaleX: 2,
      scaleY: 3,
    })
    expect(parseTransform('none')).toMatchObject({ rotation: 0, scaleX: 1 })
  })
})

describe('small parsers', () => {
  it('reads blur, url and pseudo-element content', () => {
    expect(parseBlur('blur(8px) saturate(1.2)')).toBe(8)
    expect(parseUrl('url("https://a.com/x.png")')).toBe('https://a.com/x.png')
    expect(parseContent('"→ " "Next"')).toBe('→ Next')
    expect(parseContent('"\\201C"')).toBe('\u201C')
    expect(parseContent('none')).toBeNull()
    expect(parseContent('""')).toBe('')
  })
})
