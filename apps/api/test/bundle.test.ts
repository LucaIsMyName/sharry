import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('api bundle', () => {
  it('leaves undici outside the ESM bundle', () => {
    const source = readFileSync(new URL('../tsup.config.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/external:\s*\[[^\]]*['"]undici['"]/)
  })
})
