// Packs the built apps into the zips that go to the Chrome Web Store, the
// Figma Community and GitHub Releases. Run `yarn build` first.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const out = join(root, 'release')

for (const required of ['apps/extension/dist/manifest.json', 'apps/figma-plugin/dist/code.js']) {
  if (!existsSync(join(root, required))) {
    console.error(`Missing ${required}. Run "yarn build" first.`)
    process.exit(1)
  }
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out)

const zip = (name, cwd, files) => {
  const file = join(out, name)
  execFileSync('zip', ['-q', '-r', '-X', file, ...files], { cwd })
  console.log(`release/${name}`)
}

zip(`pagerecast-chrome-extension-${version}.zip`, join(root, 'apps/extension/dist'), ['.'])
zip(`pagerecast-figma-plugin-${version}.zip`, join(root, 'apps/figma-plugin'), [
  'manifest.json',
  'dist',
])
