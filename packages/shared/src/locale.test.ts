import { describe, expect, it } from 'vitest'
import { localeSchema } from './schemas.ts'

describe('locale', () => {
  it('accepts english and german', () => {
    expect(localeSchema.parse('en')).toBe('en')
    expect(localeSchema.parse('de')).toBe('de')
  })

  it('rejects anything else', () => {
    expect(localeSchema.safeParse('fr').success).toBe(false)
    expect(localeSchema.safeParse('').success).toBe(false)
    expect(localeSchema.safeParse('EN').success).toBe(false)
  })
})
