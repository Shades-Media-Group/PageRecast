import { DEFAULT_SETTINGS, type MainToUi, type Settings, type UiToMain } from '../shared/messages'
import { importFile } from './build'
import { FontResolver } from './fonts'
import { updatableKeys } from './update'

declare const __VERSION__: string

const SETTINGS_KEY = 'settings'
const send = (message: MainToUi) => figma.ui.postMessage(message)

figma.showUI(__html__, { width: 400, height: 620, themeColors: true, title: 'PageRecast' })

async function start() {
  const saved = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as Partial<Settings> | undefined
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    defaults: { ...DEFAULT_SETTINGS.defaults, ...saved?.defaults },
    fonts: { ...saved?.fonts },
    web: { ...DEFAULT_SETTINGS.web, ...saved?.web },
    agent: { ...DEFAULT_SETTINGS.agent, ...saved?.agent },
  }
  send({ type: 'ready', settings, version: __VERSION__ })
}

figma.ui.onmessage = async (message: UiToMain) => {
  switch (message.type) {
    case 'settings':
      await figma.clientStorage.setAsync(SETTINGS_KEY, message.settings)
      break
    case 'find-imported':
      send({ type: 'imported', keys: updatableKeys(message.keys) })
      break
    case 'check-fonts': {
      const fonts = new FontResolver()
      await fonts.init()
      send({ type: 'fonts', missing: fonts.missing(message.uses), families: fonts.familyNames() })
      break
    }
    case 'open-url':
      figma.openExternal(message.url)
      break
    case 'notify':
      figma.notify(message.message)
      break
    case 'import':
      try {
        const report = await importFile(
          message.file,
          message.images,
          message.tiles,
          message.options,
          message.fonts,
          message.update,
          send,
        )
        // The window answers with the toast, in its own language.
        send({ type: 'done', report })
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
      break
  }
}

void start()
