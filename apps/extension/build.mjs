// Builds the extension: side panel, background script, manifest and icons.
// Chrome goes to dist/; `--target firefox` builds the Firefox version into dist-firefox/.
import { build as esbuild } from 'esbuild'
import { build as vite } from 'vite'
import preact from '@preact/preset-vite'
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const { version } = JSON.parse(await readFile(`${repo}package.json`, 'utf8'))
const watch = process.argv.includes('--watch')
const firefox = /--target[= ]firefox/.test(process.argv.join(' '))
const dist = `${root}${firefox ? 'dist-firefox' : 'dist'}/`
// The target is a build-time constant, so each build drops the other browser's
// code. Firefox's `browser` namespace is the promise-based twin of `chrome`.
const define = {
  __FIREFOX__: String(firefox),
  ...(firefox ? { chrome: 'browser' } : {}),
}

await rm(dist, { recursive: true, force: true })
await mkdir(`${dist}icons`, { recursive: true })

// The capture engine runs inside the page, so it ships as one self-contained script.
const inject = await esbuild({
  entryPoints: [`${repo}packages/capture/src/global.ts`],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
})

await vite({
  root: `${root}src/sidepanel`,
  base: './',
  configFile: false,
  logLevel: 'warn',
  plugins: [preact()],
  define: {
    ...define,
    __VERSION__: JSON.stringify(version),
    // Firefox injects the engine as a file (page CSP can forbid evaluating a string).
    __CAPTURE_BUNDLE__: JSON.stringify(firefox ? '' : inject.outputFiles[0].text),
  },
  build: {
    outDir: `${dist}sidepanel`,
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    watch: watch ? {} : null,
  },
})

await esbuild({
  entryPoints: [`${root}src/background.ts`],
  bundle: true,
  format: firefox ? 'iife' : 'esm',
  minifySyntax: true,
  // Capture links (src/link.ts) run captures from the background in Chrome.
  define: {
    ...define,
    __VERSION__: JSON.stringify(version),
    __CAPTURE_BUNDLE__: JSON.stringify(firefox ? '' : inject.outputFiles[0].text),
  },
  outfile: `${dist}background.js`,
  target: 'es2022',
})

let manifest = {
  manifest_version: 3,
  // The store lists by name: the brand first, then the words people search for.
  // Name, description and shortcut texts come from _locales, one folder per language.
  name: '__MSG_appName__',
  short_name: 'PageRecast',
  version,
  description: '__MSG_appDescription__',
  default_locale: 'en',
  homepage_url: 'https://github.com/Shades-Media-Group/PageRecast',
  minimum_chrome_version: '116',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  action: {
    default_title: '__MSG_actionTitle__',
    default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
  },
  side_panel: { default_path: 'sidepanel/index.html' },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['sidePanel', 'debugger', 'tabs', 'storage', 'unlimitedStorage', 'contextMenus'],
  // Lets pagerecast.shades.md/capture/ hand over a capture link from the Figma plugin.
  // Unlike a content script, this needs no host permission and adds no install warning.
  externally_connectable: { matches: ['https://pagerecast.shades.md/*'] },
  commands: {
    _execute_action: {
      suggested_key: { default: 'Alt+Shift+P' },
      description: '__MSG_actionTitle__',
    },
    'capture-page': {
      suggested_key: { default: 'Alt+Shift+C' },
      description: '__MSG_commandCapture__',
    },
  },
}
if (firefox) {
  // Firefox: a sidebar instead of the side panel, an event page instead of a
  // service worker, and scripting plus host access instead of the debugger.
  // Manifest V2, because Firefox only lets an extension screenshot any area
  // of any tab (tabs.captureTab) with the <all_urls> API permission, which
  // Manifest V3 no longer grants. Firefox keeps supporting Manifest V2.
  const {
    minimum_chrome_version: _minimum,
    side_panel: _sidePanel,
    background: _background,
    permissions: _permissions,
    externally_connectable: _externallyConnectable,
    action,
    ...common
  } = manifest
  manifest = {
    ...common,
    manifest_version: 2,
    browser_action: action,
    sidebar_action: {
      default_title: 'PageRecast',
      default_panel: 'sidepanel/index.html',
      default_icon: action.default_icon,
      open_at_install: false,
    },
    background: { scripts: ['background.js'], persistent: false },
    permissions: [
      '<all_urls>',
      'scripting',
      'tabs',
      'storage',
      'unlimitedStorage',
      'clipboardWrite',
      'contextMenus',
    ],
    commands: {
      _execute_sidebar_action: manifest.commands._execute_action,
      'capture-page': manifest.commands['capture-page'],
    },
    browser_specific_settings: {
      gecko: {
        id: 'pagerecast@shades.md',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] },
      },
    },
  }
  await writeFile(`${dist}capture.js`, inject.outputFiles[0].text)
}
await writeFile(`${dist}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
await cp(`${root}_locales`, `${dist}_locales`, { recursive: true })

for (const size of [16, 32, 48, 128]) {
  await copyFile(`${repo}assets/brand/png/icon-${size}.png`, `${dist}icons/${size}.png`)
}
console.log(`extension ${version} built to apps/extension/${firefox ? 'dist-firefox' : 'dist'}`)
