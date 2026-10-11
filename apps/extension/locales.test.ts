import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LOCALES } from '@pagerecast/i18n'

// The store name, summary and shortcut texts, one folder per interface language.
describe('store listings', () => {
  const dir = fileURLToPath(new URL('_locales/', import.meta.url))
  const folders = readdirSync(dir).sort()
  const read = (folder: string) =>
    JSON.parse(readFileSync(`${dir}${folder}/messages.json`, 'utf8')) as Record<
      string,
      { message: string }
    >
  const english = read('en')

  it('has a folder per interface language', () => {
    expect(folders).toEqual(LOCALES.map((l) => l.replace('-', '_')).sort())
  })

  for (const folder of folders) {
    it(`${folder} fits the store limits and has every message`, () => {
      const messages = read(folder)
      expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort())
      // Chrome and Firefox both cap the name at 75 and the summary at 132 characters.
      expect(messages.appName!.message.length).toBeLessThanOrEqual(75)
      expect(messages.appName!.message.startsWith('PageRecast')).toBe(true)
      expect(messages.appDescription!.message.length).toBeLessThanOrEqual(132)
      for (const { message } of Object.values(messages)) expect(message.trim()).not.toBe('')
    })
  }
})
