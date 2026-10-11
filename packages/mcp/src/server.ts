import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  capture,
  decode,
  encode,
  info,
  OptionError,
  recastFileName,
  tokens,
  type CaptureOptions,
  type RecastFile,
} from '../../cli/src/api'
import type { FigmaBridge } from './bridge'

export const SCENE_FORMAT_URI = 'pagerecast://docs/scene-format'

export interface ServerOptions {
  version: string
  /** docs/scene-format.md, served as a resource. */
  sceneFormat: string
  bridge: Pick<FigmaBridge, 'send'>
  /** Where captures go without an `out_path`. Default: `<tmp>/pagerecast`. */
  captureDir?: string
  /** Chrome or Chromium to run, from PAGERECAST_BROWSER. */
  browser?: string
}

/** The agent reads this; it names the next step. */
class ToolError extends Error {}

const url = z
  .string()
  .min(1)
  .describe(
    'The page: an http(s) URL, a bare host such as example.com, a file:// URL or a path to a local .html file. localhost and staging work when this machine can reach them.',
  )
const widths = z
  .array(z.number().int().min(240).max(3840))
  .min(1)
  .max(8)
  .describe(
    'Viewport widths in CSS px, 240 to 3840. Under 600 captures as a phone. Default [1440].',
  )
const recastPath = z
  .string()
  .min(1)
  .describe('Path to a .recast file, such as the `path` capture_page returned.')

const json = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

/** Runs a tool body and turns failures into an error result that says what to do next. */
async function run(body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body()
  } catch (error) {
    // Playwright appends a multi-line call log; the first line carries the cause.
    const message = (error instanceof Error ? error.message : String(error)).split('\n')[0]!
    const hint =
      error instanceof ToolError
        ? ''
        : error instanceof OptionError
          ? ' Fix that argument and call the tool again.'
          : /net::ERR_|Timeout .* exceeded/.test(message)
            ? ' Check that the URL opens from this machine (VPN, typo, server running), then try again; raise wait_ms for slow pages.'
            : ''
    return { isError: true, content: [{ type: 'text', text: message + hint }] }
  }
}

