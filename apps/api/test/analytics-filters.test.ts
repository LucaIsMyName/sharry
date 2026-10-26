import { describe, expect, it } from 'vitest'
import { clickEvents } from '@sharry/database'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

describe('analytics filters', () => {
  useTestApp()

  it('combines link, country, browser, operating system, and utm filters, and ignores a hidden link', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const alpha = await createLink(owner.cookie, 'alpha')
    const beta = await createLink(owner.cookie, 'beta')
    const hidden = await createLink(other.cookie, 'hidden')
    await ctx.db.insert(clickEvents).values([
      click(alpha, 'a1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(alpha, 'a2', { countryCode: 'US', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(alpha, 'a3', { countryCode: 'DE', browser: 'Firefox', operatingSystem: 'macOS', utmSource: null }),
      click(alpha, 'a4', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: '' }),
      click(beta, 'b1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h2', { countryCode: 'FR', browser: 'Safari', operatingSystem: 'iOS', utmSource: 'ad' }),
    ])

    const plain = await ctx.app.inject({ method: 'GET', url: '/api/analytics', headers: { cookie: owner.cookie } })
    expect(plain.statusCode).toBe(200)
    expect(plain.json().totalClicks).toBe(5)
    expect((plain.json().links as { slug: string }[]).map((row) => row.slug)).toEqual(['alpha', 'beta'])
    expect(plain.json().options.countries).toEqual(expect.arrayContaining(['DE', 'US']))
    expect(plain.json().options.countries).not.toContain('FR')

    const narrowed = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?link=${alpha}&link=${beta}&link=${hidden}&country=DE&browser=Chrome&os=macOS&utm_source=newsletter`,
      headers: { cookie: owner.cookie },
    })
    expect(narrowed.statusCode).toBe(200)
    expect(narrowed.json().totalClicks).toBe(2)
    expect(narrowed.json().options.countries).toEqual(expect.arrayContaining(['DE', 'US']))

    const eitherCountry = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?link=${alpha}&country=DE&country=US`,
      headers: { cookie: owner.cookie },
    })
    expect(eitherCountry.json().totalClicks).toBe(4)
    const germany = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?link=${alpha}&country=DE`,
      headers: { cookie: owner.cookie },
    })
    expect(germany.json().totalClicks).toBe(3)
    const states = germany.json().links as { slug: string; clicks: number }[]
    expect(states.find((row) => row.slug === 'alpha')?.clicks).toBe(3)
    expect(states.find((row) => row.slug === 'beta')?.clicks).toBe(1)

    const blank = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?link=${alpha}&utm_source=${encodeURIComponent('Not set')}`,
      headers: { cookie: owner.cookie },
    })
    expect(blank.json().totalClicks).toBe(2)
    expect(plain.json().options.utmSources).toContain('Not set')

    const denied = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?link=${hidden}`,
      headers: { cookie: owner.cookie },
    })
    expect(denied.json().totalClicks).toBe(0)
    expect((denied.json().links as { slug: string }[]).map((row) => row.slug)).toEqual(['alpha', 'beta'])

    const tooMany = ['country=DE']
    for (let index = 0; index < 51; index += 1) tooMany.push(`country=X${index}`)
    const rejected = await ctx.app.inject({
      method: 'GET',
      url: `/api/analytics?${tooMany.join('&')}`,
      headers: { cookie: owner.cookie },
    })
    expect(rejected.statusCode).toBe(400)
  })
})

async function createLink(cookie: string, slug: string): Promise<string> {
  const ctx = await getContext()
  const created = await ctx.app.inject({
    method: 'POST',
    url: '/api/links',
    headers: { cookie },
    payload: { destinationUrl: `https://example.com/${slug}`, slug, title: slug },
  })
  expect(created.statusCode).toBe(200)
  return created.json().id as string
}

function click(
  linkId: string,
  visitor: string,
  fields: { countryCode: string; browser: string; operatingSystem: string; utmSource: string | null },
) {
  return {
    linkId,
    countryCode: fields.countryCode,
    browser: fields.browser,
    operatingSystem: fields.operatingSystem,
    deviceType: 'desktop',
    isBot: false,
    anonymousVisitorId: visitor,
    utmSource: fields.utmSource,
  }
}
