/**
 * Builds every page of the site in every language, before Vite sees them.
 *
 * Each page is one template in templates/ with {{key}} placeholders, and each
 * language is one dictionary in i18n/. The plugin writes the finished HTML next
 * to the sources (index.html, sample/index.html, fr/index.html, …; all
 * gitignored) and hands them to Rollup as inputs, so crawlers get static,
 * translated HTML and Vite bundles the scripts and styles as usual.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { CHROME, FIGMA, LINKS, REPO, SHADES } from './src/links'

const root = fileURLToPath(new URL('.', import.meta.url))
export const SITE = 'https://pagerecast.shades.md'
const { version } = JSON.parse(readFileSync(join(root, '../../package.json'), 'utf8')) as {
  version: string
}

/** The languages the site is written in. English is the default, at the root. */
export const LOCALES = [
  { code: 'en', lang: 'en', og: 'en_US', name: 'English' },
  { code: 'fr', lang: 'fr', og: 'fr_FR', name: 'Français' },
  { code: 'ro', lang: 'ro', og: 'ro_RO', name: 'Română' },
  { code: 'ru', lang: 'ru', og: 'ru_RU', name: 'Русский' },
  { code: 'es', lang: 'es', og: 'es_ES', name: 'Español' },
  { code: 'zh', lang: 'zh-Hans', og: 'zh_CN', name: '中文' },
] as const
type Locale = (typeof LOCALES)[number]

/**
 * More languages, machine-translated from the English page by Google's
 * translation proxy: a plain link, no script, and nofollow so the copies stay
 * out of search results. [language, Google's code, name].
 */
// Off until the shades.md zone lets Google's translation proxy through: today
// Cloudflare answers pagerecast-shades-md.translate.goog with a 403 challenge.
// Turn on once a request to that host returns the translated page.
const MACHINE_TRANSLATION = false

const MACHINE = [
  ['de', 'de', 'Deutsch'],
  ['it', 'it', 'Italiano'],
  ['pt', 'pt', 'Português'],
  ['pl', 'pl', 'Polski'],
  ['uk', 'uk', 'Українська'],
  ['tr', 'tr', 'Türkçe'],
  ['nl', 'nl', 'Nederlands'],
  ['ja', 'ja', '日本語'],
  ['ko', 'ko', '한국어'],
  ['ar', 'ar', 'العربية'],
  ['hi', 'hi', 'हिन्दी'],
  ['id', 'id', 'Bahasa Indonesia'],
  ['vi', 'vi', 'Tiếng Việt'],
  ['th', 'th', 'ไทย'],
  ['cs', 'cs', 'Čeština'],
  ['sv', 'sv', 'Svenska'],
  ['he', 'iw', 'עברית'],
  ['el', 'el', 'Ελληνικά'],
  ['hu', 'hu', 'Magyar'],
  ['bg', 'bg', 'Български'],
] as const

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

const translated = (page: Page, code: string) =>
  `https://pagerecast-shades-md.translate.goog/${page.path}?_x_tr_sl=en&amp;_x_tr_tl=${code}&amp;_x_tr_hl=${code}&amp;_x_tr_pto=wapp`

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

/** Every language's links to this page: the six written ones, then Google's. */
function languages(locale: Locale, page: Page) {
  const own = LOCALES.map(
    (l) =>
      `<li><a href="${pathOf(l, page)}" hreflang="${l.lang}" lang="${l.lang}"${l === locale ? ' aria-current="page"' : ''}>${l.name}</a></li>`,
  ).join('')
  const machine = MACHINE.map(
    ([lang, code, name]) =>
      `<li><a href="${translated(page, code)}" hreflang="${lang}" lang="${lang}" rel="nofollow">${name}</a></li>`,
  ).join('')
  return { own, machine }
}

const PLURALS = new Set(['zero', 'one', 'two', 'few', 'many'])
const keys = (node: Dict, prefix = ''): string[] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'object'
      ? keys(value, `${prefix}${key}.`)
      : PLURALS.has(key)
        ? []
        : [prefix + key],
  )

