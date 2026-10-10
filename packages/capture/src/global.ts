// Entry for the page-injected bundle: exposes the capture API on window.
import { walk } from './walker'
import { freeze, preload, prepare } from './prepare'
import { pickElement } from './picker'

const api = { walk, freeze, prepare, preload, pickElement }

declare global {
  interface Window {
    __pagerecast?: typeof api & { restore?: () => void; thaw?: () => void }
  }
}

window.__pagerecast = api
