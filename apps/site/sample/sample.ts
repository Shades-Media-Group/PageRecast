// The test page: two typefaces, the PageRecast logo and icons, and the live
// hex value of every colour token. Everything else is CSS.
import '@fontsource-variable/hanken-grotesk/wght.css'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import { renderIcon, type IconName } from '@pagerecast/icons'
import logo from '../../../assets/brand/logo.svg?raw'
import './sample.css'

// The wordmark follows the text colour, so the logo works in both themes.
const themedLogo = logo.replace('fill="#0A0A0B" transform', 'fill="currentColor" transform')
for (const el of document.querySelectorAll('[data-logo]')) el.innerHTML = themedLogo
for (const el of document.querySelectorAll<HTMLElement>('[data-icon]')) {
  el.innerHTML = renderIcon(el.dataset.icon as IconName, 24)
}

const hex = (rgb: string) =>
  '#' +
  (rgb.match(/\d+/g) ?? [])
    .slice(0, 3)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
const paintHex = () => {
  for (const code of document.querySelectorAll<HTMLElement>('[data-hex]')) {
    const swatch = code.parentElement!.querySelector('span')!
    code.textContent = hex(getComputedStyle(swatch).backgroundColor)
  }
}
paintHex()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintHex)

for (const group of document.querySelectorAll<HTMLElement>('[role="radiogroup"]')) {
  group.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button')
    if (!button) return
    for (const b of group.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b === button))
    }
  })
}