/** Every dictionary has exactly the English keys; plural forms vary by language. */
function checkDictionaries() {
  const english = keys(dictionary('en'))
  for (const { code } of LOCALES) {
    const own = keys(dictionary(code))
    const missing = english.filter((key) => !own.includes(key))
    const extra = own.filter((key) => !english.includes(key))
    if (missing.length || extra.length)
      throw new Error(`i18n/${code}.json: missing ${missing.join(', ')}; extra ${extra.join(', ')}`)
  }
}

const plain = (text: string) =>
  text
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SHADES}/#organization`,
  name: 'Shades Media Group',
  url: SHADES,
  logo: `${SHADES}/logo.svg`,
}
const WEBSITE = {
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  name: 'PageRecast',
  url: `${SITE}/`,
  inLanguage: LOCALES.map((l) => l.lang),
  publisher: { '@id': ORGANIZATION['@id'] },
}

/** schema.org data for a page: what the page shows, never more. */
function structuredData(locale: Locale, page: Page, t: (key: string) => string, dict: Dict) {
  const home = `${SITE}${pathOf(locale, PAGES[0])}`
  const url = `${SITE}${pathOf(locale, page)}`
  const webPage = {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: t(`${page.id}.title`),
    description: t(`${page.id}.description`),
    inLanguage: locale.lang,
    isPartOf: { '@id': WEBSITE['@id'] },
  }
  if (page.id !== 'home') {
    const names = {
      sample: 'footer.sample',
      gallery: 'gallery.heading',
      privacy: 'privacy.heading',
      capture: 'capture.heading',
    }
    const breadcrumb = {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('nav.home'), item: home },
        { '@type': 'ListItem', position: 2, name: t(names[page.id]), item: url },
      ],
    }
    return [
      ORGANIZATION,
      WEBSITE,
      { ...webPage, breadcrumb: { '@id': breadcrumb['@id'] } },
      breadcrumb,
    ]
  }
  const howto = ((dict.home as Dict).faq as Dict).howto as Dict
  const app = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE}/#software`,
    name: 'PageRecast',
    url: home,
    description: t('home.description'),
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Chrome, Firefox, Figma',
    softwareVersion: version,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://opensource.org/licenses/MIT',
    image: `${SITE}/icon-512.png`,
    screenshot: `${SITE}/social-preview.png`,
    downloadUrl: CHROME,
    installUrl: CHROME,
    inLanguage: locale.lang,
    publisher: { '@id': ORGANIZATION['@id'] },
    author: { '@id': ORGANIZATION['@id'] },
    sameAs: [REPO, 'https://www.npmjs.com/package/pagerecast', FIGMA, CHROME],
  }
  return [
    ORGANIZATION,
    WEBSITE,
    app,
    { ...webPage, about: { '@id': app['@id'] }, mainEntity: { '@id': app['@id'] } },
    {
      '@type': 'HowTo',
      '@id': `${url}#howto`,
      name: howto.name,
      inLanguage: locale.lang,
      totalTime: 'PT2M',
      tool: [t('home.install.chrome'), t('home.install.figma')].map((name) => ({
        '@type': 'HowToTool',
        name,
      })),
      step: entries(howto.steps).map((step, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: step.name,
        text: plain(step.text as string),
        url: `${url}#faq`,
      })),
    },
    {
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      inLanguage: locale.lang,
      mainEntity: questions(dict).map(({ q, a }) => ({
        '@type': 'Question',
        name: plain(q),
        acceptedAnswer: { '@type': 'Answer', text: plain(a.replaceAll('</li><li>', ' ')) },
      })),
    },
  ]
}

