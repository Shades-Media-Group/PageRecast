/**
 * Builds every page of the site in every language, before Vite sees them.
 *
 * Each page is one template in templates/ with {{key}} placeholders, and each
 * language is one dictionary in i18n/. The plugin writes the finished HTML next
 * to the sources (index.html, sample/index.html, fr/index.html, …; all
 * gitignored) and hands them to Rollup as inputs, so crawlers get static,
 * translated HTML and Vite bundles the scripts and styles as usual.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { LINKS } from './src/links'

const root = fileURLToPath(new URL('.', import.meta.url))
export const SITE = 'https://pagerecast.shades.md'

export const LOCALES = [{ code: 'en', lang: 'en', og: 'en_US', name: 'English' }] as const
type Locale = (typeof LOCALES)[number]

export const PAGES = [
  { id: 'home', path: '' },
  { id: 'sample', path: 'sample/' },
  { id: 'gallery', path: 'gallery/' },
  { id: 'privacy', path: 'privacy/' },
  { id: 'capture', path: 'capture/', noindex: true },
] as const
type Page = (typeof PAGES)[number]

type Dict = { [key: string]: string | Dict }

/** Path of a page in a language: /gallery/, /fr/gallery/. */
export const pathOf = (locale: Locale, page: Page) =>
  `/${locale.code === 'en' ? '' : `${locale.code}/`}${page.path}`

const dictionary = (code: string): Dict =>
  JSON.parse(readFileSync(join(root, 'i18n', `${code}.json`), 'utf8')) as Dict

function lookup(dict: Dict, key: string, code: string): string {
  const value = key
    .split('.')
    .reduce<string | Dict | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      dict,
    )
  if (typeof value !== 'string') throw new Error(`i18n/${code}.json has no string "${key}"`)
  return value
}

/** Dictionary text is trusted HTML; quotes are escaped so it also fits in attributes. */
const html = (text: string) => text.replaceAll('"', '&quot;')

function render(locale: Locale, page: Page): string {
  const dict = dictionary(locale.code)
  const base = pathOf(locale, PAGES[0])
  const template = readFileSync(join(root, 'templates', page.path, 'index.html'), 'utf8')
  const t = (key: string) => lookup(dict, key, locale.code)
  const runtime = (dict[page.id] as Dict).runtime
  const specials: Record<string, () => string> = {
    lang: () => locale.lang,
    base: () => base,
    head: () =>
      [
        `<title>${t(`${page.id}.title`)}</title>`,
        `<meta name="description" content="${html(t(`${page.id}.description`))}" />`,
        `<link rel="canonical" href="${SITE}${pathOf(locale, page)}" />`,
        'noindex' in page ? '<meta name="robots" content="noindex" />' : '',
      ]
        .filter(Boolean)
        .join('\n    '),
    langs: () => '',
    langlist: () => '',
  }
  return (
    template
      .replace(/\{\{(@?)([\w.]+)\}\}/g, (_, special: string, key: string) =>
        special ? specials[key]!() : html(t(key)),
      )
      // Outbound links get their address at build time, so they work without script.
      .replace(/data-link=(["'])(\w+)\1/g, (_, _quote: string, key: string) => {
        const href = LINKS[key]
        if (!href) throw new Error(`No link named "${key}" (${page.id})`)
        return `href="${href}" rel="noopener"`
      })
      // Strings the scripts need, read by main.ts and capture.ts.
      .replace(
        '</body>',
        runtime
          ? `  <script type="application/json" id="strings">${JSON.stringify(runtime).replaceAll('<', '\\u003c')}</script>\n  </body>`
          : '</body>',
      )
  )
}

/** Writes every page in every language and returns them as Rollup inputs. */
function generate(): Record<string, string> {
  const inputs: Record<string, string> = {}
  for (const locale of LOCALES) {
    for (const page of PAGES) {
      const file = join(root, pathOf(locale, page), 'index.html')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, render(locale, page))
      inputs[`${page.id}-${locale.code}`] = file
    }
  }
  return inputs
}

export function pages(): Plugin {
  return {
    name: 'pagerecast-pages',
    config: () => ({ build: { rollupOptions: { input: generate() } } }),
    configureServer(server) {
      const sources = [join(root, 'templates'), join(root, 'i18n')]
      server.watcher.add(sources)
      server.watcher.on('change', (file) => {
        if (!sources.some((dir) => file.startsWith(dir))) return
        generate()
        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}
