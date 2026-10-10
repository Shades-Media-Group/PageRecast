// Cuts a release: bumps the version everywhere, writes the changelog entry
// from conventional commits since the last tag, commits and tags.
// Usage: yarn release <patch|minor|major>   then: git push --follow-tags
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const bump = process.argv[2]

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: yarn release <patch|minor|major>')
  process.exit(1)
}
if (git('status', '--porcelain')) {
  console.error('Commit or stash your changes first.')
  process.exit(1)
}

const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const version =
  bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`

// Changelog entry from commit subjects since the previous tag.
let range = 'HEAD'
try {
  range = `${git('describe', '--tags', '--abbrev=0')}..HEAD`
} catch {
  // First release: every commit counts.
}
const sections = { Added: [], Fixed: [], Changed: [] }
for (const line of git('log', range, '--format=%s').split('\n').filter(Boolean)) {
  const m = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(line)
  if (!m) continue
  const [, type, scope, breaking, subject] = m
  const text = `${subject.charAt(0).toUpperCase()}${subject.slice(1)}${scope ? ` (${scope})` : ''}`
  if (breaking) sections.Changed.unshift(`**Breaking:** ${text}`)
  else if (type === 'feat') sections.Added.push(text)
  else if (type === 'fix') sections.Fixed.push(text)
  else if (type === 'perf' || type === 'refactor') sections.Changed.push(text)
}
const date = new Date().toISOString().slice(0, 10)
const body = Object.entries(sections)
  .filter(([, items]) => items.length)
  .map(([title, items]) => `### ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}`)
  .join('\n\n')
const entry = `## [${version}] - ${date}\n\n${body || 'Maintenance release.'}\n`

const changelogPath = join(root, 'CHANGELOG.md')
const changelog = readFileSync(changelogPath, 'utf8')
const marker = '## [Unreleased]'
const updated = changelog.includes(marker)
  ? changelog.replace(marker, `${marker}\n\n${entry}`)
  : changelog.replace(/\n## /, `\n${entry}\n## `)
writeFileSync(changelogPath, updated.replace(/\n{3,}/g, '\n\n'))

// One version for every workspace.
const manifests = [pkgPath]
for (const dir of ['packages', 'apps']) {
  for (const name of readdirSync(join(root, dir)))
    manifests.push(join(root, dir, name, 'package.json'))
}
for (const file of manifests) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.version = version
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}

git('add', 'CHANGELOG.md', ...manifests)
git('commit', '-m', `chore(release): v${version}`)
git('tag', '-a', `v${version}`, '-m', `PageRecast ${version}`)
console.log(`Tagged v${version}. Review CHANGELOG.md, then run: git push --follow-tags`)
