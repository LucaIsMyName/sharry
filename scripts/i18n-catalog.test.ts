import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { de } from '../apps/web/src/i18n/de.ts'
import { requiredMessages } from './i18n-catalog.ts'

const root = path.resolve(import.meta.dirname, '..')

describe('german catalog', () => {
  it('has an entry for every user-visible string', () => {
    const missing = requiredMessages().filter((message) => !(message in de))
    expect(missing).toEqual([])
  })

  it('keeps named placeholders', () => {
    const broken = Object.entries(de).flatMap(([key, value]) => {
      const names = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '')
      return names.filter((name) => !value.includes(`{${name}}`)).map((name) => `${key} missing {${name}}`)
    })
    expect(broken).toEqual([])
  })
})

describe('docs locales', () => {
  it('gives every english page a german twin', () => {
    const relative = (dir: string) =>
      fs
        .readdirSync(dir, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.md'))
        .sort()
    const en = relative(path.join(root, 'apps/web/docs/en'))
    const german = relative(path.join(root, 'apps/web/docs/de'))
    expect(german).toEqual(en)
  })
})
