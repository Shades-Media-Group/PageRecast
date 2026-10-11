import type {
  Asset,
  FrameNode as SceneFrame,
  NodeStates,
  Paint,
  SceneNode as Scene,
  TextStyle,
} from '@pagerecast/scene'

/**
 * Repeated patterns: subtrees with the same node types, tree shape, sizes and
 * styles, differing only in their text and images. The plugin builds one main
 * component per pattern and an instance with overrides at every occurrence.
 */

const MIN_OCCURRENCES = 2

/** cyrb53: a 53-bit string hash, so collisions are negligible at page scale. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

// ponytail: sizes compare after rounding to whole pixels, so two values either
// side of a .5 boundary miss each other; a clustering pass would catch those.
const px = (v: number | undefined) => Math.round(v ?? 0)

/** Paints with image assets reduced to their fit, unless `strict`. */
const paints = (list: Paint[], strict: boolean) =>
  JSON.stringify(strict ? list : list.map((p) => (p.type === 'image' ? { ...p, asset: '' } : p)))

const styleOf = ({ href: _href, ...style }: TextStyle) => style

/** States keyed relative to their element, so equal states on two elements compare equal. */
function relativeStates(states: NodeStates, key: string) {
  const out: Record<string, unknown> = {}
  for (const [state, map] of Object.entries(states))
    out[state] = Object.entries(map ?? {}).map(([k, o]) => [
      k.startsWith(key) ? k.slice(key.length) : k,
      o,
    ])
  return JSON.stringify(out)
}

/**
 * The signature of every node in `root`, bottom up. Inside an element with
 * states everything is strict (text and images must match too), because its
 * variants are built once and cannot take per-occurrence overrides.
 */
export function signatures(root: Scene, assets: Record<string, Asset>): Map<Scene, string> {
  const out = new Map<Scene, string>()
  const visit = (node: Scene, strict: boolean): string => {
    const common = [
      node.type,
      node.tag,
      px(node.height),
      node.rotation ?? 0,
      node.opacity ?? 1,
      node.blend ?? '',
    ]
    let own: unknown[]
    switch (node.type) {
      case 'frame': {
        const inner = strict || !!node.states
        const kids = node.children.map(
          (c) => `${px(c.x - node.x)},${px(c.y - node.y)}:${visit(c, inner)}`,
        )
        own = [
          ...common,
          px(node.width),
          paints(node.fills, inner),
          JSON.stringify([node.stroke, node.radius, node.shadows, node.blur, node.backdropBlur]),
          node.clips,
          node.position,
          JSON.stringify([node.layout, node.grow, node.alignSelf]),
          node.states ? relativeStates(node.states, node.key) : '',
          kids.join(';'),
        ]
        break
      }
      case 'text': {
        const plain = !strict && node.runs.length === 1
        own = [
          ...common,
          // A single left-aligned line grows to fit its text; anything else keeps its box.
          node.lines <= 1 && node.align === 'left' ? '' : px(node.width),
          node.align,
          node.lines,
          JSON.stringify([node.shadows, node.paint]),
          plain
            ? JSON.stringify([styleOf(node.style), !!node.runs[0]!.text.trim()])
            : JSON.stringify(node.runs),
        ]
        break
      }
      case 'image': {
        const vector = assets[node.asset]?.kind === 'svg'
        own = [
          ...common,
          px(node.width),
          node.fit,
          JSON.stringify(node.radius),
          strict || vector ? node.asset : '',
        ]
        break
      }
      case 'svg':
        own = [...common, px(node.width), node.asset]
        break
      case 'raster':
        own = [...common, px(node.width), node.reason, strict ? node.asset : !!node.asset]
        break
    }
    const sig = hash(JSON.stringify(own))
    out.set(node, sig)
    return sig
  }
  visit(root, false)
  return out
}

export interface Pattern {
  id: string
  /** Occurrences in build order; the first becomes the main component. */
  nodes: SceneFrame[]
}

/**
 * Finds patterns that occur at least twice, outermost first. Occurrences never
 * nest: a pattern inside another pattern's occurrence is part of that main
 * component, and one that only ever appears inside others is dropped. Elements
 * with states are left alone, since they already become component sets.
 */
export function findPatterns(
  root: SceneFrame,
  assets: Record<string, Asset>,
): Map<SceneFrame, Pattern> {
  const sigs = signatures(root, assets)
  const eligible = (node: Scene): node is SceneFrame =>
    node.type === 'frame' && !node.states && !node.rotation && node.children.length > 0
  const total = new Map<string, number>()
  const count = (node: Scene) => {
    if (node.type !== 'frame' || node.states) return
    if (eligible(node) && node !== root) {
      const sig = sigs.get(node)!
      total.set(sig, (total.get(sig) ?? 0) + 1)
    }
    node.children.forEach(count)
  }
  count(root)

  const dropped = new Set<string>()
  for (;;) {
    const found = new Map<string, SceneFrame[]>()
    const walk = (node: Scene) => {
      if (node.type !== 'frame' || node.states) return
      const sig = sigs.get(node)!
      if (
        node !== root &&
        eligible(node) &&
        (total.get(sig) ?? 0) >= MIN_OCCURRENCES &&
        !dropped.has(sig)
      ) {
        found.set(sig, [...(found.get(sig) ?? []), node])
        return
      }
      node.children.forEach(walk)
    }
    walk(root)
    const lonely = [...found].filter(([, nodes]) => nodes.length < MIN_OCCURRENCES)
    if (lonely.length === 0) {
      const out = new Map<SceneFrame, Pattern>()
      for (const [id, nodes] of found) {
        const pattern = { id, nodes }
        for (const node of nodes) out.set(node, pattern)
      }
      return out
    }
    for (const [sig] of lonely) dropped.add(sig)
  }
}

export interface Difference {
  /** The node in the main occurrence whose instance counterpart takes the override. */
  node: Scene
  text?: string
  /** Layer name of a text whose content changed. */
  name?: string
  href?: string
  /** Replacement fills (frames with background images). */
  fills?: Paint[]
  /** Replacement image asset (images and rasters). */
  asset?: string
}

/**
 * What an occurrence changes relative to the main one, found by walking both
 * in parallel. The two have equal signatures, so their shapes match.
 */
export function differences(main: Scene, other: Scene): Difference[] {
  const out: Difference[] = []
  const walk = (a: Scene, b: Scene) => {
    if (a.type === 'text' && b.type === 'text') {
      const text = b.runs.map((r) => r.text).join('')
      const href = b.style.href
      const diff: Difference = { node: a }
      if (text !== a.runs.map((r) => r.text).join('')) {
        diff.text = text
        if (b.name !== a.name) diff.name = b.name
      }
      if (href !== a.style.href) diff.href = href ?? ''
      if (diff.text !== undefined || diff.href !== undefined) out.push(diff)
    } else if (
      (a.type === 'image' && b.type === 'image') ||
      (a.type === 'raster' && b.type === 'raster')
    ) {
      if (a.asset !== b.asset && b.asset) out.push({ node: a, asset: b.asset })
    } else if (a.type === 'frame' && b.type === 'frame') {
      if (JSON.stringify(a.fills) !== JSON.stringify(b.fills)) out.push({ node: a, fills: b.fills })
      a.children.forEach((child, i) => {
        const counterpart = b.children[i]
        if (counterpart) walk(child, counterpart)
      })
    }
  }
  walk(main, other)
  return out
}
