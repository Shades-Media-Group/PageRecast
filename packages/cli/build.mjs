// Builds the `pagerecast` CLI into one file, with the page-injected capture engine inlined.
import { build } from 'esbuild'
import { chmod, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const { version } = JSON.parse(await readFile(`${repo}package.json`, 'utf8'))
const outfile = `${root}dist/pagerecast.mjs`

// The same bundle the extension injects into the page.
const inject = await build({
  entryPoints: [`${repo}packages/capture/src/global.ts`],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
})

await build({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  external: ['playwright-core'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __VERSION__: JSON.stringify(version),
    __CAPTURE_BUNDLE__: JSON.stringify(inject.outputFiles[0].text),
  },
  logLevel: 'warning',
})
await chmod(outfile, 0o755)
console.error(`cli ${version} built to packages/cli/dist`)
