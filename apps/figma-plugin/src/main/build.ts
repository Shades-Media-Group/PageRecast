import type {
  Capture,
  Color,
  FrameNode as SceneFrame,
  InteractionState,
  RecastFile,
  SceneNode as Scene,
  TextNode as SceneText,
  TextStyle,
} from '@pagerecast/scene'
import type {
  ImageBytes,
  ImageTiles,
  ImportOptions,
  ImportReport,
  MainToUi,
} from '../shared/messages'
import { FontResolver } from './fonts'
import { rotatedTransform } from './geometry'
import { hex, imagePaint, solid, toBlend, toEffects, toPaints } from './paints'
import { differences, findPatterns, type Difference, type Pattern } from './patterns'
import { withState } from './states'
import {
  applyLocalStyles,
  createTextStyles,
  createVariables,
  type ColorRef,
  type TextRef,
} from './tokens'

const CAPTURE_GAP = 160
const REFERENCE_GAP = 80
const YIELD_EVERY = 150
const VARIANT_GAP = 24
const STATE_NAMES: Record<InteractionState, string> = {
  hover: 'Hover',
  focus: 'Focus',
  active: 'Active',
}

type Parent = BaseNode & ChildrenMixin
type Progress = (message: MainToUi) => void

const TEXT_CASE: Record<TextStyle['transform'], TextCase> = {
  none: 'ORIGINAL',
  uppercase: 'UPPER',
  lowercase: 'LOWER',
  capitalize: 'TITLE',
}
const DECORATION: Record<TextStyle['decoration'], TextDecoration> = {
  none: 'NONE',
  underline: 'UNDERLINE',
  'line-through': 'STRIKETHROUGH',
}
const ALIGN: Record<SceneText['align'], 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'> = {
  left: 'LEFT',
  center: 'CENTER',
  right: 'RIGHT',
  justify: 'JUSTIFIED',
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function countNodes(node: Scene): number {
  return 1 + (node.type === 'frame' ? node.children.reduce((sum, c) => sum + countNodes(c), 0) : 0)
}

function* textStyles(node: Scene): Generator<TextStyle> {
  if (node.type === 'text') for (const run of node.runs) yield run.style
  if (node.type === 'frame') for (const child of node.children) yield* textStyles(child)
}

