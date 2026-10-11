import { describe, expect, it } from 'vitest'
import type { Capture } from '@pagerecast/scene'
import { pageGroups, pageOf, pageTitle } from './pages'

const capture = (id: string, label: string) => ({ id, label }) as Capture

describe('pageGroups', () => {
  it('keeps a single-page file as one group', () => {
    const captures = [
      capture('c1', 'Desktop · 1440 · Light'),
      capture('c2', 'Desktop · 1440 · Dark'),
      capture('c3', 'Mobile · 390 · Light'),
    ]
    expect(pageGroups(captures)).toEqual([captures])
    expect(pageOf(captures[0]!)).toBe('')
  })

  it('groups merged captures by id prefix, in first-appearance order', () => {
    const a1 = capture('p1-c1', 'Home · Desktop · 1440 · Light')
    const b1 = capture('p2-c1', 'Pricing · Desktop · 1440 · Light')
    const a2 = capture('p1-c2', 'Home · Desktop · 1440 · Dark')
    expect(pageGroups([a1, b1, a2])).toEqual([[a1, a2], [b1]])
    expect(pageTitle(b1)).toBe('Pricing')
  })

  it('falls back to the page title in the label', () => {
    const a = capture('c1', 'Home · Desktop · 1440 · Light')
    const b = capture('c2', 'Pricing · Tablet · 768 · Light')
    const c = capture('c3', 'Pricing · Mobile · 390 · Dark')
    expect(pageGroups([a, b, c])).toEqual([[a], [b, c]])
    expect(pageOf(b)).toBe('Pricing')
  })
})
