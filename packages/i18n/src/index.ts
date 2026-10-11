/**
 * The interface language of both apps: typed dictionaries, `t(key, vars)` with
 * plurals from Intl.PluralRules, and Intl formatting for numbers, sizes and
 * relative times. One locale is active at a time; each app sets it on start.
 */
import { en, type Plural } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'
import { ro } from './locales/ro'
import { ru } from './locales/ru'
import { zhCN } from './locales/zh-CN'

export type { Plural }
export type MessageKey = keyof typeof en
/** Every locale has every English key: a string, or plural forms where English has them. */
export type Messages = { [K in MessageKey]: (typeof en)[K] extends string ? string : Plural }

export const LOCALES = ['en', 'fr', 'ro', 'ru', 'es', 'zh-CN'] as const
export type Locale = (typeof LOCALES)[number]
/** The interface language setting: a locale, or '' to follow the browser or Figma. */
export type LocaleChoice = Locale | ''

export const DICTIONARIES: Record<Locale, Messages> = { en, fr, ro, ru, es, 'zh-CN': zhCN }

/** Each language in its own name, for the language menus. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ro: 'Română',
  ru: 'Русский',
  es: 'Español',
  'zh-CN': '简体中文',
}

/** The first of the user's languages PageRecast speaks, else English. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const lower = tag.toLowerCase()
    const base = lower.split('-')[0]
    // Traditional Chinese readers are better served by English than by Simplified.
    if (base === 'zh') {
      if (/-(tw|hk|mo|hant)\b/.test(lower)) continue
      return 'zh-CN'
    }
    // Moldovan is Romanian.
    if (base === 'mo') return 'ro'
    const match = LOCALES.find((l) => l === base)
    if (match) return match
  }
  return 'en'
}

const browserLanguages = (): readonly string[] =>
  typeof navigator === 'undefined'
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language]

/** The locale for a setting: the chosen one, or the browser's when automatic. */
export function resolveLocale(choice: string | undefined, languages = browserLanguages()): Locale {
  return LOCALES.find((l) => l === choice) ?? detectLocale(languages)
}

let locale: Locale = 'en'
let messages: Messages = en

export function setLocale(next: Locale) {
  locale = next
  messages = DICTIONARIES[next]
  if (typeof document !== 'undefined') document.documentElement.lang = next
}

export const getLocale = () => locale

type Vars = Record<string, string | number>

const numberFormats = new Map<string, Intl.NumberFormat>()
function numberFormat(options: Intl.NumberFormatOptions = {}) {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = numberFormats.get(key)
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(locale, options)))
  return format
}

export const formatNumber = (n: number, options?: Intl.NumberFormatOptions) =>
  numberFormat(options).format(n)

function pick(key: MessageKey, vars?: Vars): string {
  const value = messages[key] ?? en[key]
  if (typeof value === 'string') return value
  const count = Number(vars?.count ?? 0)
  return value[new Intl.PluralRules(locale).select(count)] ?? value.other
}

/** The message for a key, with `{name}` placeholders filled; numbers are formatted. */
export function t(key: MessageKey, vars?: Vars): string {
  return pick(key, vars).replace(/\{(\w+)\}/g, (all, name: string) => {
    const value = vars?.[name]
    if (value === undefined) return all
    return typeof value === 'number' ? formatNumber(value) : value
  })
}

/**
 * Like `t`, for messages with markup inside: placeholders may be elements,
 * and the result is the parts in order, ready to render as children.
 */
export function rich<T>(
  key: MessageKey,
  vars: Record<string, string | number | T>,
): (string | T)[] {
  const plain: Vars = {}
  for (const [name, value] of Object.entries(vars))
    if (typeof value === 'string' || typeof value === 'number') plain[name] = value
  return pick(key, plain)
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (!name || !(name in vars)) return part
      const value = vars[name] as string | number | T
      return typeof value === 'number' ? formatNumber(value) : value
    })
}

/** Bytes as B, kB or MB in the locale's own units. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return formatNumber(bytes, { style: 'unit', unit: 'byte' })
  if (bytes < 1024 * 1024)
    return formatNumber(Math.round(bytes / 1024), { style: 'unit', unit: 'kilobyte' })
  return formatNumber(bytes / 1024 / 1024, {
    style: 'unit',
    unit: 'megabyte',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Milliseconds as seconds, one decimal where it says something. */
export const formatSeconds = (ms: number, digits = 1) =>
  t('unit.seconds', {
    n: formatNumber(ms / 1000, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  })

/** How long ago a moment was: just now, minutes, hours, then the date. */
export function formatAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60000)
  if (minutes < 1) return t('time.justNow')
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (minutes < 60) return format.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  return hours < 24 ? format.format(-hours, 'hour') : new Date(ms).toLocaleDateString(locale)
}

const DEVICES = {
  desktop: 'device.desktop',
  laptop: 'device.laptop',
  tablet: 'device.tablet',
  mobile: 'device.mobile',
} as const

/** The device a width stands for, by the rule the capture engine names frames with. */
export const deviceName = (width: number) =>
  t(
    width >= 1200
      ? DEVICES.desktop
      : width >= 1000
        ? DEVICES.laptop
        : width >= 600
          ? DEVICES.tablet
          : DEVICES.mobile,
  )

export const themeName = (theme: 'light' | 'dark') =>
  t(theme === 'dark' ? 'theme.dark' : 'theme.light')

/** A frame's name, such as "Desktop · 1440 · Light", in this language. */
export const frameName = (width: number, theme: 'light' | 'dark') =>
  t('frame.name', { device: deviceName(width), width: String(width), theme: themeName(theme) })

/**
 * Frame labels are stored in captures in English ("Desktop · 1440 · Light",
 * after the page title in a combined file). Shown here in this language;
 * any other label is shown as it is.
 */
export function localizeLabel(label: string): string {
  const match = /^(.* · )?(Desktop|Laptop|Tablet|Mobile) · (\d+) · (Light|Dark)$/.exec(label)
  if (!match) return label
  const device = t(DEVICES[match[2]!.toLowerCase() as keyof typeof DEVICES])
  const theme = themeName(match[4] === 'Dark' ? 'dark' : 'light')
  return `${match[1] ?? ''}${t('frame.name', { device, width: match[3]!, theme })}`
}

/** Messages other packages raise in English, shown in this language when known. */
const ENGLISH: MessageKey[] = [
  'error.clipboardIncomplete',
  'error.damaged',
  'error.notCapture',
  'error.newer',
  'error.empty',
  'error.captureScript',
]

export function fromEnglish(message: string): string {
  const key = ENGLISH.find((k) => en[k] === message)
  return key ? t(key) : message
}
