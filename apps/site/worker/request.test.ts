import { describe, expect, it } from 'vitest'
import { isPublicHost } from '@pagerecast/capture'
import { allowedSubrequest, checkUrl, parseRender, RenderError } from './request'

const refusal = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    if (error instanceof RenderError) return { status: error.status, code: error.code }
    throw error
  }
  return null
}

describe('checkUrl', () => {
  it('takes public http and https pages', () => {
    expect(checkUrl('https://pagerecast.shades.md/sample/').href).toBe(
      'https://pagerecast.shades.md/sample/',
    )
    expect(checkUrl('http://example.com:8080/a?b=c').host).toBe('example.com:8080')
    expect(checkUrl('https://8.8.8.8/').hostname).toBe('8.8.8.8')
    expect(checkUrl('https://[2606:4700::1111]/').hostname).toBe('[2606:4700::1111]')
  })

  it('refuses other schemes and things that are not addresses', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com',
      'javascript:alert(1)',
      'chrome://settings',
      'data:text/html,hi',
      'example.com',
      '',
      42,
      `https://example.com/${'x'.repeat(3000)}`,
    ])
      expect(refusal(() => checkUrl(url))).toEqual({ status: 400, code: 'bad-url' })
  })

  it('sends localhost, private networks and logins to the extension', () => {
    for (const url of [
      'http://localhost:3000',
      'http://app.localhost',
      'http://LOCALHOST./',
      'http://127.0.0.1',
      'http://127.1',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://0.0.0.0',
      'http://10.1.2.3',
      'http://172.16.0.1',
      'http://172.31.255.255',
      'http://192.168.1.1',
      'http://169.254.169.254/latest/meta-data',
      'http://100.64.0.1',
      'http://224.0.0.1',
      'http://[::1]/',
      'http://[::]/',
      'http://[fe80::1]/',
      'http://[fd00::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://router/',
      'http://printer.local/',
      'http://db.internal/',
      'https://user:secret@example.com/',
    ])
      expect(
        refusal(() => checkUrl(url)),
        url,
      ).toEqual({ status: 400, code: 'needs-extension' })
  })
})

describe('isPublicHost', () => {
  it('knows the edges of the private IPv4 ranges', () => {
    expect(isPublicHost('172.15.255.255')).toBe(true)
    expect(isPublicHost('172.32.0.1')).toBe(true)
    expect(isPublicHost('100.63.255.255')).toBe(true)
    expect(isPublicHost('100.128.0.1')).toBe(true)
    expect(isPublicHost('11.0.0.1')).toBe(true)
    expect(isPublicHost('localhost.example.com')).toBe(true)
  })
})

describe('allowedSubrequest', () => {
  it('lets the page load public resources and inline data, nothing local', () => {
    expect(allowedSubrequest('https://cdn.example.com/a.png')).toBe(true)
    expect(allowedSubrequest('data:image/png;base64,AA==')).toBe(true)
    expect(allowedSubrequest('blob:https://example.com/1')).toBe(true)
    expect(allowedSubrequest('http://127.0.0.1:9222/json')).toBe(false)
    expect(allowedSubrequest('http://192.168.0.1/')).toBe(false)
    expect(allowedSubrequest('file:///etc/hosts')).toBe(false)
    expect(allowedSubrequest('ws://example.com/')).toBe(false)
  })
})

describe('parseRender', () => {
  const ok = { url: 'https://example.com', widths: [1440, 390], theme: 'both' }
  const bad = (body: unknown) => refusal(() => parseRender(body))
  const request = { status: 400, code: 'bad-request' }

  it('reads the settings and leaves the language empty by default', () => {
    expect(parseRender(ok)).toEqual({
      url: 'https://example.com/',
      widths: [1440, 390],
      themes: ['light', 'dark'],
      language: '',
    })
    expect(parseRender({ ...ok, theme: 'dark', language: 'de-DE' })).toMatchObject({
      themes: ['dark'],
      language: 'de-DE',
    })
  })

  it('counts repeated widths once', () => {
    expect(parseRender({ ...ok, widths: [1440, 1440, 390, 390, 768, 1280] }).widths).toEqual([
      1440, 390, 768, 1280,
    ])
  })

  it('takes at most four widths, within 240 to 3840', () => {
    expect(bad({ ...ok, widths: [1440, 1280, 1024, 768, 390] })).toEqual(request)
    expect(bad({ ...ok, widths: [] })).toEqual(request)
    expect(bad({ ...ok, widths: [239] })).toEqual(request)
    expect(bad({ ...ok, widths: [3841] })).toEqual(request)
    expect(bad({ ...ok, widths: [1440.5] })).toEqual(request)
    expect(bad({ ...ok, widths: ['1440'] })).toEqual(request)
    expect(bad({ ...ok, widths: 1440 })).toEqual(request)
  })

  it('takes light, dark or both, and a language tag', () => {
    expect(bad({ ...ok, theme: 'sepia' })).toEqual(request)
    expect(bad({ ...ok, theme: 'constructor' })).toEqual(request)
    expect(bad({ ...ok, theme: undefined })).toEqual(request)
    expect(bad({ ...ok, language: 'de DE; drop' })).toEqual(request)
    expect(bad({ ...ok, language: 7 })).toEqual(request)
  })

  it('refuses bodies that are not settings, and private pages', () => {
    expect(bad(null)).toEqual(request)
    expect(bad('https://example.com')).toEqual(request)
    expect(bad({ ...ok, url: 'http://localhost' })).toEqual({
      status: 400,
      code: 'needs-extension',
    })
  })
})
