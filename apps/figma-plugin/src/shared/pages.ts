import type { Capture } from '@pagerecast/scene'

/**
 * Combined files hold several pages. The extension prefixes their capture ids
 * per page ("p1-c1") and their labels with the page title ("Pricing · Desktop
 * · 1440 · Light"); a single page has neither, so it is one group.
 */
export function pageOf(capture: Capture): string {
  const dash = capture.id.indexOf('-')
  return dash > 0 ? capture.id.slice(0, dash) : pageTitle(capture)
}

/** The page title a combined file put in front of the label, or '' for a single page. */
export function pageTitle(capture: Capture): string {
  const device = capture.label.search(/ · (Desktop|Laptop|Tablet|Mobile)\b/)
  return device > 0 ? capture.label.slice(0, device) : ''
}

/** Captures grouped by page, in the order each page first appears. */
export function pageGroups(captures: Capture[]): Capture[][] {
  const groups = new Map<string, Capture[]>()
  for (const capture of captures) {
    const page = pageOf(capture)
    groups.set(page, [...(groups.get(page) ?? []), capture])
  }
  return [...groups.values()]
}
