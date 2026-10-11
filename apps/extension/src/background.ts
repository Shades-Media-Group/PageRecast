import type { PendingCapture } from './store'

const PAGES = ['http://*/*', 'https://*/*', 'file:///*']

function setUp() {
  // Open the side panel when the toolbar icon is clicked.
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

chrome.runtime.onStartup.addListener(setUp)
chrome.runtime.onInstalled.addListener(() => {
  setUp()
  chrome.contextMenus.removeAll(() => {
    const contexts: ['page', 'frame', 'selection', 'link', 'image'] = [
      'page',
      'frame',
      'selection',
      'link',
      'image',
    ]
    chrome.contextMenus.create({
      id: 'page',
      title: 'Capture this page with PageRecast',
      contexts,
      documentUrlPatterns: PAGES,
    })
    chrome.contextMenus.create({
      id: 'element',
      title: 'Pick an element to capture',
      contexts,
      documentUrlPatterns: PAGES,
    })
  })
})

/**
 * Opens the panel, then leaves the request where the panel picks it up.
 * `sidePanel.open` must run first, while the click still counts as a gesture.
 */
function request(scope: PendingCapture['scope'], tab?: chrome.tabs.Tab) {
  if (tab?.id === undefined) return
  void chrome.sidePanel.open({ windowId: tab.windowId })
  const pending: PendingCapture = { scope, tabId: tab.id, windowId: tab.windowId, at: Date.now() }
  void chrome.storage.session.set({ pending })
}

chrome.contextMenus.onClicked.addListener((info, tab) =>
  request(info.menuItemId === 'element' ? 'element' : 'page', tab),
)

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture-page') request('page', tab)
})
