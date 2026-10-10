import {
  DEFAULT_OPTIONS,
  type ImportOptions,
  type MainToUi,
  type UiToMain,
} from '../shared/messages'
import { importFile } from './build'

const OPTIONS_KEY = 'options'
const send = (message: MainToUi) => figma.ui.postMessage(message)

figma.showUI(__html__, { width: 400, height: 620, themeColors: true, title: 'PageRecast' })

async function start() {
  const saved = (await figma.clientStorage.getAsync(OPTIONS_KEY)) as
    Partial<ImportOptions> | undefined
  send({ type: 'ready', options: { ...DEFAULT_OPTIONS, ...saved }, fileName: figma.root.name })
}

figma.ui.onmessage = async (message: UiToMain) => {
  switch (message.type) {
    case 'options':
      await figma.clientStorage.setAsync(OPTIONS_KEY, message.options)
      break
    case 'resize':
      figma.ui.resize(Math.round(message.width), Math.round(message.height))
      break
    case 'open-url':
      figma.openExternal(message.url)
      break
    case 'import':
      try {
        const report = await importFile(
          message.file,
          message.images,
          message.tiles,
          message.options,
          send,
        )
        send({ type: 'done', report })
        figma.notify(
          `Imported ${message.file.captures.length === 1 ? 'the page' : `${message.file.captures.length} captures`} in ${(report.durationMs / 1000).toFixed(1)} s`,
        )
      } catch (error) {
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      }
      break
  }
}

void start()
