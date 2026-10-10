import type { Scope, Theme } from '@pagerecast/scene'

export interface Settings {
  scope: Scope
  widths: number[]
  customWidths: number[]
  theme: Theme | 'both'
  hideOverlays: boolean
  preload: boolean
  screenshot: boolean
  seenDebuggerNote: boolean
}

export const PRESET_WIDTHS = [
  { width: 1440, label: 'Desktop', icon: 'desktop' },
  { width: 1280, label: 'Laptop', icon: 'laptop' },
  { width: 768, label: 'Tablet', icon: 'tablet' },
  { width: 390, label: 'Mobile', icon: 'mobile' },
] as const

export const DEFAULT_SETTINGS: Settings = {
  scope: 'page',
  widths: [1440],
  customWidths: [],
  theme: 'light',
  hideOverlays: true,
  preload: true,
  screenshot: true,
  seenDebuggerNote: false,
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) }
}

export function saveSettings(settings: Settings) {
  return chrome.storage.local.set({ settings })
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
