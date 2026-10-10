import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

// Served at the root of pagerecast.shades.md by a Cloudflare Worker.
export default defineConfig({
  base: '/',
  define: { __VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
})
