import type { InteractionState } from '@pagerecast/scene'
import { splitTopLevel } from './css'

/**
 * Interaction states without DevTools: every same-origin rule that uses
 * :hover, :focus, :focus-visible, :focus-within or :active is duplicated into
 * a temporary <style> with the pseudo-class swapped for an attribute selector.
 * Setting that attribute on an element then shows its state as real CSS would.
 *
 * Known ceiling: rules in cross-origin stylesheets (their cssRules throw) and
 * hover effects driven by JavaScript (mouseenter handlers, class toggles) are
 * not seen. Duplicated rules come after every page rule, so a later page rule
 * that would have beaten the original state rule at equal specificity loses.
 */

export const STATE_ATTR = 'data-pr-state'

/** Elements a visitor can hover, focus or press. */
export const INTERACTIVE =
  'a[href],button,[role=button],[role=link],[role=tab],input,select,textarea,summary,[tabindex]:not([tabindex^="-"])'

const TOKENS: Record<string, string> = {
  hover: 'hover',
  active: 'active',
  focus: 'focus',
  'focus-visible': 'focus',
  'focus-within': 'focus-within',
}

/** Rewrites one complex selector; null when it has no state pseudo-class to rewrite. */
function rewriteComplex(selector: string): string | null {
  let out = ''
  let changed = false
  // One entry per open parenthesis: whether it sits inside a :not().
  const negated: boolean[] = []
  let openingNot = false
  let i = 0
  while (i < selector.length) {
    const ch = selector[i]!
    if (ch === '\\') {
      out += selector.slice(i, i + 2)
      i += 2
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < selector.length && selector[j] !== ch) j += selector[j] === '\\' ? 2 : 1
      out += selector.slice(i, j + 1)
      i = j + 1
    } else if (ch === '(') {
      negated.push(openingNot || (negated.at(-1) ?? false))
      openingNot = false
      out += ch
      i++
    } else if (ch === ')') {
      negated.pop()
      out += ch
      i++
    } else if (ch === ':' && selector[i + 1] !== ':' && selector[i - 1] !== ':') {
      const name = /^:([-\w]+)/.exec(selector.slice(i))?.[1] ?? ''
      const token = TOKENS[name.toLowerCase()]
      const end = i + 1 + name.length
      // Inside :not() the pseudo-class is left alone: `:not(:hover)` keeps matching
      // the resting element, which is what the page shows by default.
      if (token && selector[end] !== '(' && !(negated.at(-1) ?? false)) {
        out += `[${STATE_ATTR}~="${token}"]`
        changed = true
      } else {
        out += selector.slice(i, end)
        openingNot = name.toLowerCase() === 'not' && selector[end] === '('
      }
      i = end
    } else {
      out += ch
      i++
    }
  }
  return changed ? out : null
}

/**
 * Rewrites a selector list, keeping only the selectors that depend on a state.
 * `a:hover, b` becomes `a[data-pr-state~="hover"]`; `b` alone gives null.
 */
export function rewriteSelector(selector: string): string | null {
  const kept = splitTopLevel(selector)
    .map(rewriteComplex)
    .filter((s): s is string => s !== null)
  return kept.length ? kept.join(', ') : null
}

/** Resolves a nested rule's selector against its parent rule's. */
export function resolveNested(selector: string, parent: string): string {
  return splitTopLevel(selector)
    .map((s) => (s.includes('&') ? s.replaceAll('&', `:is(${parent})`) : `:is(${parent}) ${s}`))
    .join(', ')
}

type AnyRule = CSSRule & {
  selectorText?: string
  style?: CSSStyleDeclaration
  cssRules?: CSSRuleList
  styleSheet?: CSSStyleSheet | null
}

function rulesOf(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules
  } catch {
    return null // Cross-origin sheet: unreadable by design.
  }
}

/** The page's state rules rewritten as attribute rules, plus their selectors. */
export function collectStateRules(doc: Document): { css: string; selectors: string[] } {
  const css: string[] = []
  const selectors: string[] = []
  const visit = (rules: CSSRuleList | null, parent: string | null, wrappers: AnyRule[]) => {
    for (const rule of Array.from(rules ?? []) as AnyRule[]) {
      if (typeof rule.selectorText === 'string') {
        const full = parent ? resolveNested(rule.selectorText, parent) : rule.selectorText
        const rewritten = rewriteSelector(full)
        const declarations = rule.style?.cssText
        if (rewritten && declarations) {
          // Re-open the same @media, @supports, @layer or @container blocks.
          let text = `${rewritten}{${declarations}}`
          for (const w of [...wrappers].reverse())
            text = `${w.cssText.slice(0, w.cssText.indexOf('{')).trim()}{${text}}`
          css.push(text)
          selectors.push(rewritten)
        }
        if (rule.cssRules?.length) visit(rule.cssRules, full, wrappers)
      } else if (rule.styleSheet) {
        visit(rulesOf(rule.styleSheet), parent, wrappers)
      } else if (rule.cssRules) {
        visit(rule.cssRules, parent, [...wrappers, rule])
      }
    }
  }
  const sheets = [...Array.from(doc.styleSheets), ...(doc.adoptedStyleSheets ?? [])]
  for (const sheet of sheets) visit(rulesOf(sheet), null, [])
  return { css: css.join('\n'), selectors }
}

/**
 * Puts an element into a state the way a browser would: hover and active also
 * apply to every ancestor, focus-within to the focused element and its
 * ancestors, and pressing implies hovering. Returns the undo.
 */
export function markState(el: Element, state: InteractionState): () => void {
  const own = { hover: 'hover', active: 'hover active', focus: 'focus focus-within' }[state]
  const ancestors = { hover: 'hover', active: 'hover active', focus: 'focus-within' }[state]
  const marked: Element[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    node.setAttribute(STATE_ATTR, node === el ? own : ancestors)
    marked.push(node)
  }
  return () => {
    for (const node of marked) node.removeAttribute(STATE_ATTR)
  }
}
