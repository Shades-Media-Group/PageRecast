import type {
  FrameNode as SceneFrame,
  Outline,
  SceneNode as Scene,
  StateOverride,
} from '@pagerecast/scene'

/**
 * A copy of `scene` with one state's overrides applied. The plugin builds it
 * with the same code as the default look, so a variant differs only where the
 * page did.
 */
export function withState(scene: SceneFrame, overrides: Record<string, StateOverride>): SceneFrame {
  const copy = JSON.parse(JSON.stringify(scene)) as SceneFrame
  apply(copy, overrides)
  return copy
}

function apply(node: Scene, overrides: Record<string, StateOverride>) {
  if (node.type === 'frame') for (const child of node.children) apply(child, overrides)
  const o = overrides[node.key]
  if (!o) return
  for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const)
    if (o[k] !== undefined) node[k] = o[k]
  if (node.type === 'text') {
    for (const style of [node.style, ...node.runs.map((r) => r.style)]) {
      if (o.color) style.color = o.color
      if (o.decoration) style.decoration = o.decoration
    }
  }
  if (node.type !== 'frame') return
  if (o.fills) node.fills = o.fills
  if (o.shadows) node.shadows = o.shadows
  if (o.stroke === null) delete node.stroke
  else if (o.stroke) node.stroke = o.stroke
  if (o.radius === null) delete node.radius
  else if (o.radius) node.radius = o.radius
  if (o.outline) {
    node.children.push(outlineRing(node, o.outline))
    node.clips = false
  }
}

/** CSS outlines sit outside the border box; draw one as an unfilled frame around it. */
function outlineRing(node: SceneFrame, outline: Outline): SceneFrame {
  const grow = outline.offset + outline.width
  const w = outline.width
  return {
    type: 'frame',
    id: `${node.id}-outline`,
    key: `${node.key}/#outline`,
    name: 'Outline',
    tag: 'outline',
    x: node.x - grow,
    y: node.y - grow,
    width: node.width + grow * 2,
    height: node.height + grow * 2,
    fills: [],
    stroke: { widths: [w, w, w, w], color: outline.color, style: outline.style },
    ...(node.radius
      ? { radius: node.radius.map((r) => (r > 0 ? r + grow : 0)) as SceneFrame['radius'] }
      : {}),
    clips: false,
    position: 'absolute',
    children: [],
  }
}