export async function importFile(
  file: RecastFile,
  imageBytes: ImageBytes,
  tiles: ImageTiles,
  options: ImportOptions,
  progress: Progress,
): Promise<ImportReport> {
  const started = Date.now()
  const report: ImportReport = {
    frames: 0,
    texts: 0,
    images: 0,
    vectors: 0,
    rasters: 0,
    autoLayouts: 0,
    components: 0,
    instances: 0,
    reusedStyles: 0,
    variables: 0,
    textStyles: 0,
    substitutions: [],
    warnings: [],
    durationMs: 0,
  }

  // Images first: every later step only needs their hashes.
  const hashes = new Map<string, string>()
  for (const [id, bytes] of Object.entries(imageBytes)) {
    try {
      hashes.set(id, figma.createImage(bytes).hash)
    } catch {
      report.warnings.push(`An image could not be decoded (${id}).`)
    }
  }

  // Fonts: resolve every style used, then load them all in parallel.
  progress({ type: 'progress', phase: 'fonts', done: 0, total: 1 })
  const fonts = new FontResolver()
  await fonts.init()
  const wanted = new Map<string, FontName>()
  for (const capture of file.captures) {
    for (const style of textStyles(capture.root)) {
      const font = fonts.resolve(style)
      wanted.set(`${font.family}|${font.style}`, font)
    }
  }
  wanted.set('Inter|Regular', { family: 'Inter', style: 'Regular' })
  await fonts.load([...wanted.values()])
  progress({ type: 'progress', phase: 'fonts', done: 1, total: 1 })

  const total = file.captures.reduce((sum, c) => sum + countNodes(c.root), 0)
  let done = 0
  const colorRefs: ColorRef[] = []
  const textRefs: TextRef[] = []
  // While building state variants: nested states stay plain layers (components
  // cannot nest), and only the Default variant feeds variables and text styles.
  let inComponent = false
  let collectRefs = true
  const componentFrames = new Map<Capture, FrameNode>()
  // Repeated patterns, per capture. While a main component is built, nested
  // patterns stay plain layers and every built node is recorded, so each
  // occurrence's overrides can find their counterpart in its instance.
  const patterns = new Map<Capture, Map<SceneFrame, Pattern>>()
  const mains = new Map<
    Pattern,
    { component: ComponentNode; scene: SceneFrame; paths: Map<Scene, number[]> }
  >()
  const componentNames = new Set<string>()
  let recording: Map<Scene, SceneNode> | null = null

  const fontFor = (style: TextStyle): FontName => {
    const font = fonts.resolve(style)
    return fonts.isLoaded(font) ? font : { family: 'Inter', style: 'Regular' }
  }

  async function tick() {
    done++
    if (done % YIELD_EVERY === 0) {
      progress({ type: 'progress', phase: 'layers', done, total })
      await nextTick()
    }
  }

  function place(node: SceneNode, scene: Scene, ox: number, oy: number) {
    node.x = scene.x - ox
    node.y = scene.y - oy
    if (scene.opacity !== undefined && 'opacity' in node) node.opacity = scene.opacity
    if (scene.blend && 'blendMode' in node) node.blendMode = toBlend(scene.blend)
    if (scene.rotation)
      node.relativeTransform = rotatedTransform(
        node.x,
        node.y,
        node.width,
        node.height,
        scene.rotation,
      )
  }

  const nameOf = (scene: Scene) => (options.htmlNames && scene.html ? scene.html : scene.name)

  function size(node: SceneNode & LayoutMixin, width: number, height: number) {
    node.resize(Math.max(width, 0.01), Math.max(height, 0.01))
  }

  function buildText(
    scene: SceneText,
    parent: Parent,
    ox: number,
    oy: number,
    capture: Capture,
  ): TextNode | null {
    const characters = scene.runs.map((r) => r.text).join('')
    if (!characters.trim()) return null
    const text = figma.createText()
    parent.appendChild(text)
    const base = scene.style
    text.fontName = fontFor(base)
    text.characters = characters
    text.name = options.htmlNames && scene.html ? scene.html : scene.name
    text.fontSize = base.fontSize
    text.lineHeight = base.lineHeight
      ? { value: base.lineHeight, unit: 'PIXELS' }
      : { unit: 'AUTO' }
    text.letterSpacing = { value: base.letterSpacing, unit: 'PIXELS' }
    text.textCase = TEXT_CASE[base.transform]
    text.textDecoration = DECORATION[base.decoration]
    text.textAlignHorizontal = ALIGN[scene.align]
    text.fills = scene.paint
      ? toPaints([scene.paint], scene.width, scene.height, hashes)
      : [solid(base.color)]

    // Per-run overrides, only where a run differs from the base style.
    let start = 0
    for (const run of scene.runs) {
      const end = start + run.text.length
      const s = run.style
      if (end > start) {
        const font = fontFor(s)
        if (
          font.family !== (text.fontName as FontName).family ||
          font.style !== (text.fontName as FontName).style
        )
          text.setRangeFontName(start, end, font)
        if (s.fontSize !== base.fontSize) text.setRangeFontSize(start, end, s.fontSize)
        if (!scene.paint && hex(s.color) + s.color.a !== hex(base.color) + base.color.a)
          text.setRangeFills(start, end, [solid(s.color)])
        if (s.letterSpacing !== base.letterSpacing)
          text.setRangeLetterSpacing(start, end, { value: s.letterSpacing, unit: 'PIXELS' })
        if (s.lineHeight !== base.lineHeight)
          text.setRangeLineHeight(
            start,
            end,
            s.lineHeight ? { value: s.lineHeight, unit: 'PIXELS' } : { unit: 'AUTO' },
          )
        if (s.decoration !== base.decoration)
          text.setRangeTextDecoration(start, end, DECORATION[s.decoration])
        if (s.transform !== base.transform)
          text.setRangeTextCase(start, end, TEXT_CASE[s.transform])
        if (s.href && options.hyperlinks)
          text.setRangeHyperlink(start, end, { type: 'URL', value: s.href })
      }
      start = end
    }

    if (scene.shadows?.length) text.effects = toEffects(scene.shadows)
    if (scene.opacity !== undefined) text.opacity = scene.opacity

    if (scene.lines <= 1) {
      // Single lines size to their content, anchored by alignment, so a font
      // that runs slightly wider never wraps onto a second line.
      text.textAutoResize = 'WIDTH_AND_HEIGHT'
      const anchor =
        scene.align === 'center'
          ? scene.x + scene.width / 2 - text.width / 2
          : scene.align === 'right'
            ? scene.x + scene.width - text.width
            : scene.x
      text.x = anchor - ox
      text.y = scene.y + (scene.height - text.height) / 2 - oy
    } else {
      text.resize(Math.max(scene.width, 1), Math.max(scene.height, 1))
      text.textAutoResize = 'HEIGHT'
      text.x = scene.x - ox
      text.y = scene.y - oy
    }
    if (scene.rotation)
      text.relativeTransform = rotatedTransform(
        text.x,
        text.y,
        text.width,
        text.height,
        scene.rotation,
      )

    report.texts++
    if (!collectRefs) return text
    if (!scene.paint && scene.runs.length === 1)
      colorRefs.push({ node: text, kind: 'text', color: base.color, key: scene.key, capture })
    if (
      scene.runs.length === 1 ||
      scene.runs.every(
        (r) => fontFor(r.style).style === fontFor(base).style && r.style.fontSize === base.fontSize,
      )
    ) {
      textRefs.push({ node: text, style: base, font: fontFor(base) })
    }
    return text
  }

  function buildSvg(
    markup: string,
    scene: Scene,
    parent: Parent,
    ox: number,
    oy: number,
  ): SceneNode {
    try {
      const svg = figma.createNodeFromSvg(markup)
      parent.appendChild(svg)
      svg.name = nameOf(scene)
      svg.clipsContent = false
      if (Math.abs(svg.width - scene.width) > 0.5 || Math.abs(svg.height - scene.height) > 0.5) {
        svg.rescale(
          Math.min(
            scene.width / Math.max(svg.width, 0.01),
            scene.height / Math.max(svg.height, 0.01),
          ),
        )
      }
      place(svg, scene, ox, oy)
      report.vectors++
      return svg
    } catch {
      report.warnings.push(
        `A vector could not be converted and was left as an empty frame (${scene.name}).`,
      )
      const frame = figma.createFrame()
      parent.appendChild(frame)
      frame.name = `${scene.name} (unsupported SVG)`
      frame.fills = []
      size(frame, scene.width, scene.height)
      place(frame, scene, ox, oy)
      return frame
    }
  }

  function sideBorders(frame: FrameNode, scene: SceneFrame) {
    const stroke = scene.stroke!
    const [top, right, bottom, left] = stroke.widths
    const colors = stroke.sides!
    const sides: [number, number, number, number, Color, number][] = [
      [0, 0, scene.width, top, colors[0], top],
      [scene.width - right, 0, right, scene.height, colors[1], right],
      [0, scene.height - bottom, scene.width, bottom, colors[2], bottom],
      [0, 0, left, scene.height, colors[3], left],
    ]
    for (const [x, y, w, h, color, weight] of sides) {
      if (weight <= 0 || color.a === 0) continue
      const rect = figma.createRectangle()
      frame.appendChild(rect)
      rect.name = 'Border'
      rect.resize(Math.max(w, 0.01), Math.max(h, 0.01))
      rect.x = x
      rect.y = y
      rect.fills = [solid(color)]
      if (frame.layoutMode !== 'NONE') rect.layoutPositioning = 'ABSOLUTE'
    }
  }

  function tryAutoLayout(frame: FrameNode, scene: SceneFrame, kids: [SceneNode, Scene][]): boolean {
    const layout = scene.layout!
    const before = kids.map(([node]) => ({ x: node.x, y: node.y, w: node.width, h: node.height }))
    const row = layout.direction === 'row'
    const borders = scene.stroke?.widths ?? [0, 0, 0, 0]
    frame.layoutMode = row ? 'HORIZONTAL' : 'VERTICAL'
    frame.layoutWrap = row && layout.wrap ? 'WRAP' : 'NO_WRAP'
    frame.primaryAxisSizingMode = 'FIXED'
    frame.counterAxisSizingMode = 'FIXED'
    frame.paddingTop = layout.padding[0] + borders[0]
    frame.paddingRight = layout.padding[1] + borders[1]
    frame.paddingBottom = layout.padding[2] + borders[2]
    frame.paddingLeft = layout.padding[3] + borders[3]
    frame.itemSpacing = row ? layout.gap[1] : layout.gap[0]
    if (frame.layoutWrap === 'WRAP') frame.counterAxisSpacing = layout.gap[0]
    frame.primaryAxisAlignItems = (
      { start: 'MIN', center: 'CENTER', end: 'MAX', 'space-between': 'SPACE_BETWEEN' } as const
    )[layout.justify]
    frame.counterAxisAlignItems = (
      {
        start: 'MIN',
        center: 'CENTER',
        end: 'MAX',
        stretch: 'MIN',
        baseline: row ? 'BASELINE' : 'MIN',
      } as const
    )[layout.align]
    kids.forEach(([node, sceneKid], i) => {
      const absolute =
        sceneKid.type === 'frame' &&
        (sceneKid.position === 'absolute' || sceneKid.position === 'fixed')
      if (absolute && 'layoutPositioning' in node) {
        node.layoutPositioning = 'ABSOLUTE'
        node.x = before[i]!.x
        node.y = before[i]!.y
      }
    })
    // Keep Auto Layout only if every child lands where the page put it.
    const drift = kids.some(([node, sceneKid], i) => {
      if (
        sceneKid.type === 'frame' &&
        (sceneKid.position === 'absolute' || sceneKid.position === 'fixed')
      )
        return false
      const b = before[i]!
      return (
        Math.abs(node.x - b.x) > 1.5 ||
        Math.abs(node.y - b.y) > 1.5 ||
        Math.abs(node.width - b.w) > 1.5 ||
        Math.abs(node.height - b.h) > 1.5
      )
    })
    if (!drift) return true
    frame.layoutMode = 'NONE'
    kids.forEach(([node], i) => {
      const b = before[i]!
      if ('layoutPositioning' in node) node.layoutPositioning = 'AUTO'
      node.x = b.x
      node.y = b.y
      if (
        'resize' in node &&
        (Math.abs(node.width - b.w) > 0.01 || Math.abs(node.height - b.h) > 0.01) &&
        node.type !== 'TEXT'
      ) {
        ;(node as FrameNode).resize(Math.max(b.w, 0.01), Math.max(b.h, 0.01))
      }
    })
    return false
  }

  async function build(
    scene: Scene,
    parent: Parent,
    ox: number,
    oy: number,
    capture: Capture,
  ): Promise<SceneNode | null> {
    await tick()
    const node = await buildNode(scene, parent, ox, oy, capture)
    if (node && recording) recording.set(scene, node)
    return node
  }

  async function buildNode(
    scene: Scene,
    parent: Parent,
    ox: number,
    oy: number,
    capture: Capture,
  ): Promise<SceneNode | null> {
    switch (scene.type) {
      case 'text':
        return buildText(scene, parent, ox, oy, capture)
      case 'svg': {
        const asset = file.assets[scene.asset]
        return asset?.kind === 'svg' ? buildSvg(asset.markup, scene, parent, ox, oy) : null
      }
      case 'image': {
        const asset = file.assets[scene.asset]
        if (asset?.kind === 'svg') return buildSvg(asset.markup, scene, parent, ox, oy)
        const rect = figma.createRectangle()
        parent.appendChild(rect)
        rect.name = nameOf(scene)
        size(rect, scene.width, scene.height)
        const hash = hashes.get(scene.asset)
        rect.fills = hash
          ? [imagePaint(hash, scene.fit)]
          : [solid({ r: 0.9, g: 0.9, b: 0.9, a: 1 })]
        if (!hash)
          report.warnings.push(
            `An image could not be loaded and was replaced by a placeholder (${scene.name}).`,
          )
        if (scene.radius)
          [rect.topLeftRadius, rect.topRightRadius, rect.bottomRightRadius, rect.bottomLeftRadius] =
            scene.radius
        place(rect, scene, ox, oy)
        report.images++
        return rect
      }
      case 'raster': {
        const rect = figma.createRectangle()
        parent.appendChild(rect)
        const hash = scene.asset ? hashes.get(scene.asset) : undefined
        rect.name = hash ? `${scene.name} (snapshot)` : `${scene.name} (not captured)`
        size(rect, scene.width, scene.height)
        rect.fills = hash
          ? [imagePaint(hash, 'fill')]
          : [solid({ r: 0.93, g: 0.93, b: 0.94, a: 1 })]
        place(rect, scene, ox, oy)
        report.rasters++
        return rect
      }
      case 'frame': {
        if (scene.states && !inComponent) return buildStates(scene, parent, ox, oy, capture)
        const pattern = !inComponent && !recording ? patterns.get(capture)?.get(scene) : undefined
        if (pattern) return buildPattern(scene, pattern, parent, ox, oy, capture)
        const frame = figma.createFrame()
        parent.appendChild(frame)
        frame.name = nameOf(scene)
        size(frame, scene.width, scene.height)
        frame.fills = toPaints(scene.fills, scene.width, scene.height, hashes)
        frame.clipsContent = scene.clips
        if (scene.radius)
          [
            frame.topLeftRadius,
            frame.topRightRadius,
            frame.bottomRightRadius,
            frame.bottomLeftRadius,
          ] = scene.radius
        if (scene.stroke && !scene.stroke.sides) {
          const [top, right, bottom, left] = scene.stroke.widths
          frame.strokes = [solid(scene.stroke.color)]
          frame.strokeAlign = 'INSIDE'
          frame.strokeTopWeight = top
          frame.strokeRightWeight = right
          frame.strokeBottomWeight = bottom
          frame.strokeLeftWeight = left
          const w = Math.max(top, right, bottom, left)
          if (scene.stroke.style === 'dashed') frame.dashPattern = [w * 3, w * 2]
          if (scene.stroke.style === 'dotted') frame.dashPattern = [w, w]
        }
        frame.effects = toEffects(scene.shadows, scene.blur, scene.backdropBlur)
        if (scene.a11y?.alt) frame.setPluginData('alt', scene.a11y.alt)

        // ponytail: children of rotated frames keep their page-space boxes; exact
        // un-rotation of nested content is a later refinement.
        const kids: [SceneNode, Scene][] = []
        for (const child of scene.children) {
          const node = await build(child, frame, scene.x, scene.y, capture)
          if (node) kids.push([node, child])
        }
        if (options.autoLayout && scene.layout && kids.length > 0 && !scene.rotation) {
          if (tryAutoLayout(frame, scene, kids)) report.autoLayouts++
        }
        if (scene.stroke?.sides) sideBorders(frame, scene)
        place(frame, scene, ox, oy)
        report.frames++
        const first = scene.fills[0]
        if (collectRefs && scene.fills.length === 1 && first?.type === 'solid')
          colorRefs.push({ node: frame, kind: 'fill', color: first.color, key: scene.key, capture })
        return frame
      }
    }
  }

  /**
   * An element with recorded states becomes a component set (State=Default,
   * Hover, Focus, Active) and an instance of Default where the element sat, so
   * the page frame looks exactly as before. The sets go in one "Components"
   * frame beside their capture, inside the import's section: the page stays a
   * clean copy, every state is in one place, and each width and theme keeps its
   * own components because their looks differ.
   */
  function componentsFrame(capture: Capture): FrameNode {
    let container = componentFrames.get(capture)
    if (!container) {
      container = figma.createFrame()
      section.appendChild(container)
      container.name = `Components · ${capture.label}`
      container.fills = []
      container.layoutMode = 'VERTICAL'
      container.primaryAxisSizingMode = 'AUTO'
      container.counterAxisSizingMode = 'AUTO'
      container.itemSpacing = VARIANT_GAP * 2
      componentFrames.set(capture, container)
    }
    return container
  }

  /** A name not yet used by a component of this capture: "Card", "Card 2", … */
  function componentName(scene: Scene, capture: Capture) {
    const base = nameOf(scene)
    let name = base
    for (let i = 2; componentNames.has(`${capture.id}|${name}`); i++) name = `${base} ${i}`
    componentNames.add(`${capture.id}|${name}`)
    return name
  }

  async function buildStates(
    scene: SceneFrame,
    parent: Parent,
    ox: number,
    oy: number,
    capture: Capture,
  ): Promise<SceneNode> {
    const container = componentsFrame(capture)
    const variants: ComponentNode[] = []
    inComponent = true
    try {
      for (const state of ['default', 'hover', 'focus', 'active'] as const) {
        const overrides = state === 'default' ? {} : scene.states?.[state]
        if (!overrides) continue
        collectRefs = state === 'default'
        const patched = withState(scene, overrides)
        delete patched.rotation
        const frame = (await build(patched, container, patched.x, patched.y, capture)) as FrameNode
        const component = figma.createComponentFromNode(frame)
        component.name = `State=${state === 'default' ? 'Default' : STATE_NAMES[state]}`
        variants.push(component)
      }
    } finally {
      inComponent = false
      collectRefs = true
    }
    const set = figma.combineAsVariants(variants, container)
    set.name = componentName(scene, capture)
    report.components++
    set.fills = []
    set.layoutMode = 'HORIZONTAL'
    set.primaryAxisSizingMode = 'AUTO'
    set.counterAxisSizingMode = 'AUTO'
    set.itemSpacing = VARIANT_GAP
    set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = VARIANT_GAP
    const instance = variants[0]!.createInstance()
    parent.appendChild(instance)
    place(instance, scene, ox, oy)
    return instance
  }

  /**
   * A repeated pattern: the first occurrence becomes a main component in the
   * capture's Components frame, and every occurrence (that one included)
   * becomes an instance with its own text, links and images as overrides.
   */
  async function buildPattern(
    scene: SceneFrame,
    pattern: Pattern,
    parent: Parent,
    ox: number,
    oy: number,
    capture: Capture,
  ): Promise<SceneNode> {
    let main = mains.get(pattern)
    if (!main) {
      const recorded = new Map<Scene, SceneNode>()
      recording = recorded
      let frame: FrameNode
      try {
        frame = (await buildNode(
          scene,
          componentsFrame(capture),
          scene.x,
          scene.y,
          capture,
        )) as FrameNode
      } finally {
        recording = null
      }
      // Child indices from the main's root: an instance mirrors them exactly.
      const paths = new Map<Scene, number[]>([[scene, []]])
      for (const [node, built] of recorded) {
        const path: number[] = []
        let at: BaseNode = built
        while (at !== frame && at.parent && 'children' in at.parent) {
          path.unshift(at.parent.children.indexOf(at as SceneNode))
          at = at.parent
        }
        if (at === frame) paths.set(node, path)
      }
      const component = figma.createComponentFromNode(frame)
      component.name = componentName(scene, capture)
      main = { component, scene, paths }
      mains.set(pattern, main)
      report.components++
    } else {
      done += countNodes(scene) - 1
    }
    const instance = main.component.createInstance()
    parent.appendChild(instance)
    place(instance, scene, ox, oy)
    for (const diff of differences(main.scene, scene)) {
      let target: SceneNode | undefined = instance
      for (const i of main.paths.get(diff.node) ?? [-1])
        target = target && 'children' in target ? target.children[i] : undefined
      if (target) override(target, diff)
    }
    report.instances++
    return instance
  }

  function override(node: SceneNode, diff: Difference) {
    try {
      if (node.type === 'TEXT') {
        if (diff.text !== undefined) node.characters = diff.text
        if (diff.name !== undefined && !options.htmlNames) node.name = diff.name
        if (diff.href !== undefined && options.hyperlinks)
          node.setRangeHyperlink(
            0,
            node.characters.length,
            diff.href ? { type: 'URL', value: diff.href } : null,
          )
      } else if (diff.asset !== undefined && 'fills' in node) {
        const hash = hashes.get(diff.asset)
        const fit = diff.node.type === 'image' ? diff.node.fit : 'fill'
        node.fills = hash ? [imagePaint(hash, fit)] : [solid({ r: 0.9, g: 0.9, b: 0.9, a: 1 })]
      } else if (diff.fills && 'fills' in node) {
        node.fills = toPaints(diff.fills, node.width, node.height, hashes)
      }
    } catch {
      report.warnings.push(`An instance could not take its own content (${node.name}).`)
    }
  }

  // Lay captures out left to right, each followed by its screenshot reference.
  const section = figma.createSection()
  section.name = file.source.title || new URL(file.source.url).hostname
  let cursor = 0
  let tallest = 0
  const roots = new Map<Capture, FrameNode>()
  for (const capture of file.captures) {
    if (options.components) patterns.set(capture, findPatterns(capture.root, file.assets))
    const root = (await build(capture.root, section, -cursor, 0, capture)) as FrameNode
    root.name = `${section.name} · ${capture.label}`
    root.x = cursor
    root.y = 0
    roots.set(capture, root)
    cursor += root.width
    tallest = Math.max(tallest, root.height)

    const strips = capture.screenshot ? tiles[capture.screenshot] : undefined
    if (options.screenshot && strips?.length) {
      const reference = figma.createFrame()
      section.appendChild(reference)
      reference.name = `Reference · ${capture.label}`
      size(reference, capture.width, capture.height)
      reference.x = cursor + REFERENCE_GAP
      reference.y = 0
      reference.fills = []
      for (const strip of strips) {
        const hash = hashes.get(strip.key)
        if (!hash) continue
        const rect = figma.createRectangle()
        reference.appendChild(rect)
        rect.name = 'Screenshot'
        rect.resize(capture.width, Math.max(strip.height * capture.height, 0.01))
        rect.y = strip.y * capture.height
        rect.fills = [imagePaint(hash, 'fill')]
      }
      reference.locked = true
      cursor += REFERENCE_GAP + capture.width
    }
    const components = componentFrames.get(capture)
    if (components) {
      components.x = cursor + REFERENCE_GAP
      components.y = 0
      cursor += REFERENCE_GAP + components.width
      tallest = Math.max(tallest, components.height)
    }
    cursor += CAPTURE_GAP
  }

  progress({ type: 'progress', phase: 'styles', done: 0, total: 1 })
  // Styles already in the file win; only what is left gets new variables and styles.
  if (options.useLocalStyles) report.reusedStyles = await applyLocalStyles(colorRefs, textRefs)
  if (options.variables) report.variables = createVariables(colorRefs, file, roots)
  if (options.textStyles) report.textStyles = await createTextStyles(textRefs, file)

  // Put the section beside whatever is already on the page.
  const padding = 120
  section.resizeWithoutConstraints(cursor - CAPTURE_GAP + padding * 2, tallest + padding * 2)
  for (const child of section.children) {
    child.x += padding
    child.y += padding
  }
  const others = figma.currentPage.children.filter((n) => n !== section)
  section.x = others.length
    ? Math.max(...others.map((n) => n.x + n.width)) + 400
    : Math.round(figma.viewport.center.x)
  section.y = others.length
    ? Math.min(...others.map((n) => n.y))
    : Math.round(figma.viewport.center.y)
  figma.currentPage.selection = [section]
  figma.viewport.scrollAndZoomIntoView([section])

  report.substitutions = fonts.report()
  report.durationMs = Date.now() - started
  return report
}
