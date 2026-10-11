# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Two surfaces share one design system:

- **Chrome extension side panel** (Chromium browsers, Manifest V3), about 360–480 px wide, docked next to the page being captured.
- **Figma plugin window** inside Figma desktop and Figma in the browser, a fixed iframe of about 360 × 600 px that Figma frames and lets the user resize.

The website, pagerecast.shades.md, is written in English (the default, at `/`), French (`/fr/`), Romanian (`/ro/`), Russian (`/ru/`), Spanish (`/es/`), Italian (`/it/`), Turkish (`/tr/`), Hindi (`/hi/`), Japanese (`/ja/`), Simplified Chinese (`/zh/`) and Traditional Chinese (`/zh-hant/`). Sixteen more languages through Google's machine translation are built but switched off (`MACHINE_TRANSLATION` in `apps/site/pages.ts`) until Cloudflare lets Google's translation proxy reach the site. The extension and plugin speak the first six of them and follow the browser or Figma language.

## Stack

Delegated by Cristian: TypeScript, Preact, Vite, Tailwind v4 tokens and Vitest, in a Yarn 1 workspace. This mirrors the Shades Media Group projects lms and nails-by-alynna.

- Preact instead of React keeps both UIs light enough to open instantly.
- The extension captures through the Chrome DevTools Protocol (`chrome.debugger`), a confirmed decision.

## Users

- **Product and UI designers** who need an editable Figma starting point from a live website: a redesign, a competitor benchmark, a moodboard or an audit.
- **Agencies**, starting with Shades Media Group itself, redesigning a client's existing site.
- **Developers and product teams** who need a design file of UI that only exists in code, including localhost, staging and pages behind a login.

They work with the page open in Chrome and Figma open next to it, and they do this many times a day. They are fluent in Figma and expect its density and conventions.

## Product Purpose

Turn any webpage into editable Figma layers (frames, text with real fonts, images, vectors, styles and variables), so nobody has to rebuild an existing page by hand.

Success means a capture imports into Figma close enough to the live page that the designer starts editing immediately instead of fixing the import.

## Positioning

A free, open-source and private website-to-Figma importer:

- **No paywall:** unlimited imports, no tiers, no account.
- **Private:** captures from the extension stay on the user's machine, so private and behind-login pages are safe to capture. The plugin's Web tab sends only the address the user types to PageRecast's server, which opens the public page, returns the layers and stores nothing; when that service is down, the extension still works.
- **Open format:** the `.recast` capture format is documented.
- **Everything included:** custom viewport widths, an element picker and a full import report, all free.

Made by Shades Media Group.

## Operating Context

1. The user opens a site in Chrome and opens the PageRecast side panel.
2. They choose a scope (full page, visible area or a picked element), viewports (presets or custom widths) and themes (light, dark).
3. They capture, then copy or download the result.
4. In Figma they run the PageRecast plugin, paste or drop the capture, adjust the import options (Auto Layout, styles, variables, screenshot reference) and import.

The plugin can also import a public page by URL through PageRecast's render service, and `.html` files and pasted HTML/CSS code, with no extension involved. During a capture, Chrome shows its own "started debugging this browser" bar, which the UI must explain before the user meets it.

## Capabilities and Constraints

**Constraints**

- **Free forever:** no payments, tiers, limits, trials, upgrade prompts or watermarks, anywhere.
- **Local first, no analytics:** no accounts, no analytics, no remote logging. Network use is the Figma plugin fetching images a capture references; the Web tab's render service (`POST https://pagerecast.shades.md/api/render`, Cloudflare Browser Rendering on the site Worker), which receives only a public page address and the capture settings and stores nothing; and, when agent imports are on, polling the MCP server's bridge on `127.0.0.1`. The render service needs Cloudflare's Workers Paid plan.
- **Licence:** MIT © Shades Media Group.
- **Version:** 1.1.1 is the current release; 1.0.0 was the first public one.

**Platform limits**

- A Figma image can be at most 4096 px on a side.
- Fonts must be installed or available to Figma; missing fonts are substituted and reported.
- Publishing to the Chrome Web Store and Figma Community uses Cristian's own developer accounts.

**Terminology**

- **capture:** what the extension produces.
- **recast / import:** what the plugin does with a capture.
- **`.recast` file:** a saved capture.
- **viewport, theme, scope:** the capture settings.
- **screenshot reference:** the locked image frame placed beside the editable layers.

## Brand Commitments

- **Name:** PageRecast. Tagline "Capture the web. Recast the design." Descriptor "From any website to editable layers."
- **Credit:** inside the product (both apps, store listings) the credit is "Shades Media Group", linking to https://shades.md. The README and GitHub credit "Built by Cristian Brinza | Shades Media Group".
- **Shades brand:** heavily rely on the Shades brand system. Source: `~/Documents/GitHub/shades.md/client/src/pages/Page_design_v2/Shades Brand System.dc.html`.
  - Ink and Paper neutrals, True Red `#F9000A` used sparingly ("red is a spice, not the meal").
  - The Spectrum gradient, at most once per layout.
  - Space Grotesk, Hanken Grotesk and Space Mono.
  - The three-bar mark language.
  - The voice: "short, confident, no jargon".
- **Rejected:** the old "Shades Web2Figma" look (beige, blue and orange, the "S" mark).
- **Icons:** a custom PageRecast icon library made for this project, not a stock icon set.

## Evidence on Hand

None yet: no users, testimonials, metrics or store ratings. Never invent them.

## Product Principles

1. **Fidelity first.** The import should look like the page; every substitution is reported, never hidden.
2. **Free means free.** No limits and no upsell surface, ever.
3. **Private by design.** The extension captures what the user sees without sending it anywhere; the render service sees only a public address and keeps nothing.
4. **Figma-native density.** Every pixel of the panel and plugin does a job; nothing is decorative padding.
5. **Plain language.** Settings explain their effect in one short line; a first-time user captures without reading the docs.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast in both themes.
- Full keyboard operation of the side panel and plugin, with visible focus.
- Respect `prefers-reduced-motion`.
- Controls are at least 24 px targets in these dense desktop panels.
