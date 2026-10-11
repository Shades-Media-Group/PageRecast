import type { ImageFit, RecastFile, SceneNode } from '@pagerecast/scene'

/** One place an image is drawn: the box it fills and how. */
export interface ImageUse {
  width: number
  height: number
  fit: ImageFit
}

function collect(node: SceneNode, into: Map<string, ImageUse[]>) {
  const add = (asset: string, fit: ImageFit) =>
    into.set(asset, [...(into.get(asset) ?? []), { width: node.width, height: node.height, fit }])
  if (node.type === 'image' || node.type === 'raster') {
    if (node.asset) add(node.asset, node.type === 'image' ? node.fit : 'fill')
  } else if (node.type === 'text') {
    if (node.paint?.type === 'image') add(node.paint.asset, node.paint.fit)
  } else if (node.type === 'frame') {
    for (const paint of node.fills) if (paint.type === 'image') add(paint.asset, paint.fit)
    for (const child of node.children) collect(child, into)
  }
}

/** Every box each image asset is drawn in, across all captures. */
export function imageUses(file: RecastFile): Map<string, ImageUse[]> {
  const uses = new Map<string, ImageUse[]>()
  for (const capture of file.captures) collect(capture.root, uses)
  return uses
}

/** Images keep twice the pixels they show on the page, for sharp 2× exports. */
const DENSITY = 2

/**
 * How much an image of `width` × `height` pixels can be scaled down and still
 * show at twice its on-page size everywhere it is used: 1 keeps it as it is.
 * Tiled images and images used nowhere are kept.
 */
export function shrinkFactor(uses: ImageUse[] | undefined, width: number, height: number): number {
  if (!uses?.length || width <= 0 || height <= 0) return 1
  let needed = 0
  for (const use of uses) {
    if (use.fit === 'tile') return 1
    const sx = use.width / width
    const sy = use.height / height
    // Cover crops, so the larger ratio decides; contain fits, so the smaller one.
    needed = Math.max(needed, use.fit === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy))
  }
  return Math.min(1, needed * DENSITY)
}
