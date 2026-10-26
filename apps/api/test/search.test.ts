import { describe, expect, it } from 'vitest'
import { aiChats, aiMessages, apiKeys, auditLogs, links, qrCodes, redirectDomains, trackingCampaigns, trackingVariants } from '@sharry/database'
import { defaultQrStyle } from '@sharry/shared'
import { searchPhrases, textMatches } from '../src/search.ts'
import { writeSetting } from '../src/settings-store.ts'
import { createSessionUser, getContext, useTestApp, type TestContext } from './helpers.ts'

describe('search', () => {
  useTestApp()

  it('matches a loose or mistyped link name', () => {
    expect(textMatches('test router', 'test-router')).toBe(true)
    expect(textMatches('test-router', 'test-router')).toBe(true)
    expect(textMatches('test route', 'test-router')).toBe(true)
    expect(textMatches('tset router', 'test-router')).toBe(true)
    expect(textMatches('test rouer', 'test-router')).toBe(true)
    expect(textMatches('harbor', 'cap target')).toBe(false)
    const phrases = searchPhrases('analytics for test router')
    expect(phrases.some((phrase) => textMatches(phrase, 'test-router'))).toBe(true)
  })

  it('matches the caller’s own records and hides someone else’s', async () => {
    const ctx = await getContext()
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const grace = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: ada.cookie },
      payload: {
        destinationUrl: 'https://example.com/lighthouse',
        slug: 'beacon',
        title: 'Harbor light',
        description: 'Painted tower',
        utm: { utm_campaign: 'coast-posters' },
      },
    })
    expect(created.statusCode).toBe(200)
    const linkId = created.json().id as string
    const routed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${linkId}`,
      headers: { cookie: ada.cookie },
      payload: {
        routingRules: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Phones only',
            destinationUrl: 'https://example.com/phones',
            conditions: [{ field: 'device', operator: 'is', values: ['mobile'] }],
          },
        ],
      },
    })
    expect(routed.statusCode).toBe(200)
    await ctx.db.insert(qrCodes).values({ linkId, name: 'Window sticker', styleConfig: defaultQrStyle })
    const [campaign] = await ctx.db
      .insert(trackingCampaigns)
      .values({ userId: ada.id, name: 'Spring launch', description: 'Outdoor posters' })
      .returning()
    if (!campaign) throw new Error('missing campaign')
    await ctx.db.insert(trackingVariants).values({ campaignId: campaign.id, linkId, name: 'Poster north' })
    await ctx.db.insert(trackingCampaigns).values({ userId: grace.id, name: 'Spring launch secret', description: null })
    const [chat] = await ctx.db.insert(aiChats).values({ userId: ada.id, title: 'Planning notes' }).returning()
    if (!chat) throw new Error('missing chat')
    await ctx.db.insert(aiMessages).values({ chatId: chat.id, role: 'user', content: 'Ask about the lighthouse keeper' })
    const [otherChat] = await ctx.db.insert(aiChats).values({ userId: grace.id, title: 'Grace private chat' }).returning()
    if (!otherChat) throw new Error('missing chat')
    await ctx.db.insert(aiMessages).values({ chatId: otherChat.id, role: 'user', content: 'lighthouse secret diary' })
    await ctx.db.insert(links).values(
      Array.from({ length: 9 }, (_, index) => ({
        userId: ada.id,
        slug: `cap-${index}`,
        destinationUrl: 'https://example.com/cap',
        title: 'Cap target',
      })),
    )

    const blank = await search(ctx, ada.cookie, '   ')
    expect(blank.json()).toEqual({ links: [], campaigns: [], chats: [] })

    const byTitle = await search(ctx, ada.cookie, 'harbor')
    expect(byTitle.statusCode).toBe(200)
    expect(byTitle.json().links).toEqual([
      {
        id: linkId,
        title: 'Harbor light',
        slug: 'beacon',
        destinationUrl: 'https://example.com/lighthouse',
        description: 'Painted tower',
      },
    ])
    expect(byTitle.json()).not.toHaveProperty('users')
    expect(byTitle.json()).not.toHaveProperty('domains')
    expect(byTitle.json()).not.toHaveProperty('apiKeys')
    expect(byTitle.json()).not.toHaveProperty('audit')

    for (const query of ['beacon', 'lighthouse', 'painted', 'phones only', 'coast-posters', 'window sticker']) {
      expect((await search(ctx, ada.cookie, query)).json().links.map((link: { id: string }) => link.id)).toEqual([linkId])
    }

    const campaigns = (await search(ctx, ada.cookie, 'spring')).json().campaigns
    expect(campaigns).toEqual([{ id: campaign.id, name: 'Spring launch', description: 'Outdoor posters' }])
    expect((await search(ctx, ada.cookie, 'poster north')).json().campaigns[0].id).toBe(campaign.id)

    const chats = (await search(ctx, ada.cookie, 'keeper')).json().chats
    expect(chats[0]).toMatchObject({ id: chat.id, title: 'Planning notes' })
    expect(chats[0].snippet).toContain('lighthouse keeper')
    expect((await search(ctx, ada.cookie, 'secret diary')).json().chats).toEqual([])
    expect((await search(ctx, grace.cookie, 'harbor')).json().links).toEqual([])
    expect((await search(ctx, ada.cookie, 'cap target')).json().links).toHaveLength(8)
  })

  it('follows link visibility and omits secrets from administrator results', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: ada.cookie },
      payload: { destinationUrl: 'https://example.com/ada', slug: 'ada-only', title: 'Ada private' },
    })
    expect(created.statusCode).toBe(200)
    const adminLink = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: admin.cookie },
      payload: { destinationUrl: 'https://example.com/admin', slug: 'admin-only', title: 'Admin private' },
    })
    expect(adminLink.statusCode).toBe(200)

    expect((await search(ctx, admin.cookie, 'ada private')).json().links).toHaveLength(1)
    expect((await search(ctx, ada.cookie, 'admin private')).json().links).toEqual([])
    await writeSetting(ctx.db, 'link_sharing', 'true', admin.id)
    expect((await search(ctx, ada.cookie, 'admin private')).json().links).toEqual([])

    const [domain] = await ctx.db
      .insert(redirectDomains)
      .values({ hostname: 'go.example.com', txtToken: 'hidden-txt-token', status: 'pending' })
      .returning()
    const [key] = await ctx.db
      .insert(apiKeys)
      .values({
        userId: ada.id,
        name: 'Billing bot',
        tokenHash: 'super-secret-hash',
        tokenPrefix: 'sh_bill',
        createdBy: admin.id,
      })
      .returning()
    if (!domain || !key) throw new Error('missing admin record')

    const people = await search(ctx, admin.cookie, 'ada@')
    expect(people.json().users).toEqual([{ id: ada.id, username: 'ada', email: 'ada@example.com' }])
    expect(JSON.stringify(people.json())).not.toContain('password')

    const domains = await search(ctx, admin.cookie, 'go.example')
    expect(domains.json().domains).toEqual([{ id: domain.id, hostname: 'go.example.com' }])
    expect(JSON.stringify(domains.json())).not.toContain('hidden-txt-token')

    const keys = await search(ctx, admin.cookie, 'billing')
    expect(keys.json().apiKeys).toEqual([{ id: key.id, name: 'Billing bot', tokenPrefix: 'sh_bill' }])
    expect(JSON.stringify(keys.json())).not.toContain('super-secret-hash')
    expect((await search(ctx, admin.cookie, 'sh_bill')).json().apiKeys[0].id).toBe(key.id)

    const audit = await search(ctx, admin.cookie, 'link.created')
    expect(audit.json().audit.length).toBeGreaterThan(0)
    expect(audit.json().audit[0]).not.toHaveProperty('metadata')
    expect((await search(ctx, ada.cookie, 'link.created')).json()).not.toHaveProperty('audit')
  })

  it('includes an audit row that is outside the first page', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const [older] = await ctx.db
      .insert(auditLogs)
      .values({
        actorUserId: admin.id,
        action: 'older.marker',
        entityType: 'link',
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
      })
      .returning()
    await ctx.db.insert(auditLogs).values({
      actorUserId: admin.id,
      action: 'newer.marker',
      entityType: 'link',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    })
    if (!older) throw new Error('missing audit row')
    const page = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/audit?limit=1',
      headers: { cookie: admin.cookie },
    })
    expect(page.json().entries.map((entry: { action: string }) => entry.action)).toEqual(['newer.marker'])
    const focused = await ctx.app.inject({
      method: 'GET',
      url: `/api/admin/audit?limit=1&entry=${older.id}`,
      headers: { cookie: admin.cookie },
    })
    expect(focused.statusCode).toBe(200)
    expect(focused.json().entries.map((entry: { id: string }) => entry.id)).toContain(older.id)
    const junk = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/audit?entry=not-a-uuid',
      headers: { cookie: admin.cookie },
    })
    expect(junk.statusCode).toBe(200)
  })

  it('finds test-router from a loose name and hides another person’s link', async () => {
    const ctx = await getContext()
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const grace = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: ada.cookie },
      payload: { destinationUrl: 'https://example.com/router', slug: 'test-router', title: 'Router' },
    })
    expect(created.statusCode).toBe(200)
    const hidden = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: grace.cookie },
      payload: { destinationUrl: 'https://example.com/hidden', slug: 'grace-router', title: 'Test router private' },
    })
    expect(hidden.statusCode).toBe(200)
    const hiddenId = hidden.json().id as string
    for (const query of ['test router', 'test-router', 'test route', 'tset router', 'test rouer']) {
      const ids = (await search(ctx, ada.cookie, query)).json().links.map((link: { id: string }) => link.id)
      expect(ids).toContain(created.json().id)
      expect(ids).not.toContain(hiddenId)
    }
  })
})

function search(ctx: TestContext, cookie: string, q: string) {
  return ctx.app.inject({
    method: 'GET',
    url: `/api/search?q=${encodeURIComponent(q)}`,
    headers: { cookie },
  })
}
