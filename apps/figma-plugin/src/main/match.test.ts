import { describe, expect, it } from 'vitest'
import { nearestColor, typeKey } from './match'

const c = (r: number, g: number, b: number, a = 1) => ({ r: r / 255, g: g / 255, b: b / 255, a })

describe('nearestColor', () => {
  const candidates = [
    { color: c(224, 0, 10), value: 'red' },
    { color: c(225, 0, 10), value: 'red-2' },
    { color: c(10, 10, 11), value: 'ink' },
    { color: c(10, 10, 11, 0.5), value: 'ink-50' },
  ]

  it('matches within one 8-bit step and prefers the closest', () => {
    expect(nearestColor(c(224.4, 0, 10), candidates)).toBe('red')
    expect(nearestColor(c(225, 0.5, 10), candidates)).toBe('red-2')
    expect(nearestColor(c(11, 10, 11), candidates)).toBe('ink')
  })

  it('rejects colours further away and different alpha', () => {
    expect(nearestColor(c(228, 0, 10), candidates)).toBeUndefined()
    expect(nearestColor(c(10, 10, 11, 0.8), candidates)).toBeUndefined()
    expect(nearestColor(c(10, 10, 11, 0.5), candidates)).toBe('ink-50')
  })

  it('lets earlier candidates win ties', () => {
    const tie = [
      { color: c(0, 0, 0), value: 'local' },
      { color: c(0, 0, 0), value: 'library' },
    ]
    expect(nearestColor(c(0, 0, 0), tie)).toBe('local')
  })
})

describe('typeKey', () => {
  it('rounds sizes and line heights to hundredths', () => {
    expect(typeKey('Inter', 'Bold', 16.001, 24.004)).toBe(typeKey('Inter', 'Bold', 16, 24))
    expect(typeKey('Inter', 'Bold', 16, null)).not.toBe(typeKey('Inter', 'Bold', 16, 16))
    expect(typeKey('Inter', 'Bold', 16, 24)).not.toBe(typeKey('Inter', 'Regular', 16, 24))
  })
})
