// Builds the `pagerecast-mcp` server into one file, with the PageRecast API (from
// packages/cli), the page-injected capture engine and the .recast spec inlined.
import { build } from 'esbuild'
import { chmod, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { captureBundle } from '../capture/inject.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const { version } = JSON.parse(await readFile(`${repo}package.json`, 'utf8'))
const outfile = `${root}dist/pagerecast-mcp.mjs`

await build({
  entryPoints: [`${root}src/main.ts`],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile,
  external: ['playwright-core', '@modelcontextprotocol/sdk', 'zod'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __VERSION__: JSON.stringify(version),
    __CAPTURE_BUNDLE__: JSON.stringify(await captureBundle()),
    __SCENE_FORMAT__: JSON.stringify(await readFile(`${repo}docs/scene-format.md`, 'utf8')),
  },
  logLevel: 'warning',
})
await chmod(outfile, 0o755)
console.error(`mcp ${version} built to packages/mcp/dist`)
