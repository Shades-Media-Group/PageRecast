import type { ComponentChildren, JSX } from 'preact'
import { icons, type IconName } from '@pagerecast/icons'
import './tokens.css'
import './components.css'

export type { IconName }

export function Icon({
  name,
  size = 20,
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

/** The PageRecast mark: a page and a layer, overlapping. */
export function Logomark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" class="pr-icon">
      <path
        fill="var(--mark-red)"
        d="M21 26H49A13 13 0 0 1 62 39V73A13 13 0 0 1 49 86H21A13 13 0 0 1 8 73V39A13 13 0 0 1 21 26Z"
      />
      <path
        fill="var(--rose)"
        d="M47 10H75A13 13 0 0 1 88 23V57A13 13 0 0 1 75 70H47A13 13 0 0 1 34 57V23A13 13 0 0 1 47 10Z"
      />
      <path fill="var(--ink)" d="M34 26H49A13 13 0 0 1 62 39V70H47A13 13 0 0 1 34 57Z" />
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
      {icon && <Icon name={icon} size={18} />}
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
      <Icon name={icon} size={18} />
    </button>
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
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  icon,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
  icon: IconName
}) {
  return (
    <label class="pr-switch">
      <Icon name={icon} size={18} class="pr-switch__icon" />
      <span>
        <span class="pr-switch__label">{label}</span>
        {hint && <span class="pr-switch__hint">{hint}</span>}
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

export function Notice({
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
    <div class={`pr-notice pr-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} size={18} />
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

export const CREDIT = {
  name: 'Cristian Brinza',
  company: 'Shades Media Group',
  url: 'https://shades.md',
}
export const REPO_URL = 'https://github.com/Shades-Media-Group/PageRecast'
export const DOCS_URL = `${REPO_URL}/tree/main/docs`

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
