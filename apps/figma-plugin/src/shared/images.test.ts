import { describe, expect, it } from 'vitest'
import type { RecastFile } from '@pagerecast/scene'
import { imageUses, shrinkFactor } from './images'

describe('shrinkFactor', () => {
  it('keeps twice the pixels of the largest place an image is shown', () => {
    // A 4000 px photo shown 400 px wide needs 800 px: a fifth.
    expect(shrinkFactor([{ width: 400, height: 300, fit: 'fill' }], 4000, 3000)).toBe(0.2)
    expect(
      shrinkFactor(
        [
          { width: 400, height: 300, fit: 'fill' },
          { width: 1000, height: 750, fit: 'fill' },
        ],
        4000,
        3000,
      ),
    ).toBe(0.5)
  })

  it('uses the covering ratio for crops and the fitting one for contain', () => {
    // A square box over a 2:1 image: cover needs the height, contain the width.
    expect(shrinkFactor([{ width: 100, height: 100, fit: 'fill' }], 2000, 1000)).toBe(0.2)
    expect(shrinkFactor([{ width: 100, height: 100, fit: 'fit' }], 2000, 1000)).toBe(0.1)
  })

  it('never enlarges, and keeps tiles and unused images', () => {
    expect(shrinkFactor([{ width: 800, height: 600, fit: 'fill' }], 400, 300)).toBe(1)
    expect(shrinkFactor([{ width: 10, height: 10, fit: 'tile' }], 400, 300)).toBe(1)
    expect(shrinkFactor(undefined, 400, 300)).toBe(1)
  })
})

describe('imageUses', () => {
  it('finds image nodes and image fills', () => {
    const file = {
      captures: [
        {
          root: {
            type: 'frame',
            width: 1440,
            height: 900,
            fills: [{ type: 'image', asset: 'bg', fit: 'fill' }],
            children: [{ type: 'image', asset: 'a1', fit: 'fit', width: 40, height: 20 }],
          },
        },
      ],
    } as unknown as RecastFile
    const uses = imageUses(file)
    expect(uses.get('bg')).toEqual([{ width: 1440, height: 900, fit: 'fill' }])
    expect(uses.get('a1')).toEqual([{ width: 40, height: 20, fit: 'fit' }])
  })
})
