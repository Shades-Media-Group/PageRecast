// Builds the plugin: dist/code.js (Figma sandbox) and dist/ui.html (single-file UI).
import { build as esbuild, context } from 'esbuild'
import { build as vite } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const { version } = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
)
const watch = process.argv.includes('--watch')

const mainOptions = {
  entryPoints: [`${root}src/main/index.ts`],
  bundle: true,
  outfile: `${root}dist/code.js`,
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(version) },
}

await vite({
  root: `${root}src/ui`,
  configFile: false,
  logLevel: 'warn',
  plugins: [preact(), viteSingleFile()],
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    outDir: `${root}dist`,
    emptyOutDir: false,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    rollupOptions: { input: `${root}src/ui/index.html`, output: { entryFileNames: 'ui.js' } },
    watch: watch ? {} : null,
  },
})

if (!watch) await rename(`${root}dist/index.html`, `${root}dist/ui.html`)

if (watch) await (await context(mainOptions)).watch()
else await esbuild(mainOptions)
