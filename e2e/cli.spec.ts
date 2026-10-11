import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode } from '@pagerecast/scene'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = join(root, 'packages/cli/dist/pagerecast.mjs')
const run = (...args: string[]) =>
  execFileSync('node', [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

// One build per worker: keep this file's tests in one worker so builds never overlap.
test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  execFileSync('node', ['packages/cli/build.mjs'], { cwd: root })
})

test('the CLI captures two widths in both themes and reads the file back', async () => {
  test.setTimeout(120_000)
  const out = join(await mkdtemp(join(tmpdir(), 'pagerecast-')), 'kitchen-sink.recast')
  run(
    'capture',
    'e2e/fixtures/kitchen-sink.html',
    '--widths',
    '1440,390',
    '--theme',
    'both',
    '--out',
    out,
  )

  const file = await decode(new Uint8Array(await readFile(out)))
  expect(file.captures.map((c) => [c.viewport.width, c.theme])).toEqual([
    [1440, 'light'],
    [1440, 'dark'],
    [390, 'light'],
    [390, 'dark'],
  ])
  expect(file.captures.every((c) => c.screenshot && file.assets[c.screenshot])).toBe(true)
  expect(file.captures[2]!.root.width).toBe(390)

  expect(run('info', out)).toContain('Mobile · 390 · Dark')
  expect(run('tokens', out, '--format', 'css')).toContain('--font-16-regular:')
})

test('the published API type-checks for a strict consumer and captures a page', () => {
  test.setTimeout(120_000)
  const fixture = 'e2e/fixtures/api-consumer.ts'
  // The declarations as npm users get them: Node module resolution, no skipLibCheck.
  execFileSync(
    join(root, 'node_modules/.bin/tsc'),
    [
      ...['--ignoreConfig', '--noEmit', '--strict', '--module', 'nodenext'],
      ...['--target', 'es2022', '--types', 'node', fixture],
    ],
    { cwd: root, stdio: 'pipe' },
  )
  // Node 22 runs the TypeScript fixture as is.
  const out = execFileSync('node', [fixture], { cwd: root, encoding: 'utf8', stdio: 'pipe' })
  expect(JSON.parse(out)).toEqual({
    css: expect.any(Number),
    layers: expect.any(Number),
    root: 'frame',
  })
})
