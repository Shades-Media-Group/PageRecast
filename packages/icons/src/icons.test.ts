import { describe, expect, it } from 'vitest'
import { icons, renderIcon, type IconName } from './icons'

describe('icon set', () => {
  const names = Object.keys(icons) as IconName[]

  it('draws every icon inside the 20-unit grid', () => {
    for (const name of names) {
      const numbers = icons[name].match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      // Coordinates stay on the canvas (path deltas can be negative, absolutes cannot exceed 20).
      expect(Math.max(...numbers), name).toBeLessThanOrEqual(20)
    }
  })

  it('uses currentColor only, never hard-coded colours', () => {
    for (const name of names) expect(icons[name], name).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i)
  })

  it('renders accessible markup', () => {
    expect(renderIcon('check')).toContain('aria-hidden="true"')
    expect(renderIcon('check', 16, 'Done')).toContain('aria-label="Done"')
    expect(renderIcon('check', 16)).toContain('width="16"')
  })
})
