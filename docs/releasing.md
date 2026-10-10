# Versions and releases

## One version

The version in the root `package.json` is the only one. Every workspace, the extension manifest, both interfaces (shown in their footers) and the release zips take it from there at build time.

## Which number changes

PageRecast follows [Semantic Versioning](https://semver.org/):

| Change                                      | Example                                      | Bump                      |
| ------------------------------------------- | -------------------------------------------- | ------------------------- |
| A fix, nothing new                          | Gradients rotate the right way               | **patch** `1.0.0 → 1.0.1` |
| A new feature that changes nothing existing | Hover states as variants                     | **minor** `1.0.1 → 1.1.0` |
| Something existing stops working as before  | `.recast` format version 2, a removed option | **major** `1.1.0 → 2.0.0` |

The bump follows from the commits: `fix:` means patch, `feat:` means minor, and `!` (as in `feat!:`) or a `BREAKING CHANGE:` note means major.

## Cutting a release

```bash
yarn verify
yarn release patch     # or minor / major
git push --follow-tags
```

`yarn release` bumps every `package.json`, writes the changelog entry from the commits since the last tag, commits `chore(release): vX.Y.Z` and tags it. Read `CHANGELOG.md` before pushing; edit and amend if a line needs better wording.

Pushing the tag runs the **Release** workflow. It verifies, builds `pagerecast-chrome-extension-X.Y.Z.zip` and `pagerecast-figma-plugin-X.Y.Z.zip`, and publishes a GitHub Release with the changelog entry as notes.

## Shipping to the stores

After the GitHub Release exists, upload the same zips:

1. **Chrome Web Store:** Developer Dashboard → PageRecast → Package → **Upload new package**, then **Submit for review**. Users update automatically after approval.
2. **Figma Community:** Figma desktop → Plugins → Development → PageRecast → **Publish new version**, with the changelog entry as the release notes.

See [publishing.md](publishing.md) for the first-time setup.