/** Title, description, canonical, every language's address, social cards and JSON-LD. */
function head(locale: Locale, page: Page, t: (key: string) => string, dict: Dict) {
  const url = `${SITE}${pathOf(locale, page)}`
  const title = html(t(`${page.id}.title`))
  const description = html(t(`${page.id}.description`))
  const image = html(t('imageAlt'))
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': structuredData(locale, page, t, dict),
  }).replaceAll('<', '\\u003c')
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${'noindex' in page ? 'noindex, follow' : 'index, follow, max-image-preview:large'}" />`,
    `<link rel="canonical" href="${url}" />`,
    ...LOCALES.map(
      (l) => `<link rel="alternate" hreflang="${l.lang}" href="${SITE}${pathOf(l, page)}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pathOf(LOCALES[0], page)}" />`,
    '<link rel="alternate" type="text/plain" href="/llms.txt" title="PageRecast for language models" />',
    '<link rel="sitemap" type="application/xml" href="/sitemap.xml" />',
    '<meta name="color-scheme" content="light dark" />',
    '<meta name="theme-color" content="#fdfdfc" media="(prefers-color-scheme: light)" />',
    '<meta name="theme-color" content="#0b0b0c" media="(prefers-color-scheme: dark)" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="PageRecast" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${locale.og}" />`,
    ...LOCALES.filter((l) => l !== locale).map(
      (l) => `<meta property="og:locale:alternate" content="${l.og}" />`,
    ),
    `<meta property="og:image" content="${SITE}/social-preview.png" />`,
    '<meta property="og:image:width" content="1280" />',
    '<meta property="og:image:height" content="640" />',
    `<meta property="og:image:alt" content="${image}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${SITE}/social-preview.png" />`,
    `<meta name="twitter:image:alt" content="${image}" />`,
    `<script type="application/ld+json">${json}</script>`,
  ].join('\n    ')
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
    head: () => head(locale, page, t, dict),
    langs: () => {
      const { own, machine } = languages(locale, page)
      return `<details class="lang">
        <summary><span class="visually-hidden">${t('language')}: </span>${locale.name}</summary>
        <div class="lang-menu">
          <ul>${own}</ul>
          ${MACHINE_TRANSLATION ? `<p class="lang-more">${t('moreLanguages')}<span>${t('machine')}</span></p>
          <ul class="lang-machine">${machine}</ul>` : ''}
        </div>
      </details>`
    },
    langlist: () => {
      const { own, machine } = languages(locale, page)
      return `<nav class="langs" aria-label="${html(t('language'))}">
        <ul>${own}</ul>
        ${MACHINE_TRANSLATION ? `<details>
          <summary>${t('moreLanguages')}</summary>
          <p>${t('machine')}</p>
          <ul>${machine}</ul>
        </details>` : ''}
      </nav>`
    },
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

/** The last commit that touched the site, so lastmod only moves when a page can have. */
function lastModified() {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', root], {
      encoding: 'utf8',
    }).trim()
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Every indexable page in every language, each listing all of its languages. */
function sitemap() {
  const lastmod = lastModified()
  const urls = PAGES.filter((page) => !('noindex' in page)).flatMap((page) =>
    LOCALES.map((locale) =>
      [
        '  <url>',
        `    <loc>${SITE}${pathOf(locale, page)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        ...LOCALES.map(
          (l) =>
            `    <xhtml:link rel="alternate" hreflang="${l.lang}" href="${SITE}${pathOf(l, page)}" />`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${pathOf(LOCALES[0], page)}" />`,
        '  </url>',
      ].join('\n'),
    ),
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

/** llms.txt, and llms-full.txt: the same facts plus the how-to and FAQ in English. */
function llms() {
  const summary = readFileSync(join(root, 'templates', 'llms.txt'), 'utf8').replace(
    '{{@version}}',
    version,
  )
  const dict = dictionary('en')
  const faq = questions(dict)
    .map(({ q, a }) => {
      const answer = a.includes('<ol>')
        ? a
            .replace(/<\/p><ol><li>/, '\n\n1. ')
            .split('</li><li>')
            .map((step, i) => (i ? `${i + 1}. ${step}` : step))
            .join('\n')
        : a
      return `### ${plain(q)}\n\n${plain(answer)}`
    })
    .join('\n\n')
  return { summary, full: `${summary}\n## Frequently asked questions\n\n${faq}\n` }
}

/** Writes every page in every language and returns them as Rollup inputs. */
function generate(): Record<string, string> {
  checkDictionaries()
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
    generateBundle() {
      // The social card and the app icon the head and JSON-LD point at.
      const brand = join(root, '../../assets/brand')
      for (const [fileName, source] of [
        ['social-preview.png', 'social-preview.png'],
        ['icon-512.png', 'png/app-icon-512.png'],
      ])
        this.emitFile({ type: 'asset', fileName, source: readFileSync(join(brand, source!)) })
      const { summary, full } = llms()
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() })
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: summary })
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: full })
    },
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
