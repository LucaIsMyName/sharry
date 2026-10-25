import { describe, expect, it } from 'vitest'
import { apiKeySecretPrefix, apiKeyTokenPrefix, appSlug, sessionCookieName, unlockCookieName } from './brand.ts'

describe('app name slug', () => {
  it('keeps Sharry and turns spaces into hyphens', () => {
    expect(appSlug('Sharry')).toBe('sharry')
    expect(appSlug('My Brand')).toBe('my-brand')
    expect(appSlug('  My   Brand!!! ')).toBe('my-brand')
    expect(appSlug('Café Links')).toBe('cafe-links')
  })

  it('falls back to sharry when the name has no letters or digits', () => {
    expect(appSlug('')).toBe('sharry')
    expect(appSlug('   ')).toBe('sharry')
    expect(appSlug('!!!')).toBe('sharry')
  })

  it('caps the slug so a DNS label still fits', () => {
    expect(appSlug('a'.repeat(50))).toBe('a'.repeat(40))
    expect(appSlug(`${'a'.repeat(39)}-extra`)).toBe('a'.repeat(39))
  })

  it('builds the runtime prefixes from the slug', () => {
    expect(sessionCookieName('Sharry')).toBe('sharry_session')
    expect(unlockCookieName('Sharry')).toBe('sharry_unlock')
    expect(apiKeySecretPrefix('Sharry')).toBe('sharry_')
    expect(sessionCookieName('My Brand')).toBe('my-brand_session')
    expect(unlockCookieName('My Brand')).toBe('my-brand_unlock')
    expect(apiKeySecretPrefix('My Brand')).toBe('my-brand_')
    expect(apiKeyTokenPrefix('sharry_abcdefghij', 'Sharry')).toBe('sharry_abcde')
    expect(apiKeyTokenPrefix('my-brand_abcdefghij', 'My Brand')).toBe('my-brand_abcd')
  })
})
