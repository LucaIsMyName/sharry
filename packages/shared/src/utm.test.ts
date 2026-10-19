import { describe, expect, it } from 'vitest'
import { applyUtm, utmConflicts } from './utm.ts'

describe('utm builder', () => {
  it('preserves unrelated query parameters and the fragment', () => {
    const url = applyUtm('https://example.com/sale?x=1&y=2#frag', {
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'summer_2027',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('x')).toBe('1')
    expect(parsed.searchParams.get('y')).toBe('2')
    expect(parsed.searchParams.get('utm_source')).toBe('newsletter')
    expect(parsed.searchParams.get('utm_medium')).toBe('email')
    expect(parsed.searchParams.get('utm_campaign')).toBe('summer_2027')
    expect(parsed.hash).toBe('#frag')
  })

  it('reports existing utm values that would be replaced', () => {
    expect(utmConflicts('https://example.com/sale?utm_source=old#top', { utm_source: 'newsletter' })).toEqual([
      'utm_source',
    ])
  })
})
