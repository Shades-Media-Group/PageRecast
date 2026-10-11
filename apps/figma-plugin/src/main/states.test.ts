import { describe, expect, it } from 'vitest'
import type { FrameNode, TextNode } from '@pagerecast/scene'
import { withState } from './states'

const black = { r: 0, g: 0, b: 0, a: 1 }
const red = { r: 1, g: 0, b: 0, a: 1 }
const style = {
  fontFamily: ['Arial'],
  fontWeight: 400,
  italic: false,
  fontSize: 16,
  lineHeight: null,
  letterSpacing: 0,
  color: black,
  decoration: 'none' as const,
  transform: 'none' as const,
}
const label: TextNode = {
  type: 'text',
  id: 'n2',
  key: 'b/#text',
  name: 'Save',
  tag: 'button',
  x: 116,
  y: 58,
  width: 40,
  height: 20,
  style,
  runs: [{ text: 'Save', style }],
  align: 'left',
  lines: 1,
}
const button: FrameNode = {
  type: 'frame',
  id: 'n1',
  key: 'b',
  name: 'Button',
  tag: 'button',
  x: 100,
  y: 50,
  width: 80,
  height: 36,
  fills: [{ type: 'solid', color: black }],
  stroke: { widths: [1, 1, 1, 1], color: black, style: 'solid' },
  radius: [8, 8, 8, 8],
  clips: true,
  position: 'static',
  children: [label],
}

describe('withState', () => {
  it('applies overrides to a copy, leaving the default untouched', () => {
    const hover = withState(button, {
      b: { fills: [{ type: 'solid', color: red }], stroke: null, opacity: 0.5 },
      'b/#text': { color: red, decoration: 'underline' },
    })
    expect(hover.fills).toEqual([{ type: 'solid', color: red }])
    expect(hover.stroke).toBeUndefined()
    expect(hover.opacity).toBe(0.5)
    const text = hover.children[0] as TextNode
    expect(text.style).toMatchObject({ color: red, decoration: 'underline' })
    expect(text.runs[0]!.style.color).toEqual(red)
    expect(button.fills[0]).toEqual({ type: 'solid', color: black })
    expect(label.style.color).toEqual(black)
  })

  it('draws an outline as a ring outside the border box', () => {
    const focus = withState(button, {
      b: { outline: { width: 2, offset: 2, color: red, style: 'solid' } },
    })
    const ring = focus.children.at(-1) as FrameNode
    expect(ring).toMatchObject({
      x: 96,
      y: 46,
      width: 88,
      height: 44,
      radius: [12, 12, 12, 12],
      position: 'absolute',
      stroke: { widths: [2, 2, 2, 2], color: red },
    })
    expect(focus.clips).toBe(false)
  })
})
