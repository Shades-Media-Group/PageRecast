import { resolveLocale, setLocale, t } from '@pagerecast/i18n'
import { listenForLinks } from './link'
import { loadSettings, type PendingCapture, type Settings } from './store'

// Chrome's side panel, or Firefox's sidebar (which has no "open on action click" setting).
declare const __FIREFOX__: boolean

// The Firefox build is Manifest V2 (see build.mjs), hence browserAction.
const firefox = chrome as unknown as {
  browserAction: typeof chrome.action
  sidebarAction: { open(): Promise<void>; toggle(): Promise<void> }
}

const PAGES = ['http://*/*', 'https://*/*', 'file:///*']

function setUp() {
  // Open the panel when the toolbar icon is clicked.
  if (!__FIREFOX__) void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

if (__FIREFOX__)
  firefox.browserAction.onClicked.addListener(() => void firefox.sidebarAction.toggle())

// Firefox has no `externally_connectable` for web pages, so capture links are Chrome's.
if (!__FIREFOX__) listenForLinks()

/** The right-click menu, in the panel's interface language. */
async function createMenus() {
  setLocale(resolveLocale((await loadSettings()).interfaceLanguage))
  await chrome.contextMenus.removeAll()
  const contexts: ['page', 'frame', 'selection', 'link', 'image'] = [
    'page',
    'frame',
    'selection',
    'link',
    'image',
  ]
  chrome.contextMenus.create({
    id: 'page',
    title: t('menu.capturePage'),
    contexts,
    documentUrlPatterns: PAGES,
  })
  chrome.contextMenus.create({
    id: 'element',
    title: t('menu.pickElement'),
    contexts,
    documentUrlPatterns: PAGES,
  })
}

// On startup too, as the browser's own language may have changed since.
chrome.runtime.onStartup.addListener(() => {
  setUp()
  void createMenus()
})
chrome.runtime.onInstalled.addListener(() => {
  setUp()
  void createMenus()
})

// A new interface language in the panel renames the menu items.
chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes.settings
  if (area !== 'local' || !change) return
  const before = (change.oldValue as Partial<Settings> | undefined)?.interfaceLanguage
  const after = (change.newValue as Partial<Settings> | undefined)?.interfaceLanguage
  if (before !== after) void createMenus()
})

/**
 * Opens the panel, then leaves the request where the panel picks it up.
 * Opening must run first, while the click still counts as a user gesture.
 */
function request(scope: PendingCapture['scope'], tab?: chrome.tabs.Tab) {
  if (tab?.id === undefined) return
  if (__FIREFOX__) void firefox.sidebarAction.open()
  else void chrome.sidePanel.open({ windowId: tab.windowId })
  const pending: PendingCapture = { scope, tabId: tab.id, windowId: tab.windowId, at: Date.now() }
  void chrome.storage.session.set({ pending })
}

chrome.contextMenus.onClicked.addListener((info, tab) =>
  request(info.menuItemId === 'element' ? 'element' : 'page', tab),
)

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture-page') request('page', tab)
})
