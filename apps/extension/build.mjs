// Builds the Chrome extension into dist/: side panel, service worker, manifest and icons.
import { build as esbuild } from 'esbuild'
import { build as vite } from 'vite'
import preact from '@preact/preset-vite'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const dist = `${root}dist/`
const { version } = JSON.parse(await readFile(`${repo}package.json`, 'utf8'))
const watch = process.argv.includes('--watch')

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
    __VERSION__: JSON.stringify(version),
    __CAPTURE_BUNDLE__: JSON.stringify(inject.outputFiles[0].text),
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
  format: 'esm',
  outfile: `${dist}background.js`,
  target: 'es2022',
})

const manifest = {
  manifest_version: 3,
  name: 'PageRecast',
  short_name: 'PageRecast',
  version,
  description:
    'Capture any web page, even one behind a login, and paste it into Figma as editable layers. Free and open source.',
  homepage_url: 'https://github.com/Shades-Media-Group/PageRecast',
  minimum_chrome_version: '116',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  action: {
    default_title: 'Open PageRecast',
    default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
  },
  side_panel: { default_path: 'sidepanel/index.html' },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['sidePanel', 'debugger', 'tabs', 'storage', 'unlimitedStorage'],
  commands: {
    _execute_action: { suggested_key: { default: 'Alt+Shift+P' }, description: 'Open PageRecast' },
  },
}
await writeFile(`${dist}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
for (const size of [16, 32, 48, 128]) {
  await copyFile(`${repo}assets/brand/png/icon-${size}.png`, `${dist}icons/${size}.png`)
}
console.log(`extension ${version} built to apps/extension/dist`)
