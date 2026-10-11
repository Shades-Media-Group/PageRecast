/**
 * The Web tab's render service: PageRecast's server opens a public page and
 * returns it as a `.recast` file. Only the address and the capture settings
 * are sent; the server stores nothing (apps/site/worker).
 */
export const RENDER_URL = 'https://pagerecast.shades.md/api/render'

/** Why a render failed, each with its own short message in the Web tab. */
export type RenderFailure =
  | 'needs-extension'
  | 'bad-url'
  | 'unreachable'
  | 'timeout'
  | 'rate-limited'
  | 'unavailable'
  | 'offline'
  | 'failed'

export class RenderFailed extends Error {
  constructor(readonly reason: RenderFailure) {
    super(reason)
  }
}

const KNOWN: RenderFailure[] = [
  'needs-extension',
  'bad-url',
  'unreachable',
  'timeout',
  'rate-limited',
  'unavailable',
]

export async function renderPage(
  request: { url: string; widths: number[]; theme: 'light' | 'dark' | 'both'; language: string },
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetch(RENDER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'omit',
      ...(signal ? { signal } : {}),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new RenderFailed('offline')
  }
  if (response.ok) return new Uint8Array(await response.arrayBuffer())
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  const reason = KNOWN.find((r) => r === body.error)
  throw new RenderFailed(
    reason ??
      (response.status === 429
        ? 'rate-limited'
        : response.status === 503
          ? 'unavailable'
          : 'failed'),
  )
}
