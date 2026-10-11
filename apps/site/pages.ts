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

const GOOGLE_G = `<svg class="pref-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>`

const entries = (node: string | Dict | undefined) => Object.values(node as Dict) as Dict[]

/** The home page questions, the how-to first, with HTML answers. */
function questions(dict: Dict) {
  const faq = (dict.home as Dict).faq as Dict
  const howto = faq.howto as Dict
  return [
    {
      q: howto.q as string,
      a: `<p>${howto.intro}</p><ol>${entries(howto.steps)
        .map((step) => `<li>${step.text}</li>`)
        .join('')}</ol>`,
    },
    ...entries(faq.items).map((item) => ({ q: item.q as string, a: `<p>${item.a}</p>` })),
  ]
}

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
    // Google's own button, as a plain link: no Google script, no cookie.
    preferred: () =>
      `<a class="pref" data-link="preferred" target="_blank">${GOOGLE_G}<span>${t('preferred.button')}</span></a>`,
    faq: () =>
      `<div class="faq-list" data-reveal>${questions(dict)
        .map(
          ({ q, a }) =>
            `\n          <div class="faq-item"><h3>${q}</h3><div class="faq-answer">${a}</div></div>`,
        )
        .join('')}\n        </div>`,
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
