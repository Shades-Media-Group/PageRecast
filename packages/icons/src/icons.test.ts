import { describe, expect, it } from 'vitest'
import { icons, renderIcon, type IconName } from './icons'

describe('icon set', () => {
  const names = Object.keys(icons) as IconName[]

  it('draws every icon inside the 24-unit grid', () => {
    for (const name of names) {
      // SVG path syntax lets numbers run together: ".55.45" is 0.55 then 0.45.
      const numbers = icons[name].match(/-?(\d+\.?\d*|\.\d+)/g)?.map(Number) ?? []
      // Coordinates stay on the canvas (path deltas can be negative, absolutes cannot exceed 24).
      expect(Math.max(...numbers), name).toBeLessThanOrEqual(24)
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
