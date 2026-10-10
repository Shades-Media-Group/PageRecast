import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

// Served at the root of pagerecast.shades.md by a Cloudflare Worker.
export default defineConfig({
  base: '/',
  define: { __VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    // The CSP allows fonts and images from this origin only, never data: URLs.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        sample: fileURLToPath(new URL('sample/index.html', import.meta.url)),
      },
    },
  },
})
