import { describe, expect, it } from 'vitest'
import { resolveNested, rewriteSelector } from './states'

const hover = '[data-pr-state~="hover"]'
const focus = '[data-pr-state~="focus"]'

describe('rewriteSelector', () => {
  it('swaps state pseudo-classes for the state attribute', () => {
    expect(rewriteSelector('a:hover')).toBe(`a${hover}`)
    expect(rewriteSelector('.btn:hover .icon')).toBe(`.btn${hover} .icon`)
    expect(rewriteSelector('li:hover > a')).toBe(`li${hover} > a`)
    expect(rewriteSelector(':is(a,button):focus-visible')).toBe(`:is(a,button)${focus}`)
    expect(rewriteSelector('a:focus')).toBe(`a${focus}`)
    expect(rewriteSelector('button:active')).toBe('button[data-pr-state~="active"]')
    expect(rewriteSelector('form:focus-within')).toBe('form[data-pr-state~="focus-within"]')
    expect(rewriteSelector(':hover')).toBe(hover)
  })

  it('rewrites inside :is(), :where() and :has()', () => {
    expect(rewriteSelector(':is(a:hover, b)')).toBe(`:is(a${hover}, b)`)
    expect(rewriteSelector('.card:has(a:focus-visible)')).toBe(`.card:has(a${focus})`)
  })

  it('keeps only the selectors of a list that depend on a state', () => {
    expect(rewriteSelector('a:hover, .plain, b:focus')).toBe(`a${hover}, b${focus}`)
    expect(rewriteSelector('.plain, div > p')).toBeNull()
  })

  it('leaves pseudo-classes inside :not() alone', () => {
    expect(rewriteSelector('a:not(:hover)')).toBeNull()
    expect(rewriteSelector('a:not(.x:is(:focus))')).toBeNull()
    expect(rewriteSelector('a:not(:hover):focus')).toBe(`a:not(:hover)${focus}`)
  })

  it('keeps pseudo-elements, functional pseudo-classes, strings and escapes intact', () => {
    expect(rewriteSelector('a:hover::before')).toBe(`a${hover}::before`)
    expect(rewriteSelector('li:nth-child(2n):hover')).toBe(`li:nth-child(2n)${hover}`)
    expect(rewriteSelector('[title=":hover"]')).toBeNull()
    expect(rewriteSelector('.md\\:hover\\:bg-red:hover')).toBe(`.md\\:hover\\:bg-red${hover}`)
    expect(rewriteSelector('a:hovered')).toBeNull()
  })
})

describe('resolveNested', () => {
  it('replaces & with the parent, or prefixes a descendant combinator', () => {
    expect(resolveNested('&:hover', '.a, .b')).toBe(':is(.a, .b):hover')
    expect(resolveNested('.icon', '.btn')).toBe(':is(.btn) .icon')
  })
})
