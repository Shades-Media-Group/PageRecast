import type { LocaleChoice } from '@pagerecast/i18n'
import type { Scope, Theme } from '@pagerecast/scene'

export interface Settings {
  /** The panel's own language; '' follows the browser. Not the page's language below. */
  interfaceLanguage: LocaleChoice
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

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) }
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
