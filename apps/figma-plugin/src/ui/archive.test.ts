import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { mhtmlPage, readZip, zipPage } from './archive'

/** A minimal zip: deflated entries, then the central directory. */
function zip(files: Record<string, string>): Uint8Array {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text))
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(text.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(data.length, 20)
    entry.writeUInt32LE(text.length, 24)
    entry.writeUInt16LE(nameBytes.length, 28)
    entry.writeUInt32LE(offset, 42)
    parts.push(local, nameBytes, data)
    central.push(entry, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, directory, end]))
}

describe('readZip', () => {
  it('unpacks deflated entries by path', async () => {
    const files = await readZip(zip({ 'site/index.html': '<h1>Hi</h1>', 'site/a.css': 'h1{}' }))
    expect(new TextDecoder().decode(files.get('site/index.html'))).toBe('<h1>Hi</h1>')
    expect(new TextDecoder().decode(files.get('site/a.css'))).toBe('h1{}')
  })

  it('picks the top-most index.html and keys files as URLs', async () => {
    const page = await zipPage(
      zip({ 'site/docs/index.html': 'deep', 'site/index.html': 'top', 'site/img/a.png': 'x' }),
    )
    expect(page.html).toBe('top')
    expect(page.url).toBe('https://archive.invalid/site/index.html')
    expect(page.resources.get('https://archive.invalid/site/img/a.png')?.type).toBe('image/png')
  })

  it('refuses files that are not zips', async () => {
    await expect(readZip(new Uint8Array(40))).rejects.toThrow('not a zip')
  })
})

describe('mhtmlPage', () => {
  it('reads the page and its base64 and quoted-printable parts', () => {
    const text = [
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; type="text/html"; boundary="----B"',
      '',
      '------B',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: quoted-printable',
      'Content-Location: https://example.com/',
      '',
      '<p class=3D"x">Caf=C3=A9 =',
      'au lait</p>',
      '------B',
      'Content-Type: image/png',
      'Content-Transfer-Encoding: base64',
      'Content-Location: https://example.com/a.png',
      '',
      'iVBORw0K',
      '------B--',
    ].join('\r\n')
    const page = mhtmlPage(text)
    expect(page.url).toBe('https://example.com/')
    expect(page.html).toBe('<p class="x">Café au lait</p>')
    expect(page.resources.get('https://example.com/a.png')).toMatchObject({ type: 'image/png' })
    expect(page.resources.get('https://example.com/a.png')!.bytes.slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    )
  })
})
