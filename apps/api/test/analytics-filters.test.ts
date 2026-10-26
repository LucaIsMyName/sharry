import { describe, expect, it, vi } from 'vitest'
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

  it('summarizes two links and a country as that filtered click count', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'mina', email: 'mina@example.com', role: 'admin' })
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const saved = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: admin.cookie },
      payload: { aiProvider: 'openai', aiModel: 'gpt-4.1-mini', aiApiKey: 'sk-test-secret' },
    })
    expect(saved.statusCode).toBe(200)
    const alpha = await createLink(owner.cookie, 'alpha')
    const beta = await createLink(owner.cookie, 'beta')
    const extra = await createLink(owner.cookie, 'extra')
    const hidden = await createLink(other.cookie, 'hidden')
    await ctx.db.insert(clickEvents).values([
      click(alpha, 'a1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(alpha, 'a2', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(alpha, 'a3', { countryCode: 'US', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(beta, 'b1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(extra, 'e1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(extra, 'e2', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(extra, 'e3', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(extra, 'e4', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h1', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h2', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h3', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h4', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
      click(hidden, 'h5', { countryCode: 'DE', browser: 'Chrome', operatingSystem: 'macOS', utmSource: 'newsletter' }),
    ])
    vi.stubGlobal(
      'fetch',
      async () => sse([{ choices: [{ delta: { content: 'A quiet week.' } }] }]),
    )
    try {
      const summary = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/summarize-analytics',
        headers: { cookie: owner.cookie },
        payload: { linkIds: [alpha, beta, hidden], country: ['DE'] },
      })
      expect(summary.statusCode).toBe(200)
      expect(summary.json().summary).toContain('3 clicks')
      expect(summary.json().summary).not.toContain('7 clicks')
      expect(summary.json().summary).not.toContain('8 clicks')
    } finally {
      vi.unstubAllGlobals()
    }
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

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
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
