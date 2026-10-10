/**
 * The PageRecast icon set. Every glyph is drawn on a 20 × 20 grid with a
 * 1.5 px stroke, round caps and joins, and `currentColor`, so icons inherit
 * text colour and sit on the same optical weight as 13 px UI text.
 *
 * Values are the inner SVG markup; `renderIcon` wraps them.
 */
export const icons = {
  capture:
    '<path d="M3 7V5a2 2 0 0 1 2-2h2M13 3h2a2 2 0 0 1 2 2v2M17 13v2a2 2 0 0 1-2 2h-2M7 17H5a2 2 0 0 1-2-2v-2"/><circle cx="10" cy="10" r="2.5"/>',
  page: '<rect x="4.5" y="2.5" width="11" height="15" rx="2"/><path d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3"/>',
  viewport:
    '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7h15"/><path d="M5 5.25h.01M7 5.25h.01"/>',
  element:
    '<path d="M3 5.5v-1A1.5 1.5 0 0 1 4.5 3h1M8.5 3h2M13.5 5.5v-1A1.5 1.5 0 0 0 12 3h-.5M3 8.5v2M3 13.5v.5A1.5 1.5 0 0 0 4.5 15.5h1M8.5 15.5h1"/><path d="M11.5 11l5.5 2-2.4 1.1-1.1 2.4z"/>',
  pointer: '<path d="M5 3.5l10 4.2-4.3 1.6-1.6 4.3z"/><path d="M11.2 11.2l4.3 4.3"/>',
  desktop:
    '<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7.5 16.5h5M10 13.5v3"/>',
  laptop: '<rect x="4" y="4.5" width="12" height="8.5" rx="1.5"/><path d="M2.5 15.5h15"/>',
  tablet: '<rect x="4.5" y="2.5" width="11" height="15" rx="2"/><path d="M9 14.5h2"/>',
  mobile: '<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M9.25 14.5h1.5"/>',
  width: '<path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"/><path d="M3 4v2M17 4v2"/>',
  sun: '<circle cx="10" cy="10" r="3"/><path d="M10 2.5V4M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1"/>',
  moon: '<path d="M15.5 12.2A6 6 0 0 1 7.8 4.5a6 6 0 1 0 7.7 7.7z"/>',
  contrast: '<circle cx="10" cy="10" r="7"/><path d="M10 3a7 7 0 0 0 0 14z" fill="currentColor"/>',
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V5a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 4 5v6a1.5 1.5 0 0 0 1.5 1.5H7"/>',
  paste:
    '<rect x="4.5" y="4" width="11" height="13.5" rx="2"/><rect x="7.5" y="2.5" width="5" height="3" rx="1"/><path d="M7.5 10h5M7.5 13h3"/>',
  download: '<path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 16.5h12"/>',
  upload: '<path d="M10 12.5v-9M6.5 7L10 3.5 13.5 7M4 16.5h12"/>',
  file: '<path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5z"/><path d="M11.5 2.5v4h4"/>',
  code: '<path d="M7 6l-4 4 4 4M13 6l4 4-4 4M11.25 4.5l-2.5 11"/>',
  history:
    '<path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6"/><path d="M3.5 3.5v3h3"/><path d="M10 6.5V10l2.5 1.5"/>',
  trash:
    '<path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10a1.5 1.5 0 0 0 1.5 1.4h4.4a1.5 1.5 0 0 0 1.5-1.4l.8-10"/>',
  external:
    '<path d="M8.5 4.5h-3A1.5 1.5 0 0 0 4 6v8.5A1.5 1.5 0 0 0 5.5 16H14a1.5 1.5 0 0 0 1.5-1.5v-3M11.5 4H16v4.5M16 4l-7 7"/>',
  docs: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5z"/><path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H16M7.5 6.5h5"/>',
  sliders:
    '<path d="M3.5 6H11M15 6h1.5M3.5 14H6M10 14h6.5"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="14" r="2"/>',
  layers: '<path d="M10 3l7 3.5-7 3.5-7-3.5z"/><path d="M3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5"/>',
  font: '<path d="M2.5 15.5L6 5h1l3.5 10.5M3.8 12h5.4"/><circle cx="14.5" cy="12.75" r="2.25"/><path d="M16.75 10v5.5"/>',
  image:
    '<rect x="3" y="3.5" width="14" height="13" rx="2"/><circle cx="7.5" cy="8" r="1.5"/><path d="M3 14l4-4 3.5 3.5 2-2 4.5 4.5"/>',
  vector: '<path d="M10 17v-5.5M6 9l4-6 4 6-4 2.5z"/><path d="M10 7.5v.01"/>',
  autolayout:
    '<rect x="3" y="3" width="14" height="14" rx="2"/><rect x="6" y="6" width="8" height="3" rx="1"/><rect x="6" y="11" width="8" height="3" rx="1"/>',
  variable: '<path d="M10 2.8l6.2 3.6v7.2L10 17.2l-6.2-3.6V6.4z"/><circle cx="10" cy="10" r="2"/>',
  type: '<path d="M5 5.5h10M10 5.5v10M7.5 15.5h5"/>',
  screenshot:
    '<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M6.5 4.5l1-2h5l1 2"/><circle cx="10" cy="10" r="2.75"/>',
  lock: '<rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V7a3 3 0 0 1 6 0v2"/>',
  eyeOff:
    '<path d="M3 3l14 14M8.3 5.2A7.6 7.6 0 0 1 10 5c4.7 0 7.5 5 7.5 5a13 13 0 0 1-2.1 2.7M5.4 6.6C3.6 7.9 2.5 10 2.5 10s2.8 5 7.5 5a7 7 0 0 0 3.2-.8"/><path d="M8.5 8.6a2.2 2.2 0 0 0 3 3"/>',
  scroll: '<rect x="6" y="2.5" width="8" height="12" rx="4"/><path d="M10 5.5v2.5M7.5 17.5h5"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.5v.01"/>',
  warning:
    '<path d="M8.7 3.8L2.9 14a1.5 1.5 0 0 0 1.3 2.2h11.6a1.5 1.5 0 0 0 1.3-2.2L11.3 3.8a1.5 1.5 0 0 0-2.6 0z"/><path d="M10 8v3.5M10 13.75v.01"/>',
  error: '<circle cx="10" cy="10" r="7"/><path d="M7.5 7.5l5 5M12.5 7.5l-5 5"/>',
  chevronDown: '<path d="M6 8l4 4 4-4"/>',
  chevronRight: '<path d="M8 6l4 4-4 4"/>',
  arrowRight: '<path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>',
  refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5v3h-3"/>',
  more: '<path d="M5 10h.01M10 10h.01M15 10h.01" stroke-width="2.5"/>',
  keyboard:
    '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M6.5 12h7"/>',
} as const

export type IconName = keyof typeof icons

export function renderIcon(name: IconName, size = 20, title?: string): string {
  const label = title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${label}>${icons[name]}</svg>`
}
