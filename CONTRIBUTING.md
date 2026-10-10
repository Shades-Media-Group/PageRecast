# Contributing to PageRecast

Thanks for helping make PageRecast better. Bug reports, pages that import badly, ideas and pull requests are all welcome.

## Report a problem

- **A page didn't import well?** Open an [import report](https://github.com/Shades-Media-Group/PageRecast/issues/new?template=import.yml) with the URL (if it's public), the widths you captured, and a screenshot of the page next to the Figma result. Attaching the `.recast` file helps most.
- **Something broke?** Open a [bug report](https://github.com/Shades-Media-Group/PageRecast/issues/new?template=bug.yml).
- **An idea?** Start a [discussion](https://github.com/Shades-Media-Group/PageRecast/discussions) or open a [feature request](https://github.com/Shades-Media-Group/PageRecast/issues/new?template=feature.yml).

Security issues go through [private reporting](SECURITY.md), never public issues.

## Set up

You need Node 22 (see `.nvmrc`) and Yarn 1.

```bash
git clone https://github.com/Shades-Media-Group/PageRecast.git
cd PageRecast
yarn install
yarn build
```

- **Extension:** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `apps/extension/dist`. Run `yarn dev:extension` to rebuild on change, then reload the extension.
- **Figma plugin:** in Figma desktop, choose **Plugins → Development → Import plugin from manifest** and pick `apps/figma-plugin/manifest.json`. Run `yarn dev:plugin` to rebuild on change.

## How the code is organised

| Path                | What it does                                                               |
| ------------------- | -------------------------------------------------------------------------- |
| `packages/scene`    | The `.recast` format: types, encoding, validation                          |
| `packages/capture`  | Walks a rendered page into a scene; shared by the extension and the plugin |
| `packages/icons`    | The PageRecast icon set                                                    |
| `packages/ui`       | Design tokens and shared Preact controls                                   |
| `apps/extension`    | Chrome side panel and the DevTools Protocol capture                        |
| `apps/figma-plugin` | Figma importer and its interface                                           |
| `e2e`               | Playwright tests against real pages and the built extension                |

## Before you open a pull request

```bash
yarn verify      # typecheck, lint, unit tests and build
yarn test:e2e    # browser tests
```

- Keep each pull request to one change, and add a test when you change capture or import behaviour.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(extension): …`, `fix(figma-plugin): …`, `docs: …`. The changelog is generated from them.
- If you change the `.recast` format, update [docs/scene-format.md](docs/scene-format.md) in the same pull request.
- Interface changes follow the design rules in [CLAUDE.md](CLAUDE.md#design-rules-the-panels-must-read-as-hand-built-never-templated). Include before and after screenshots in light and dark.

## Ground rules

- PageRecast stays free, with no accounts, limits or paid tiers.
- Nothing a user captures may leave their computer. No analytics or remote logging.

By contributing you agree that your work is released under the [MIT License](LICENSE), and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
