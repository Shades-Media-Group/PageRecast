// Builds the `pagerecast` CLI and its programmatic API, each into one file, with the
// page-injected capture engine inlined, plus type declarations for the API.
import { build } from 'esbuild'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { captureBundle } from '../capture/inject.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../', import.meta.url))
const { version } = JSON.parse(await readFile(`${repo}package.json`, 'utf8'))
const cli = `${root}dist/pagerecast.mjs`

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['playwright-core'],
  define: {
    __VERSION__: JSON.stringify(version),
    __CAPTURE_BUNDLE__: JSON.stringify(await captureBundle()),
  },
  logLevel: 'warning',
}
await build({
  ...shared,
  entryPoints: [`${root}src/main.ts`],
  outfile: cli,
  banner: { js: '#!/usr/bin/env node' },
})
await build({ ...shared, entryPoints: [`${root}src/api.ts`], outfile: `${root}dist/index.mjs` })
await chmod(cli, 0o755)

// Declarations without a type-check: the API spells out its export types. The scene
// types are private to this repository, so they ship beside the API as ./scene.
async function declarations(path) {
  const source = await readFile(path, 'utf8')
  const { outputText, diagnostics } = ts.transpileDeclaration(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  if (diagnostics?.length)
    throw new Error(ts.formatDiagnostics(diagnostics, ts.createCompilerHost({})))
  return outputText.replaceAll("'@pagerecast/scene'", "'./scene.js'")
}
await mkdir(`${root}dist`, { recursive: true })
await writeFile(`${root}dist/index.d.ts`, await declarations(`${root}src/api.ts`))
await writeFile(`${root}dist/scene.d.ts`, await declarations(`${repo}packages/scene/src/types.ts`))
console.error(`cli ${version} built to packages/cli/dist`)
