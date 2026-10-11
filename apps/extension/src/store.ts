import type { LocaleChoice } from '@pagerecast/i18n'
import type { Appearance } from '@pagerecast/ui'
import type { Scope, Theme } from '@pagerecast/scene'

export interface Settings {
  /** The panel's own language; '' follows the browser. Not the page's language below. */
  interfaceLanguage: LocaleChoice
  /** The panel's own theme: light unless dark or automatic is chosen. */
  appearance: Appearance
  scope: Scope
  widths: number[]
  customWidths: number[]
  theme: Theme | 'both'
  hideOverlays: boolean
  preload: boolean
  screenshot: boolean
  /** Hover, focus and active looks, imported as component variants. */
  states: boolean
  /** The language the captured page is loaded in; '' keeps the page's own. */
  language: string
  /** CSS selectors, comma separated, of elements to leave out; remembered per site. */
  hide: string
  /** Milliseconds to wait before reading the page, for content that arrives late. */
  delay: number
  /** Full-page captures stop at this height in CSS pixels; 0 for no limit. */
  maxHeight: number
  seenDebuggerNote: boolean
  /** Settings stay folded into a summary once the user has captured. */
  editing: boolean
}

export const PRESET_WIDTHS = [
  { width: 1440, label: 'Desktop', icon: 'desktop' },
  { width: 1280, label: 'Laptop', icon: 'laptop' },
  { width: 768, label: 'Tablet', icon: 'tablet' },
  { width: 390, label: 'Mobile', icon: 'mobile' },
] as const

export const DEFAULT_SETTINGS: Settings = {
  interfaceLanguage: '',
  appearance: 'light',
  scope: 'page',
  widths: [1440],
  customWidths: [],
  theme: 'light',
  hideOverlays: true,
  preload: true,
  screenshot: true,
  states: true,
  language: '',
  hide: '',
  delay: 0,
  maxHeight: 0,
  seenDebuggerNote: false,
  editing: true,
}

/** Languages offered for capture, each in its own name; '' is the page's own language. */
export const LANGUAGES = [
  { value: '', label: '' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'uk-UA', label: 'Українська' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'es-ES', label: 'Español' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pl-PL', label: 'Polski' },
  { value: 'nl-NL', label: 'Nederlands' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'ar', label: 'العربية' },
] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whole CSS pixel widths PageRecast can capture, widest first, each once. */
const validWidths = (value: unknown): number[] | undefined =>
  Array.isArray(value)
    ? [
        ...new Set(value.filter((w): w is number => Number.isInteger(w) && w >= 240 && w <= 3840)),
      ].sort((a, b) => b - a)
    : undefined

/**
 * Settings saved by any earlier version, brought up to date: fields it did
 * not have yet (1.0 had no states, wait, hidden elements, maximum height or
 * panel theme) take their default, and values of the wrong shape fall back.
 */
export function migrateSettings(input: unknown): Settings {
  const saved = isObject(input) ? input : {}
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    const value = saved[key]
    if (typeof value === typeof DEFAULT_SETTINGS[key] && !Array.isArray(value))
      Object.assign(settings, { [key]: value })
  }
  settings.widths = validWidths(saved.widths) ?? DEFAULT_SETTINGS.widths
  settings.customWidths = validWidths(saved.customWidths) ?? []
  const pick = <T>(value: T, allowed: readonly T[], fallback: T) =>
    allowed.includes(value) ? value : fallback
  settings.appearance = pick(settings.appearance, ['light', 'dark', 'auto'], 'light')
  settings.scope = pick(settings.scope, ['page', 'viewport', 'element'], 'page')
  settings.theme = pick(settings.theme, ['light', 'dark', 'both'], 'light')
  settings.delay = pick(settings.delay, [0, 1000, 3000, 5000], 0)
  settings.maxHeight = Math.max(0, Math.round(settings.maxHeight) || 0)
  return settings
}

/**
 * The preferences after "Reset all preferences". Whether the debugging note
 * was seen and whether the settings are open are not preferences, so they stay.
 */
export const resetSettings = ({ seenDebuggerNote, editing }: Settings): Settings => ({
  ...DEFAULT_SETTINGS,
  seenDebuggerNote,
  editing,
})

/** Whether any preference differs from its default. */
export const preferencesChanged = (settings: Settings) =>
  JSON.stringify(settings) !== JSON.stringify(resetSettings(settings))

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings')
  return migrateSettings(settings)
}

export function saveSettings(settings: Settings) {
  return chrome.storage.local.set({ settings })
}

/** Area, widths, theme and hidden elements are remembered per site; the rest is global. */
export type SitePrefs = Pick<Settings, 'scope' | 'widths' | 'theme' | 'hide'>
export const SITE_KEYS = ['scope', 'widths', 'theme', 'hide'] as const

export async function loadSite(host: string): Promise<Partial<SitePrefs>> {
  const { sites } = await chrome.storage.local.get('sites')
  return (sites as Record<string, SitePrefs> | undefined)?.[host] ?? {}
}

/** How many sites have a remembered area, widths, theme or hidden elements. */
export async function countSites(): Promise<number> {
  const { sites } = await chrome.storage.local.get('sites')
  return Object.keys((sites as object | undefined) ?? {}).length
}

/** Back to the defaults: the settings, and everything remembered per site. */
export async function resetPreferences(settings: Settings): Promise<Settings> {
  const next = resetSettings(settings)
  await chrome.storage.local.set({ settings: next })
  await chrome.storage.local.remove('sites')
  return next
}

export async function saveSite(host: string, prefs: SitePrefs) {
  const { sites } = await chrome.storage.local.get('sites')
  await chrome.storage.local.set({ sites: { ...(sites as object | undefined), [host]: prefs } })
}

/** A capture asked for from the right-click menu or a shortcut, waiting for the panel. */
export interface PendingCapture {
  scope: 'page' | 'element'
  tabId: number
  windowId: number
  /** When it was asked for, so a request the panel never picked up can expire. */
  at: number
}

/** A capture kept for re-use: the encoded file plus what the list shows. */
export interface HistoryEntry {
  id: string
  title: string
  url: string
  createdAt: number
  views: string[]
  layers: number
  bytes: number
  thumbnail?: string
  data: Uint8Array
}

const DB = 'pagerecast'
const STORE = 'captures'
const KEEP = 12

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(request.result)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = await run<HistoryEntry[]>('readonly', (s) => s.getAll() as IDBRequest<HistoryEntry[]>)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addHistory(entry: HistoryEntry) {
  await run('readwrite', (s) => s.put(entry))
  const all = await listHistory()
  for (const old of all.slice(KEEP)) await removeHistory(old.id)
}

export function removeHistory(id: string) {
  return run('readwrite', (s) => s.delete(id))
}
