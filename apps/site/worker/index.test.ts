import { describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

// The browser itself is Cloudflare's; here it returns a stand-in file.
vi.mock('./render', () => ({ render: vi.fn(async () => new Uint8Array([0x1f, 0x8b, 1])) }))

const assets = { fetch: vi.fn(async () => new Response('static')) }
const env = (extra: Partial<Env> = {}): Env => ({
  ASSETS: assets as unknown as Env['ASSETS'],
  BROWSER: { fetch } as Env['BROWSER'],
  RENDER_LIMIT: { limit: async () => ({ success: true }) },
  ...extra,
})
const post = (body: unknown, ip = '203.0.113.7') =>
  new Request('https://pagerecast.shades.md/api/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
const page = { url: 'https://example.com', widths: [1440], theme: 'light' }

describe('the site Worker', () => {
  it('leaves every other path to the static files', async () => {
    const response = await worker.fetch(new Request('https://pagerecast.shades.md/privacy/'), env())
    expect(await response.text()).toBe('static')
  })

  it('answers the plugin preflight from any origin', async () => {
    const response = await worker.fetch(
      new Request('https://pagerecast.shades.md/api/render', { method: 'OPTIONS' }),
      env(),
    )
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-headers')).toBe('content-type')
  })

  it('returns the gzipped capture', async () => {
    const response = await worker.fetch(post(page), env())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect([...new Uint8Array(await response.arrayBuffer())].slice(0, 2)).toEqual([0x1f, 0x8b])
  })

  it('explains each refusal in JSON', async () => {
    const code = async (response: Response) => [
      response.status,
      ((await response.json()) as { error: string }).error,
    ]
    expect(await code(await worker.fetch(post('{not json'), env()))).toEqual([400, 'bad-request'])
    expect(await code(await worker.fetch(post({ ...page, url: 'ftp://x.com' }), env()))).toEqual([
      400,
      'bad-url',
    ])
    expect(
      await code(await worker.fetch(post({ ...page, url: 'http://10.0.0.1' }), env())),
    ).toEqual([400, 'needs-extension'])
    expect(await code(await worker.fetch(post(page), env({ BROWSER: undefined })))).toEqual([
      503,
      'unavailable',
    ])
    const limited = await worker.fetch(
      post(page),
      env({ RENDER_LIMIT: { limit: async () => ({ success: false }) } }),
    )
    expect(limited.headers.get('retry-after')).toBe('60')
    expect(await code(limited)).toEqual([429, 'rate-limited'])
    expect(
      (await worker.fetch(new Request('https://pagerecast.shades.md/api/render'), env())).status,
    ).toBe(405)
  })

  it('limits each address to six pages a minute without the binding', async () => {
    const statuses = []
    for (let i = 0; i < 7; i++)
      statuses.push(
        (await worker.fetch(post(page, '198.51.100.1'), env({ RENDER_LIMIT: undefined }))).status,
      )
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429])
    // Another address has its own count.
    expect(
      (await worker.fetch(post(page, '198.51.100.2'), env({ RENDER_LIMIT: undefined }))).status,
    ).toBe(200)
  })
})
