import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { DEFAULT_PORT, defaultStateFile, FigmaBridge } from './bridge'
import { createServer } from './server'

declare const __VERSION__: string
declare const __SCENE_FORMAT__: string

const port = Number(process.env.PAGERECAST_BRIDGE_PORT || DEFAULT_PORT)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PAGERECAST_BRIDGE_PORT must be a port number from 1 to 65535.')
  process.exit(2)
}

const bridge = new FigmaBridge({ port, stateFile: defaultStateFile(), version: __VERSION__ })
const server = createServer({
  version: __VERSION__,
  sceneFormat: __SCENE_FORMAT__,
  bridge,
  ...(process.env.PAGERECAST_BROWSER ? { browser: process.env.PAGERECAST_BROWSER } : {}),
})

// stdout carries the protocol; anything for people goes to stderr.
await server.connect(new StdioServerTransport())
const stop = async () => {
  await bridge.close()
  process.exit(0)
}
process.stdin.on('close', stop)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
