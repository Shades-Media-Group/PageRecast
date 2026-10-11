/** The page's language, and the translated strings pages.ts put in the page for its scripts. */
export const lang = document.documentElement.lang || 'en'

export function strings<T>(): T {
  return JSON.parse(document.getElementById('strings')?.textContent ?? '{}') as T
}

/** Fills {name} placeholders. */
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
