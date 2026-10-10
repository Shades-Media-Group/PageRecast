import type { ComponentChildren, JSX } from 'preact'
import { icons, type IconName } from '@pagerecast/icons'
import { WORDMARK } from './brand'
import './tokens.css'
import './components.css'

export type { IconName }

export const CREDIT = { company: 'Shades Media Group', url: 'https://shades.md' }
export const REPO_URL = 'https://github.com/Shades-Media-Group/PageRecast'
export const DOCS_URL = `${REPO_URL}/tree/main/docs/guides`

export function Icon({
  name,
  size = 16,
  class: className = '',
}: {
  name: IconName
  size?: number
  class?: string
}) {
  return (
    <svg
      class={`pr-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  )
}

const PAGE =
  'M21 26H49A13 13 0 0 1 62 39V73A13 13 0 0 1 49 86H21A13 13 0 0 1 8 73V39A13 13 0 0 1 21 26Z'
const LAYER =
  'M47 10H75A13 13 0 0 1 88 23V57A13 13 0 0 1 75 70H47A13 13 0 0 1 34 57V23A13 13 0 0 1 47 10Z'
const OVERLAP = 'M34 26H49A13 13 0 0 1 62 39V70H47A13 13 0 0 1 34 57Z'

/** The PageRecast mark: a page and a layer, overlapping. */
export function Logomark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" class="pr-icon">
      <path fill="var(--mark-red)" d={PAGE} />
      <path fill="var(--rose)" d={LAYER} />
      <path fill="var(--ink)" d={OVERLAP} />
    </svg>
  )
}

/** Mark plus outlined wordmark, the primary logo. */
export function Logo({ height = 16 }: { height?: number }) {
  const markSize = WORDMARK.capHeight * 1.9
  const gap = markSize * 0.3
  const width = markSize + gap + WORDMARK.width
  const scale = markSize / 96
  return (
    <svg
      class="pr-logo"
      height={height}
      width={(height * width) / markSize}
      viewBox={`0 0 ${width} ${markSize}`}
      role="img"
      aria-label="PageRecast"
    >
      <g transform={`scale(${scale})`}>
        <path fill="var(--mark-red)" d={PAGE} />
        <path fill="var(--rose)" d={LAYER} />
        <path fill="var(--ink)" d={OVERLAP} />
      </g>
      <path
        fill="currentColor"
        transform={`translate(${markSize + gap} ${markSize / 2 + WORDMARK.capHeight / 2})`}
        d={WORDMARK.d}
      />
    </svg>
  )
}

type ButtonProps = JSX.HTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  block?: boolean
  icon?: IconName
  disabled?: boolean
  type?: 'button' | 'submit'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  children,
  class: className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'pr-button',
    `pr-button--${variant}`,
    size === 'lg' && 'pr-button--lg',
    block && 'pr-button--block',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} class={classes} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  ...rest
}: JSX.HTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" class="pr-icon-button" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  )
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div class="pr-tabs" role="tablist">
      {options.map((o) => (
        <button
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; icon?: IconName }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div class="pr-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label class="pr-toggle">
      <span>
        <span class="pr-toggle__label">{label}</span>
        {hint && <span class="pr-toggle__hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    </label>
  )
}

export function Section({
  title,
  aside,
  children,
}: {
  title?: string
  aside?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class="pr-section">
      {title && (
        <div class="pr-section-head">
          <h2>{title}</h2>
          {aside && <span>{aside}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Message({
  tone = 'info',
  children,
  onDismiss,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  children: ComponentChildren
  onDismiss?: () => void
}) {
  const icon: IconName =
    tone === 'warning'
      ? 'warning'
      : tone === 'error'
        ? 'error'
        : tone === 'success'
          ? 'check'
          : 'info'
  return (
    <div class={`pr-message pr-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={16} />
      <div>{children}</div>
      {onDismiss ? <IconButton icon="close" label="Dismiss" onClick={onDismiss} /> : <span />}
    </div>
  )
}

export function Progress({ value }: { value: number }) {
  return (
    <div
      class="pr-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, value))})` }} />
    </div>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export interface FrameSpec {
  width: number
  theme: 'light' | 'dark'
}

/** Reads "Desktop · 1440 · Dark" style labels back into widths and themes. */
export function framesFromLabels(labels: string[]): FrameSpec[] {
  return labels.map((label) => ({
    width: Number(/(\d{3,4})/.exec(label)?.[1] ?? 1440),
    theme: /dark/i.test(label) ? 'dark' : 'light',
  }))
}

/**
 * A capture drawn with the logo's rule: each frame is a tile sized to its
 * width, light frames in rose, dark frames in red, and where a light and a
 * dark frame of the same width overlap, the overlap turns ink.
 */
export function FramesGraphic({ frames, height = 72 }: { frames: FrameSpec[]; height?: number }) {
  const widths = [...new Set(frames.map((f) => f.width))].sort((a, b) => b - a)
  const unit = height * 1.35
  const offset = Math.round(height * 0.34)
  const radius = Math.round(height * 0.12)
  let x = 0
  const groups = widths.map((width) => {
    const w = Math.max(height * 0.42, Math.round((width / 1440) * unit))
    const light = frames.some((f) => f.width === width && f.theme === 'light')
    const dark = frames.some((f) => f.width === width && f.theme === 'dark')
    const group = { width, x, w, light, dark }
    x += w + (light && dark ? offset : 0) + Math.round(height * 0.22)
    return group
  })
  const total = Math.max(1, x - Math.round(height * 0.22))
  const h = height + offset
  return (
    <svg
      class="pr-frames"
      width={total}
      height={h + 18}
      viewBox={`0 0 ${total} ${h + 18}`}
      role="img"
      aria-label={`${frames.length} frames`}
    >
      {groups.map((g, i) => {
        const page = { x: g.x, y: offset, w: g.w, h: height }
        const layer = { x: g.x + offset, y: 0, w: g.w, h: height }
        const id = `pr-frame-clip-${i}`
        return (
          <g>
            {g.light && (
              <rect
                x={page.x}
                y={page.y}
                width={page.w}
                height={page.h}
                rx={radius}
                fill="var(--rose)"
              />
            )}
            {g.dark && (
              <rect
                x={g.light ? layer.x : page.x}
                y={g.light ? layer.y : page.y}
                width={layer.w}
                height={layer.h}
                rx={radius}
                fill="var(--mark-red)"
              />
            )}
            {g.light && g.dark && (
              <>
                <clipPath id={id}>
                  <rect x={page.x} y={page.y} width={page.w} height={page.h} rx={radius} />
                </clipPath>
                <rect
                  clip-path={`url(#${id})`}
                  x={layer.x}
                  y={layer.y}
                  width={layer.w}
                  height={layer.h}
                  rx={radius}
                  fill="var(--ink)"
                />
              </>
            )}
            <text
              x={g.x}
              y={h + 14}
              fill="var(--ink-3)"
              font-size="11"
              font-family="var(--font)"
              style="font-variant-numeric: tabular-nums"
            >
              {g.width}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
