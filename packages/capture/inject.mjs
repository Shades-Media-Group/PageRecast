// Builds the page-injected capture engine (global.ts) as one IIFE source string,
// the bundle the extension injects. The CLI and the MCP server inline it.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

export async function captureBundle() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('src/global.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
  })
  return result.outputFiles[0].text
}
