import { describe, expect, it } from 'vitest'
import {
  analyticsSummarySentences,
  extractJson,
  rulesFromModel,
  titleLooksLikeSite,
  utmFromModel,
  variantsFromModel,
  type AnalyticsReport,
} from './assist.ts'

describe('assist parsers', () => {
  it('reads UTM fields from a JSON object and ignores blanks', () => {
    expect(utmFromModel(extractJson('```json\n{"utm_source":"newsletter","utm_medium":" email ","utm_campaign":""}\n```'))).toEqual({
      utm_source: 'newsletter',
      utm_medium: 'email',
    })
    expect(utmFromModel({ utm_source: '', utm_medium: '', utm_campaign: '' })).toBeNull()
  })

  it('keeps only routes with a real URL and a known condition', () => {
    const rules = rulesFromModel({
      rules: [
        {
          name: 'Germany',
          destinationUrl: 'https://example.com/de',
          conditions: [{ field: 'country', operator: 'is', values: ['de'] }],
        },
        {
          name: 'Phones',
          destinationUrl: '/relative',
          conditions: [{ field: 'device', operator: 'is', values: ['mobile'] }],
        },
        {
          destinationUrl: 'https://apps.example.com',
          conditions: [{ field: 'operating_system', operator: 'is not', values: ['iOS'] }],
        },
      ],
    })
    expect(rules).toHaveLength(2)
    expect(rules?.[0]).toMatchObject({
      name: 'Germany',
      destinationUrl: 'https://example.com/de',
      conditions: [{ field: 'country', operator: 'is', values: ['DE'] }],
    })
    expect(rules?.[1]?.conditions).toEqual([{ field: 'operating_system', operator: 'is_not', values: ['ios'] }])
    expect(rules?.[1]?.name).toBeUndefined()
  })

  it('splits a variant reply into named drafts', () => {
    expect(
      variantsFromModel({
        description: 'Tracked copies for the launch.',
        variants: [
          { name: 'Newsletter', utm_source: 'newsletter', utm_medium: 'email', utm_campaign: '' },
          { name: '', utm_source: 'instagram' },
          { name: 'Poster', utm_source: 'poster', utm_medium: 'qr' },
        ],
      }),
    ).toEqual({
      description: 'Tracked copies for the launch.',
      variants: [
        { name: 'Newsletter', utm: { utm_source: 'newsletter', utm_medium: 'email' } },
        { name: 'Poster', utm: { utm_source: 'poster', utm_medium: 'qr' } },
      ],
    })
  })

  it('treats a bare host title as a site name', () => {
    expect(titleLooksLikeSite('', 'https://example.com/pricing')).toBe(true)
    expect(titleLooksLikeSite('Example', 'https://www.example.com/pricing')).toBe(true)
    expect(titleLooksLikeSite('Pricing guide', 'https://example.com/pricing')).toBe(false)
  })

  it('writes totals, the later-half change, and the top dimension', () => {
    const report: AnalyticsReport = {
      from: '2026-10-01',
      to: '2026-10-05',
      totalClicks: 10,
      uniqueVisitors: 4,
      series: [
        { date: '2026-10-01', clicks: 1 },
        { date: '2026-10-02', clicks: 1 },
        { date: '2026-10-03', clicks: 4 },
        { date: '2026-10-04', clicks: 4 },
      ],
      referrers: [{ name: 'news.example.com', clicks: 6 }],
      countries: [{ name: 'DE', clicks: 3 }],
      utmSources: [{ name: 'Not set', clicks: 10 }],
    }
    const text = analyticsSummarySentences('en', report, { from: '2026-10-01', to: '2026-10-04' })
    expect(text).toContain('From 2026-10-01 to 2026-10-04: 10 clicks and 4 unique visitors.')
    expect(text).toContain('Clicks are up 300% in the later half of this range.')
    expect(text).toContain('The top referrer is news.example.com with 6 clicks.')
    const german = analyticsSummarySentences('de', report, { from: '2026-10-01', to: '2026-10-04' })
    expect(german).toContain('10 Klicks')
    expect(german).toContain('news.example.com')
  })
})
