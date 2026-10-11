import { describe, expect, it } from 'vitest'
import { captureLink, parseCaptureLink, webUrl } from './link'

describe('capture links', () => {
  it('round-trips through the hash', () => {
    const link = {
      url: 'https://example.com/pricing?plan=pro#faq',
      widths: [1440, 390],
      theme: 'both' as const,
      language: 'de-DE',
    }
    const href = captureLink(link)
    expect(href).toMatch(/^https:\/\/pagerecast\.shades\.md\/capture\/#url=https%3A%2F%2F/)
    expect(parseCaptureLink(new URL(href).hash)).toEqual(link)
  })

  it('reads typed URLs the way people write them', () => {
    expect(webUrl('example.com')).toBe('https://example.com/')
    expect(webUrl('  http://localhost:3000/app ')).toBe('http://localhost:3000/app')
    expect(webUrl('javascript:alert(1)')).toBeNull()
    expect(webUrl('file:///etc/passwd')).toBeNull()
    expect(webUrl('hello')).toBeNull()
    expect(webUrl('')).toBeNull()
  })

  it.each([
    'url=javascript%3Aalert(1)',
    'url=example.com&widths=100',
    'url=example.com&theme=sepia',
    'url=example.com&language=not%20a%20tag',
    'widths=1440',
  ])('refuses %s', (hash) => expect(parseCaptureLink(hash)).toBeNull())

  it('fills defaults', () => {
    expect(parseCaptureLink('#url=example.com')).toEqual({
      url: 'https://example.com/',
      widths: [1440],
      theme: 'light',
      language: '',
    })
  })
})
