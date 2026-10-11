---
version: 1
slug: 'apps-figma-plugin'
primary_target: 'apps/figma-plugin'
related_targets: ['apps/extension']
---

# Surface brief: PageRecast panels (Figma plugin and Chrome side panel)

Mode: Operate. Visitors are designers mid-task in Figma or Chrome; they repeat this flow many times a day.

## Direction contract

THESIS: PageRecast reads like a native Figma property inspector, lifted with small pill controls, with one brand-owned rounded stage at the top where the actual page appears. It refuses the wizard of stacked rounded cards, icon-per-row lists, pill tab switchers and monospace "data" costume.

OWN-WORLD: Shades ink #0A0A0B and paper #FDFDFC, hairline full-bleed dividers, 32 px property rows, Hanken Grotesk 11 and 12 px (20 px for a screen's one figure) in weights 400 and 600 with tabular figures, outlined PageRecast wordmark. Pills: segmented tracks with a raised pill, ink-filled chips for several choices. Radii 999 pills, 8 inputs, 12 stage, previews and drop zones. Red #E0000A only on the single primary pill (soft red shadow on light, plain on dark) and the selection marker; rose #FF8299 only inside the overlap mark and the stage drawing. No boxes around lists, no eyebrows, no gradient text.

STORY: Paste or capture, see the real page, adjust at most four options, import, read a precise report of what was created and what was substituted.

FIRST VIEWPORT: 40 px header (logomark + wordmark left, docs right), text tabs with a 2 px ink underline, then a 176 px stage: empty = drawn page card and Figma layer card overlapping with a ⌘V keycap at the overlap; loaded = the captured screenshot cropped to the top of the page. Inspector sections follow. The primary action is a full-width red pill pinned to the bottom. The credit, version and links close Settings, after Reset all preferences.

FORM: Figma inspector plus brand stage; first on the ordered list; no seed key (pinned brand world, code-led, surface inside the Shades world).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
