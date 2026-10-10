import type { BlendMode as SceneBlend, Color, ImageFit, Paint, Shadow } from '@pagerecast/scene'
import {
  angularGradientTransform,
  linearGradientTransform,
  radialGradientTransform,
} from './geometry'

export const rgb = (c: Color): RGB => ({ r: c.r, g: c.g, b: c.b })
export const rgba = (c: Color): RGBA => ({ r: c.r, g: c.g, b: c.b, a: c.a })

export function solid(color: Color): SolidPaint {
  return { type: 'SOLID', color: rgb(color), opacity: color.a }
}

const SCALE: Record<ImageFit, ImagePaint['scaleMode']> = {
  fill: 'FILL',
  fit: 'FIT',
  crop: 'CROP',
  tile: 'TILE',
}

export function imagePaint(hash: string, fit: ImageFit, opacity = 1): ImagePaint {
  return { type: 'IMAGE', imageHash: hash, scaleMode: SCALE[fit], opacity }
}

/** Converts scene paints; image paints need their hash from `images`. */
export function toPaints(
  paints: Paint[],
  width: number,
  height: number,
  images: Map<string, string>,
): Paint_[] {
  const out: Paint_[] = []
  for (const paint of paints) {
    switch (paint.type) {
      case 'solid':
        if (paint.color.a > 0) out.push(solid(paint.color))
        break
      case 'linear':
        out.push({
          type: 'GRADIENT_LINEAR',
          gradientTransform: linearGradientTransform(paint.angle, width, height),
          gradientStops: paint.stops.map((s) => ({ position: s.position, color: rgba(s.color) })),
        })
        break
      case 'radial':
        out.push({
          type: 'GRADIENT_RADIAL',
          gradientTransform: radialGradientTransform(paint.center, paint.radius),
          gradientStops: paint.stops.map((s) => ({ position: s.position, color: rgba(s.color) })),
        })
        break
      case 'conic':
        out.push({
          type: 'GRADIENT_ANGULAR',
          gradientTransform: angularGradientTransform(paint.angle, paint.center),
          gradientStops: paint.stops.map((s) => ({ position: s.position, color: rgba(s.color) })),
        })
        break
      case 'image': {
        const hash = images.get(paint.asset)
        if (hash) out.push(imagePaint(hash, paint.fit, paint.opacity ?? 1))
        break
      }
    }
  }
  return out
}

// Figma's Paint type name clashes with the scene's; alias it locally.
type Paint_ = globalThis.Paint

export function toEffects(shadows: Shadow[] = [], blur = 0, backdropBlur = 0): Effect[] {
  const effects: Effect[] = shadows.map((s) => ({
    type: s.inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
    color: rgba(s.color),
    offset: { x: s.x, y: s.y },
    radius: s.blur,
    spread: s.spread,
    visible: true,
    blendMode: 'NORMAL',
  }))
  // CSS blur() takes a standard deviation; Figma's radius is roughly twice that.
  if (blur > 0)
    effects.push({ type: 'LAYER_BLUR', blurType: 'NORMAL', radius: blur * 2, visible: true })
  if (backdropBlur > 0)
    effects.push({
      type: 'BACKGROUND_BLUR',
      blurType: 'NORMAL',
      radius: backdropBlur * 2,
      visible: true,
    })
  return effects
}

const BLEND: Record<SceneBlend, BlendMode> = {
  normal: 'NORMAL',
  multiply: 'MULTIPLY',
  screen: 'SCREEN',
  overlay: 'OVERLAY',
  darken: 'DARKEN',
  lighten: 'LIGHTEN',
  'color-dodge': 'COLOR_DODGE',
  'color-burn': 'COLOR_BURN',
  'hard-light': 'HARD_LIGHT',
  'soft-light': 'SOFT_LIGHT',
  difference: 'DIFFERENCE',
  exclusion: 'EXCLUSION',
  hue: 'HUE',
  saturation: 'SATURATION',
  color: 'COLOR',
  luminosity: 'LUMINOSITY',
}
export const toBlend = (blend: SceneBlend) => BLEND[blend]

export const hex = (c: Color) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()
