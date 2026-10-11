/** One captured frame, shown as a crop of the top of its own screenshot. */
export interface LineupFrame {
  /** Viewport width in CSS px; frames of the same width are grouped. */
  width: number
  theme: 'light' | 'dark'
  /** Height of the crop in CSS px, usually the viewport height. */
  height: number
  /** The crop itself; without it the frame is drawn as an empty frame. */
  src?: string
  label: string
}

export interface LineupGroup {
  width: number
  /** Width reserved for the group, at least wide enough for its caption. */
  box: number
  tiles: (LineupFrame & { w: number; h: number })[]
}

export const LINEUP_GAP = 16
export const LINEUP_TILE_GAP = 4
const MIN_BOX = 48

/**
 * Lays frames out at their true relative widths on one baseline: one scale
 * for every tile, as large as fits `avail` px across and `maxHeight` px tall.
 * Groups too narrow for their caption reserve the caption's width instead.
 */
export function layoutLineup(
  frames: LineupFrame[],
  avail: number,
  maxHeight: number,
): LineupGroup[] {
  if (!frames.length) return []
  const groups = [...new Set(frames.map((f) => f.width))]
    .sort((a, b) => b - a)
    .map((width) => {
      const members = frames
        .filter((f) => f.width === width)
        .sort((a, b) => Number(a.theme === 'dark') - Number(b.theme === 'dark'))
      return { width, members, span: width * members.length }
    })
  const gaps = (g: (typeof groups)[number]) => LINEUP_TILE_GAP * (g.members.length - 1)
  const fixed = new Set<number>()
  let scale = maxHeight / Math.max(...frames.map((f) => f.height))
  for (;;) {
    const free = groups.filter((g) => !fixed.has(g.width))
    const room =
      avail -
      LINEUP_GAP * (groups.length - 1) -
      fixed.size * MIN_BOX -
      free.reduce((n, g) => n + gaps(g), 0)
    const span = free.reduce((n, g) => n + g.span, 0)
    const fit = span > 0 ? Math.min(scale, room / span) : scale
    const narrow = free.filter((g) => g.span * fit + gaps(g) < MIN_BOX)
    if (!narrow.length) {
      scale = Math.max(0, fit)
      break
    }
    for (const g of narrow) fixed.add(g.width)
  }
  return groups.map((g) => ({
    width: g.width,
    box: Math.max(MIN_BOX, Math.floor(g.span * scale + gaps(g))),
    tiles: g.members.map((f) => ({
      ...f,
      w: Math.max(2, Math.floor(f.width * scale)),
      h: Math.max(2, Math.round(f.height * scale)),
    })),
  }))
}
