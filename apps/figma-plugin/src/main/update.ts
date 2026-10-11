/**
 * Re-capture updates. Every import marks its page frame, screenshot reference
 * and Components frame with the capture they came from, so importing the same
 * page, width and theme again can replace them in place.
 */

const MARKER = 'recast'

export type Part = 'page' | 'reference' | 'components'

interface Marker {
  key: string
  part: Part
  capturedAt: string
}

export interface Imported {
  /** More than one when a marked frame was duplicated; then nothing is updated. */
  pages: FrameNode[]
  reference?: FrameNode
  components?: FrameNode
}

export function mark(node: FrameNode, key: string, part: Part, capturedAt: string) {
  node.setPluginData(MARKER, JSON.stringify({ key, part, capturedAt } satisfies Marker))
}

/**
 * Marked frames on the current page, by key.
 * ponytail: the current page only; other pages would need loadAllPagesAsync
 * and an update the user cannot see.
 */
export function findImported(): Map<string, Imported> {
  const out = new Map<string, Imported>()
  for (const node of figma.currentPage.findAllWithCriteria({
    types: ['FRAME'],
    pluginData: { keys: [MARKER] },
  })) {
    let marker: Marker
    try {
      marker = JSON.parse(node.getPluginData(MARKER)) as Marker
    } catch {
      continue
    }
    const entry = out.get(marker.key) ?? { pages: [] }
    if (marker.part === 'page') entry.pages.push(node)
    else entry[marker.part] = node
    out.set(marker.key, entry)
  }
  return out
}

/** Keys with exactly one earlier page frame, so an update knows what to replace. */
export function updatableKeys(keys: string[]): string[] {
  const imported = findImported()
  return keys.filter((key) => imported.get(key)?.pages.length === 1)
}

function within(node: BaseNode, ancestors: BaseNode[]) {
  for (let at: BaseNode | null = node; at; at = at.parent) if (ancestors.includes(at)) return true
  return false
}

/** Whether any instance of a component in `frame` lives outside `inside`. */
export async function usedElsewhere(frame: FrameNode, inside: BaseNode[]): Promise<boolean> {
  for (const component of frame.findAllWithCriteria({ types: ['COMPONENT'] }))
    for (const instance of await component.getInstancesAsync())
      if (!within(instance, inside)) return true
  return false
}

/** Puts `next` where `previous` is, in the same parent and layer order, and removes `previous`. */
export function replace(previous: FrameNode, next: FrameNode) {
  const parent = previous.parent!
  parent.insertChild(parent.children.indexOf(previous), next)
  next.x = previous.x
  next.y = previous.y
  previous.remove()
}
