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
      <div style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

/**
 * The stage drawing: a web page and a Figma layer panel overlapping, with the
 * paste key where they meet. It is the logo's idea, told as the workflow.
 */
export function RecastDrawing({ keyLabel = '⌘V' }: { keyLabel?: string }) {
  return (
    <svg
      class="pr-drawing"
      viewBox="0 0 368 168"
      role="img"
      aria-label="A web page pasted into Figma as layers"
    >
      <g>
        <rect
          x="20.5"
          y="16.5"
          width="196"
          height="132"
          rx="9"
          fill="var(--raised)"
          stroke="var(--line-strong)"
        />
        <circle cx="34" cy="29" r="2.5" fill="var(--line-strong)" />
        <circle cx="42" cy="29" r="2.5" fill="var(--line-strong)" />
        <circle cx="50" cy="29" r="2.5" fill="var(--line-strong)" />
        <rect x="62" y="24" width="96" height="10" rx="5" fill="var(--hover)" />
        <path d="M20.5 41.5h196" stroke="var(--line)" />
        <rect x="36" y="56" width="84" height="11" rx="2" fill="var(--mark-red)" />
        <rect x="36" y="75" width="140" height="5" rx="2.5" fill="var(--line-strong)" />
        <rect x="36" y="86" width="118" height="5" rx="2.5" fill="var(--line-strong)" />
        <rect x="36" y="97" width="128" height="5" rx="2.5" fill="var(--line-strong)" />
        <rect x="36" y="113" width="52" height="22" rx="4" fill="var(--rose)" opacity="0.55" />
        <rect x="94" y="113" width="52" height="22" rx="4" fill="var(--hover)" />
      </g>
      <g>
        <rect x="150" y="44" width="198" height="112" rx="9" fill="var(--ink)" />
        {(
          [
            ['frame', 'Page', 0, 62],
            ['frame', 'Header', 12, 81],
            ['text', 'Heading', 24, 100],
            ['image', 'Image', 24, 119],
            ['text', 'Paragraph', 24, 138],
          ] as const
        ).map(([kind, label, indent, y]) => (
          <g
            transform={`translate(${228 + indent} ${y})`}
            stroke="var(--bg)"
            stroke-opacity="0.6"
            fill="none"
            stroke-width="1.1"
            stroke-linecap="round"
          >
            {kind === 'frame' && <path d="M2 -6v9M6 -6v9M-0.5 -3.5h9M-0.5 0.5h9" />}
            {kind === 'text' && <path d="M0 -5.5h8M4 -5.5v8.5" />}
            {kind === 'image' && <path d="M0 -6h8v8h-8zM0 1l2.6-2.6 2 2 1.2-1.2L8 1.4" />}
            <text
              x="15"
              y="2.5"
              stroke="none"
              fill="var(--bg)"
              fill-opacity={indent === 0 ? 1 : 0.72}
              font-size="10"
              font-family="var(--font)"
              font-weight={indent === 0 ? 600 : 400}
            >
              {label}
            </text>
          </g>
        ))}
      </g>
      <g class="pr-drawing-key">
        <rect x="157" y="82" width="54" height="30" rx="7" fill="var(--mark-red)" />
        <text
          x="184"
          y="102"
          text-anchor="middle"
          fill="#fff"
          font-size="13"
          font-weight="600"
          font-family="var(--font)"
        >
          {keyLabel}
        </text>
      </g>
    </svg>
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
