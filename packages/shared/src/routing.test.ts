import { describe, expect, it } from 'vitest'
import { routingRulesSchema } from './schemas.ts'
import {
  conditionForField,
  countryOptions,
  emptyRoutingChoices,
  matchRoute,
  routeHasUnrecognizedValue,
  type RoutingContext,
  type RoutingRule,
} from './routing.ts'

const context: RoutingContext = {
  browser: 'Chrome',
  device: 'desktop',
  operatingSystem: 'Windows',
  countryCode: 'DE',
  referrerHost: 'www.google.com',
  utm: { utm_source: 'Newsletter' },
}

function rule(partial: Partial<RoutingRule> & Pick<RoutingRule, 'destinationUrl' | 'conditions'>): RoutingRule {
  return { id: '11111111-1111-4111-8111-111111111111', ...partial }
}

describe('matchRoute', () => {
  it('returns null when there are no routes', () => {
    expect(matchRoute([], context)).toBeNull()
    expect(matchRoute(null, context)).toBeNull()
    expect(matchRoute({ broken: true }, context)).toBeNull()
  })

  it('uses the first route whose conditions all match', () => {
    const rules = [
      rule({
        destinationUrl: 'https://example.com/safari',
        conditions: [{ field: 'browser', operator: 'is', values: ['safari'] }],
      }),
      rule({
        id: '22222222-2222-4222-8222-222222222222',
        destinationUrl: 'https://example.com/chrome-mobile',
        conditions: [
          { field: 'browser', operator: 'is', values: ['chrome'] },
          { field: 'device', operator: 'is', values: ['mobile'] },
        ],
      }),
      rule({
        id: '33333333-3333-4333-8333-333333333333',
        destinationUrl: 'https://example.com/chrome',
        conditions: [{ field: 'browser', operator: 'is', values: ['Chrome'] }],
      }),
    ]
    expect(matchRoute(rules, context)).toBe('https://example.com/chrome')
    expect(matchRoute(rules, { ...context, device: 'mobile' })).toBe('https://example.com/chrome-mobile')
  })

  it('matches is not, any of, referrer suffixes, and query utm without case', () => {
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/other', conditions: [{ field: 'browser', operator: 'is_not', values: ['safari'] }] })],
        context,
      ),
    ).toBe('https://example.com/other')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/browsers', conditions: [{ field: 'browser', operator: 'any_of', values: ['firefox', 'chrome'] }] })],
        context,
      ),
    ).toBe('https://example.com/browsers')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/google', conditions: [{ field: 'referrer', operator: 'is', values: ['google'] }] })],
        { ...context, referrerHost: 'news.google.com' },
      ),
    ).toBe('https://example.com/google')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/gmail', conditions: [{ field: 'referrer', operator: 'is', values: ['gmail'] }] })],
        { ...context, referrerHost: 'mail.google.com' },
      ),
    ).toBe('https://example.com/gmail')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/direct', conditions: [{ field: 'referrer', operator: 'is', values: ['none'] }] })],
        { ...context, referrerHost: null },
      ),
    ).toBe('https://example.com/direct')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/news', conditions: [{ field: 'utm_source', operator: 'is', values: ['newsletter'] }] })],
        context,
      ),
    ).toBe('https://example.com/news')
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/spring', conditions: [{ field: 'utm_campaign', operator: 'is', values: ['Spring Sale'] }] })],
        { ...context, utm: { utm_campaign: 'spring sale' } },
      ),
    ).toBe('https://example.com/spring')
  })

  it('skips a stale, unknown, country-less, or invalid route and keeps checking', () => {
    const rules = [
      rule({
        destinationUrl: 'notaurl',
        conditions: [{ field: 'browser', operator: 'is', values: ['chrome'] }],
      }),
      rule({
        id: '22222222-2222-4222-8222-222222222222',
        destinationUrl: 'https://example.com/old',
        conditions: [{ field: 'browser', operator: 'is', values: ['netscape'] }],
      }),
      rule({
        id: '33333333-3333-4333-8333-333333333333',
        destinationUrl: 'https://example.com/unknown',
        conditions: [{ field: 'platform', operator: 'contains', values: ['chrome'] }],
      }),
      rule({
        id: '44444444-4444-4444-8444-444444444444',
        destinationUrl: 'https://example.com/country',
        conditions: [{ field: 'country', operator: 'is', values: ['DE'] }],
      }),
      rule({
        id: '55555555-5555-4555-8555-555555555555',
        destinationUrl: 'https://example.com/next',
        conditions: [{ field: 'browser', operator: 'any_of', values: ['netscape', 'chrome'] }],
      }),
    ]
    expect(matchRoute(rules, { ...context, countryCode: null })).toBe('https://example.com/next')
    expect(matchRoute(rules, context)).toBe('https://example.com/country')
  })

  it('returns null when a throwing rule is the only candidate', () => {
    const rules = [
      {
        get destinationUrl(): string {
          throw new Error('stale')
        },
        conditions: [{ field: 'browser', operator: 'is', values: ['chrome'] }],
      },
    ]
    expect(matchRoute(rules, context)).toBeNull()
  })

  it('does not treat an empty condition list or a missing country as a match', () => {
    expect(
      matchRoute([rule({ destinationUrl: 'https://example.com/open', conditions: [] })], context),
    ).toBeNull()
    expect(
      matchRoute(
        [rule({ destinationUrl: 'https://example.com/de', conditions: [{ field: 'country', operator: 'is_not', values: ['US'] }] })],
        { ...context, countryCode: null },
      ),
    ).toBeNull()
  })
})

describe('routing catalogs', () => {
  it('names countries from the locale and resets a condition to that field’s first value', () => {
    expect(countryOptions('en').some((country) => country.id === 'DE' && country.label === 'Germany')).toBe(true)
    expect(countryOptions('de').some((country) => country.id === 'DE' && country.label === 'Deutschland')).toBe(true)
    expect(conditionForField('device', emptyRoutingChoices())).toEqual({ field: 'device', operator: 'is', values: ['desktop'] })
    expect(conditionForField('utm_campaign', { ...emptyRoutingChoices(), utm_campaign: ['spring'] })).toEqual({
      field: 'utm_campaign',
      operator: 'is',
      values: ['spring'],
    })
  })

  it('flags a retired value and still accepts it in the save schema', () => {
    const retired = rule({
      destinationUrl: 'https://example.com/old',
      conditions: [{ field: 'browser', operator: 'is', values: ['netscape'] }],
    })
    expect(routeHasUnrecognizedValue(retired)).toBe(true)
    expect(routingRulesSchema.safeParse([retired]).success).toBe(true)
    expect(
      routingRulesSchema.safeParse([
        rule({
          destinationUrl: 'https://example.com/one',
          conditions: [{ field: 'browser', operator: 'is', values: ['chrome', 'safari'] }],
        }),
      ]).success,
    ).toBe(false)
    expect(routingRulesSchema.safeParse(Array.from({ length: 51 }, () => retired)).success).toBe(false)
  })
})
