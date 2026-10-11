import { describe, expect, it } from 'vitest'
import { figmaReadable } from './load'

const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0])

describe('figmaReadable', () => {
  it('accepts the formats Figma decodes', () => {
    expect(figmaReadable(bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true)
    expect(figmaReadable(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(figmaReadable(bytes(0x47, 0x49, 0x46, 0x38))).toBe(true)
  })
  it('sends WebP and AVIF to be re-encoded', () => {
    expect(figmaReadable(new TextEncoder().encode('RIFF....WEBPVP8 '))).toBe(false)
    expect(figmaReadable(new TextEncoder().encode('....ftypavif'))).toBe(false)
  })
})
