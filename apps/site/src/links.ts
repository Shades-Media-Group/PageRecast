export const REPO = 'https://github.com/Shades-Media-Group/PageRecast'
export const CHROME = 'https://chromewebstore.google.com/detail/iidlcnlnejbmdihmbfiojpikhgaggkel'
export const FIGMA = 'https://www.figma.com/community/plugin/1690893819753299295'
export const DOCS = `${REPO}/tree/main/docs/guides`
export const SHADES = 'https://shades.md'

/** Every `data-link` in the page templates, resolved when the pages are built. */
export const LINKS: Record<string, string> = {
  chrome: CHROME,
  figma: FIGMA,
  docs: DOCS,
  repo: REPO,
  shades: SHADES,
  format: `${REPO}/blob/main/docs/scene-format.md`,
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues/new/choose`,
  security: `${REPO}/blob/main/SECURITY.md`,
  license: `${REPO}/blob/main/LICENSE`,
}