async function readRecast(path: string): Promise<{ file: RecastFile; bytes: Uint8Array }> {
  const full = resolve(path)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(full))
  } catch {
    throw new ToolError(
      `No readable file at ${full}. Pass the path capture_page returned, or capture the page first with capture_page.`,
    )
  }
  try {
    return { file: await decode(bytes), bytes }
  } catch (error) {
    throw new ToolError(
      `${full} is not a PageRecast capture (${(error as Error).message}) Capture the page again with capture_page.`,
    )
  }
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer(
    { name: 'pagerecast', version: options.version },
    {
      instructions:
        'PageRecast captures web pages on this machine as .recast files that the PageRecast Figma plugin rebuilds as editable layers, and extracts the design tokens a page uses. Nothing is sent to any PageRecast server.',
    },
  )
  const captureDir = options.captureDir ?? join(tmpdir(), 'pagerecast')

  const captureWith = (
    target: string,
    settings: CaptureOptions,
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ) => {
    const token = extra._meta?.progressToken
    let step = 0
    return capture(target, {
      ...settings,
      ...(options.browser ? { browser: options.browser } : {}),
      onProgress: (label) => {
        if (token === undefined) return
        void extra
          .sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, progress: ++step, message: label },
          })
          .catch(() => undefined)
      },
    })
  }

  server.registerTool(
    'capture_page',
    {
      title: 'Capture a web page',
      description:
        'Opens a page in headless Chromium on this machine and captures it as a .recast file: one frame per width and theme, with layers, fonts, images and a screenshot reference. Returns the saved path and a short summary of each frame, not the layers themselves. Feed the path to send_to_figma, recast_info or page_design_tokens. Takes 5 to 60 seconds. Starts a fresh browser without cookies, so pages behind a login show their logged-out state.',
      inputSchema: {
        url,
        widths: widths.optional(),
        theme: z
          .enum(['light', 'dark', 'both'])
          .optional()
          .describe(
            'prefers-color-scheme to capture. both yields a light and a dark frame per width. Default light.',
          ),
        scope: z
          .enum(['page', 'viewport'])
          .optional()
          .describe(
            'page captures the whole scrollable page, viewport only the first screen. Default page.',
          ),
        language: z
          .string()
          .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'language is a BCP 47 tag such as de-DE.')
          .optional()
          .describe(
            'Browser language as a BCP 47 tag, such as de-DE. Default: the browser default.',
          ),
        wait_ms: z
          .number()
          .int()
          .min(0)
          .max(60_000)
          .optional()
          .describe(
            'Extra wait after the page loads, for slow client-rendered pages. 0 to 60000. Default 0.',
          ),
        out_path: z
          .string()
          .regex(/\.recast$/i, 'out_path must end in .recast.')
          .optional()
          .describe(
            'Where to save the file, ending in .recast. Default: a new file in the system temp folder.',
          ),
      },
      annotations: {
        title: 'Capture a web page',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (args, extra) =>
      run(async () => {
        const file = await captureWith(
          args.url,
          {
            ...(args.widths ? { widths: args.widths } : {}),
            ...(args.theme ? { theme: args.theme } : {}),
            ...(args.scope ? { scope: args.scope } : {}),
            ...(args.language ? { language: args.language } : {}),
            ...(args.wait_ms ? { waitMs: args.wait_ms } : {}),
          },
          extra,
        )
        const bytes = await encode(file)
        const name = recastFileName(file.source.url).replace(/\.recast$/, '')
        const path = resolve(
          args.out_path ?? join(captureDir, `${name}-${Date.now().toString(36)}.recast`),
        )
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, bytes)
        const summary = info(file)
        return json({
          path,
          url: summary.url,
          title: summary.title,
          sizeKb: Math.round(bytes.length / 1024),
          frames: summary.captures.map(({ label, width, height, theme, layers, text, images }) => ({
            label,
            width,
            height,
            theme,
            layers,
            text,
            images,
          })),
        })
      }),
  )

  server.registerTool(
    'page_design_tokens',
    {
      title: 'Extract design tokens',
      description:
        "Returns the design tokens a page repeats: colours named by role (text, surface, border) with dark values, the type scale, spacing, radii and shadows. Give either recast_path (fast, reads a capture) or url (captures the page first in light and dark, 5 to 60 seconds). format md is a DESIGN.md for building UI in the page's style; css is custom properties; w3c is W3C Design Tokens JSON.",
      inputSchema: {
        url: url.optional(),
        recast_path: recastPath.optional(),
        format: z
          .enum(['md', 'css', 'w3c'])
          .optional()
          .describe(
            'md (DESIGN.md, the default), css (custom properties) or w3c (Design Tokens JSON).',
          ),
      },
      annotations: {
        title: 'Extract design tokens',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (args, extra) =>
      run(async () => {
        if (Boolean(args.url) === Boolean(args.recast_path))
          throw new ToolError(
            'Give exactly one of url or recast_path. Prefer recast_path when the page was already captured.',
          )
        const file = args.recast_path
          ? (await readRecast(args.recast_path)).file
          : await captureWith(args.url!, { theme: 'both' }, extra)
        return { content: [{ type: 'text', text: tokens(file, args.format ?? 'md') }] }
      }),
  )

  server.registerTool(
    'recast_info',
    {
      title: 'Describe a capture',
      description:
        'Summarises a .recast file: the page, when it was captured, and per frame its size, theme, scope and layer counts by type, plus the assets. Use it to check a capture before sending it to Figma.',
      inputSchema: { recast_path: recastPath },
      annotations: {
        title: 'Describe a capture',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) =>
      run(async () => {
        const { file } = await readRecast(args.recast_path)
        const { size } = await stat(resolve(args.recast_path))
        return json({
          path: resolve(args.recast_path),
          sizeKb: Math.round(size / 1024),
          ...info(file),
        })
      }),
  )

  server.registerTool(
    'send_to_figma',
    {
      title: 'Send a capture to Figma',
      description:
        'Queues a .recast file for the PageRecast Figma plugin on a bridge at 127.0.0.1 (nothing leaves this machine). A plugin open in Figma and paired with the returned pairingCode imports it within seconds; pluginConnected says whether one is polling. The user can always import the file instead by dropping it on the plugin window.',
      inputSchema: { recast_path: recastPath },
      annotations: {
        title: 'Send a capture to Figma',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args) =>
      run(async () => {
        const path = resolve(args.recast_path)
        const { file, bytes } = await readRecast(path)
        const queued = await options.bridge.send(bytes, {
          name: recastFileName(file.source.url),
          title: file.source.title,
          url: file.source.url,
        })
        return json({
          queued: queued.file.id,
          pairingCode: queued.pairingCode,
          bridgeUrl: queued.bridgeUrl,
          pluginConnected: queued.pluginConnected,
          next: queued.pluginConnected
            ? 'The plugin is open and paired; it imports the file within a few seconds.'
            : `The plugin has not polled yet. The user opens the PageRecast plugin in Figma and pairs it with code ${queued.pairingCode}; the file waits until then. Without pairing, the user can drop ${path} on the plugin window instead.`,
        })
      }),
  )

  server.registerResource(
    'scene-format',
    SCENE_FORMAT_URI,
    {
      title: 'The .recast format',
      description: 'Specification of the .recast scene format that capture_page writes.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: options.sceneFormat }],
    }),
  )

  return server
}
