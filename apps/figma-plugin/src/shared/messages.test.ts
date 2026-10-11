import { describe, expect, it } from 'vitest'
import type { Capture } from '@pagerecast/scene'
import { importKey } from './messages'

const capture = (label: string, scope: Capture['scope'], rootKey = 'html') =>
  ({ label, scope, root: { key: rootKey } }) as Capture

describe('importKey', () => {
  it('matches the same page, label and scope across captures', () => {
    const url = 'https://example.com/'
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).toBe(
      importKey(url, capture('Desktop · 1440 · Light', 'page')),
    )
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).not.toBe(
      importKey(url, capture('Desktop · 1440 · Dark', 'page')),
    )
    expect(importKey(url, capture('Desktop · 1440 · Light', 'page'))).not.toBe(
      importKey('https://example.com/pricing', capture('Desktop · 1440 · Light', 'page')),
    )
  })

  it('tells element captures apart by element, and skips HTML code', () => {
    const url = 'https://example.com/'
    expect(
      importKey(url, capture('Desktop · 1440 · Light', 'element', 'html/body1/nav1')),
    ).not.toBe(importKey(url, capture('Desktop · 1440 · Light', 'element', 'html/body1/footer1')))
    expect(importKey('', capture('Desktop · 1440 · Light', 'page'))).toBeNull()
  })
})
