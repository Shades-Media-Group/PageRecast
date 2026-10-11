import type { ComponentChildren, JSX } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { icons, type IconName } from '@pagerecast/icons'
import {
  LOCALE_NAMES,
  LOCALES,
  localizeLabel,
  t,
  themeName,
  type LocaleChoice,
} from '@pagerecast/i18n'
import { WORDMARK } from './brand'
import { layoutLineup, type LineupFrame } from './lineup'
import './tokens.css'
import './components.css'

export type { IconName, LineupFrame }

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
      viewBox="0 0 24 24"
      fill="currentColor"
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
}: JSX.HTMLAttributes<HTMLButtonElement> & {
  icon: IconName
  label: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
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
    <section class={title ? 'pr-section' : 'pr-section pr-section--bare'}>
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
      {onDismiss ? (
        <IconButton icon="close" label={t('common.dismiss')} onClick={onDismiss} />
      ) : (
        <span />
      )}
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

/**
 * The interface language row for both apps' settings: automatic (the
 * browser's or Figma's language), or one of the languages in its own name.
 */
export function InterfaceLanguage({
  value,
  onChange,
}: {
  value: LocaleChoice
  onChange: (value: LocaleChoice) => void
}) {
  return (
    <label class="pr-prop pr-prop--wide">
      <span>{t('language.interface')}</span>
      <select
        class="pr-input"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as LocaleChoice)}
      >
        <option value="">{t('language.automatic')}</option>
        {LOCALES.map((locale) => (
          <option value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The panel's own theme. Light is the default; "auto" follows the system or Figma. */
export type Appearance = 'light' | 'dark' | 'auto'

/** Applies an appearance to the page; tokens.css reads `data-theme`. */
export function applyAppearance(value: Appearance) {
  document.documentElement.dataset.theme = value
}

export function InterfaceTheme({
  value,
  onChange,
}: {
  value: Appearance
  onChange: (value: Appearance) => void
}) {
  return (
    <div class="pr-prop pr-prop--wide">
      <span>{t('appearance.label')}</span>
      <Segmented
        label={t('appearance.label')}
        value={value}
        onChange={onChange}
        options={[
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
          { value: 'auto', label: t('appearance.auto') },
        ]}
      />
    </div>
  )
}

/**
 * The frames of a capture, each a crop of the top of its own screenshot, at
 * their true relative widths on one baseline and captioned with width and
 * theme. Frames without a screenshot are drawn as empty frames in their theme.
 */
export function FrameLineup({
  frames,
  maxHeight = 88,
}: {
  frames: LineupFrame[]
  maxHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setAvail(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const groups = avail ? layoutLineup(frames, avail, maxHeight) : []
  return (
    <div
      class="pr-lineup"
      ref={ref}
      role="img"
      aria-label={frames.map((f) => localizeLabel(f.label)).join(', ')}
    >
      {groups.map((g) => (
        <div class="pr-lineup__group" style={{ width: `${g.box}px` }}>
          <div class="pr-lineup__tiles">
            {g.tiles.map((t) =>
              t.src ? (
                <img src={t.src} alt="" width={t.w} height={t.h} title={localizeLabel(t.label)} />
              ) : (
                <span
                  class={`pr-lineup__empty pr-lineup__empty--${t.theme}`}
                  style={{ width: `${t.w}px`, height: `${t.h}px` }}
                  title={localizeLabel(t.label)}
                />
              ),
            )}
          </div>
          <p class="pr-lineup__width num">{g.width}</p>
          <p class="pr-lineup__theme">{g.tiles.map((tile) => themeName(tile.theme)).join(' · ')}</p>
        </div>
      ))}
    </div>
  )
}
