import { describe, expect, it } from 'vitest'
import { layoutLineup, LINEUP_GAP, type LineupFrame } from './lineup'

const frame = (width: number, theme: 'light' | 'dark', height = 720): LineupFrame => ({
  width,
  theme,
  height,
  label: `${width} ${theme}`,
})

describe('layoutLineup', () => {
  it('keeps true relative widths on one scale and fits the space', () => {
    const groups = layoutLineup(
      [
        frame(390, 'dark', 844),
        frame(1440, 'light'),
        frame(1440, 'dark'),
        frame(390, 'light', 844),
      ],
      348,
      88,
    )
    expect(groups.map((g) => g.width)).toEqual([1440, 390])
    expect(groups[0]!.tiles.map((t) => t.theme)).toEqual(['light', 'dark'])
    const [desktop, mobile] = [groups[0]!.tiles[0]!, groups[1]!.tiles[0]!]
    expect(desktop.w / mobile.w).toBeCloseTo(1440 / 390, 0)
    const total = groups.reduce((n, g) => n + g.box, 0) + LINEUP_GAP * (groups.length - 1)
    expect(total).toBeLessThanOrEqual(348)
    expect(Math.max(...groups.flatMap((g) => g.tiles.map((t) => t.h)))).toBeLessThanOrEqual(88)
  })

  it('caps a single frame by height and reserves caption room for narrow groups', () => {
    const [single] = layoutLineup([frame(1440, 'light')], 348, 88)
    expect(single!.tiles[0]!.h).toBe(88)
    expect(single!.tiles[0]!.w).toBe(176)

    const groups = layoutLineup(
      [1440, 768, 390].flatMap((w) => [frame(w, 'light'), frame(w, 'dark')]),
      348,
      88,
    )
    expect(groups.every((g) => g.box >= 48)).toBe(true)
    const total = groups.reduce((n, g) => n + g.box, 0) + LINEUP_GAP * 2
    expect(total).toBeLessThanOrEqual(348)
  })
})
