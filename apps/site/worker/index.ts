/**
 * The website Worker: static files as before, plus POST /api/render, which opens a
 * public page in Cloudflare Browser Rendering and returns it as a `.recast` file
 * for the Figma plugin's Web tab. Nothing is stored and no address is logged.
 */
import type { BrowserWorker } from '@cloudflare/puppeteer'
import { LIMITS, parseRender, RenderError } from './request'
import { render } from './render'

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  ASSETS: { fetch: typeof fetch }
  /** Browser Rendering; missing when the plan or the binding is not set up. */
  BROWSER?: BrowserWorker
  /** Workers Rate Limiting, per IP address; see wrangler.jsonc. */
  RENDER_LIMIT?: RateLimit
}

// The plugin iframe's origin is "null", so this one route answers any origin.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

const PER_MINUTE = 6

// ponytail: per-isolate counter, only used where the RENDER_LIMIT binding is missing (local dev).
const counts = new Map<string, { count: number; until: number }>()
const fallbackLimit: RateLimit = {
  async limit({ key }) {
    const now = Date.now()
    const entry = counts.get(key)
    if (!entry || entry.until < now) {
      if (counts.size > 10_000) counts.clear()
      counts.set(key, { count: 1, until: now + 60_000 })
      return { success: true }
    }
    entry.count++
    return { success: entry.count <= PER_MINUTE }
  },
}

function failure(error: RenderError): Response {
  return Response.json(
    { error: error.code, message: error.message },
    {
      status: error.status,
      headers: {
        ...CORS,
        'cache-control': 'no-store',
        ...(error.status === 429 ? { 'retry-after': '60' } : {}),
      },
    },
  )
}

async function handleRender(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } })

  const text = await request.text()
  if (text.length > LIMITS.bodyBytes)
    throw new RenderError(400, 'bad-request', 'The request is too large.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new RenderError(400, 'bad-request', 'Send JSON: { url, widths, theme }.')
  }
  const job = parseRender(body)

  const ip = request.headers.get('cf-connecting-ip') ?? 'local'
  const { success } = await (env.RENDER_LIMIT ?? fallbackLimit).limit({ key: ip })
  if (!success)
    throw new RenderError(
      429,
      'rate-limited',
      `At most ${PER_MINUTE} pages a minute. Try again shortly.`,
    )
  if (!env.BROWSER)
    throw new RenderError(503, 'unavailable', 'Rendering is not set up on this server.')

  const bytes = await render(env.BROWSER, job)
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      ...CORS,
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="capture.recast"',
      'cache-control': 'no-store',
    },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname !== '/api/render') return env.ASSETS.fetch(request)
    try {
      return await handleRender(request, env)
    } catch (error) {
      // Never log here: errors from the page can carry its address.
      return failure(
        error instanceof RenderError
          ? error
          : new RenderError(422, 'capture-failed', 'The page could not be captured.'),
      )
    }
  },
}
