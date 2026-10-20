import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { clickEvents, links } from '@sharry/database'
import { defaultQrStyle } from '@sharry/shared'
import { createLink } from '../src/links.ts'
import { clearLinkPasswordAttempts } from '../src/redirect.ts'
import { getSettings, writeSetting } from '../src/settings-store.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'
import type { Actor } from '../src/auth.ts'

describe('short links', () => {
  useTestApp()

  it('hides another user link and lets an administrator edit it', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/one', slug: 'ada-link' },
    })
    expect(created.statusCode).toBe(200)
    const id = created.json().id as string
    const hidden = await ctx.app.inject({ method: 'GET', url: `/api/links/${id}`, headers: { cookie: other.cookie } })
    expect(hidden.statusCode).toBe(404)
    const edited = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${id}`,
      headers: { cookie: admin.cookie },
      payload: { title: 'From admin' },
    })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().title).toBe('From admin')
  })

  it('rejects a duplicate custom slug, including concurrent creates', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const payload = { destinationUrl: 'https://example.com/sale', slug: 'summer-sale' }
    const first = await ctx.app.inject({ method: 'POST', url: '/api/links', headers: { cookie: user.cookie }, payload })
    expect(first.statusCode).toBe(200)
    const second = await ctx.app.inject({ method: 'POST', url: '/api/links', headers: { cookie: user.cookie }, payload })
    expect(second.statusCode).toBe(409)
    expect(second.json().error).toBe('This short URL is already in use. Please choose a different slug.')

    const parallel = await Promise.all([
      ctx.app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/a', slug: 'race-slug' },
      }),
      ctx.app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/b', slug: 'race-slug' },
      }),
    ])
    expect(parallel.map((response) => response.statusCode).sort()).toEqual([200, 409])
  })

  it('retries random slug collisions and then fails cleanly', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const actor: Actor = {
      id: user.id,
      username: 'ada',
      email: 'ada@example.com',
      role: 'user',
      isActive: true,
      totpEnabled: true,
      mustChangePassword: false,
      scope: 'full',
    }
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/taken', slug: 'taken-slug' },
    })
    const settings = await getSettings(ctx.db, ctx.env)
    let calls = 0
    const created = await createLink(ctx.db, actor, { destinationUrl: 'https://example.com/random' }, settings, () => {
      calls += 1
      return calls === 1 ? 'taken-slug' : 'fresh-slug'
    })
    expect(created.slug).toBe('fresh-slug')
    await expect(
      createLink(ctx.db, actor, { destinationUrl: 'https://example.com/again' }, settings, () => 'fresh-slug'),
    ).rejects.toThrow(/unique slug/)
  })

  it('asks for a link password and redirects again after it is removed', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/secret', slug: 'gated', redirectType: '301' },
    })
    const saved = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${created.json().id}`,
      headers: { cookie: user.cookie },
      payload: { password: 'poster-secret' },
    })
    expect(saved.json().hasPassword).toBe(true)
    const gated = await ctx.app.inject({ method: 'GET', url: '/s/gated' })
    expect(gated.statusCode).toBe(200)
    expect(gated.body).toContain('password protected')
    expect(gated.body).toContain('#13119b')
    expect(gated.body).not.toContain('999px')
    expect(gated.headers['cache-control']).toBe('no-store')
    const wrong = await ctx.app.inject({ method: 'POST', url: '/s/gated', payload: { password: 'nope' } })
    expect(wrong.statusCode).toBe(401)
    expect(wrong.body).toContain('incorrect')
    expect(wrong.body).toContain('password protected')
    const right = await ctx.app.inject({ method: 'POST', url: '/s/gated', payload: { password: 'poster-secret' } })
    expect(right.statusCode).toBe(303)
    expect(right.headers.location).toBe('https://example.com/secret')
    expect(right.headers['cache-control']).toBe('no-store')
    const unlockClicks = await waitForClicks(ctx.db, 1)
    expect(unlockClicks).toHaveLength(1)
    const unlocked = await ctx.app.inject({
      method: 'GET',
      url: '/s/gated',
      headers: { cookie: cookieHeader(right.headers['set-cookie']) },
    })
    expect(unlocked.statusCode).toBe(301)
    const cleared = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${created.json().id}`,
      headers: { cookie: user.cookie },
      payload: { password: null },
    })
    expect(cleared.json().hasPassword).toBe(false)
    const open = await ctx.app.inject({ method: 'GET', url: '/s/gated' })
    expect(open.statusCode).toBe(301)
    expect(open.headers.location).toBe('https://example.com/secret')
    expect(open.headers['cache-control']).toBe('no-store')
  })

  it('changes and clears a slug when empty UTM fields are null', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/custom' },
    })
    const id = created.json().id as string
    const randomSlug = created.json().slug as string
    const utm = {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_id: null,
      utm_term: null,
      utm_content: null,
    }
    const custom = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${id}`,
      headers: { cookie: user.cookie },
      payload: { slug: 'summer-sale', utm },
    })
    expect(custom.statusCode).toBe(200)
    expect(custom.json().slug).toBe('summer-sale')
    const cleared = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${id}`,
      headers: { cookie: user.cookie },
      payload: { slug: '', utm },
    })
    expect(cleared.statusCode).toBe(200)
    const slug = cleared.json().slug as string
    expect(slug).not.toBe('summer-sale')
    expect(slug).not.toBe(randomSlug)
    expect(slug).toHaveLength(5)
  })

  it('lists click counts per link and keeps a single link separate', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const busy = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/busy', slug: 'busy', title: 'Busy' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/quiet', slug: 'quiet', title: 'Quiet' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: other.cookie },
      payload: { destinationUrl: 'https://example.com/foreign', slug: 'foreign' },
    })
    await ctx.app.inject({ method: 'GET', url: '/s/busy' })
    await ctx.app.inject({ method: 'GET', url: '/s/busy' })
    await ctx.app.inject({ method: 'GET', url: '/s/foreign' })
    await waitForClicks(ctx.db, 3)
    const overview = await ctx.app.inject({ method: 'GET', url: '/api/analytics', headers: { cookie: user.cookie } })
    expect(overview.statusCode).toBe(200)
    const rows = overview.json().links as { slug: string; title: string | null; clicks: number }[]
    expect(rows.map((row) => row.slug)).toEqual(['busy', 'quiet'])
    expect(rows[0]).toMatchObject({ title: 'Busy', clicks: 2 })
    expect(rows[1]).toMatchObject({ title: 'Quiet', clicks: 0 })
    const listed = await ctx.app.inject({ method: 'GET', url: '/api/links', headers: { cookie: user.cookie } })
    const listedRows = listed.json().links as { slug: string; clicks: number }[]
    expect(listedRows.find((row) => row.slug === 'busy')?.clicks).toBe(2)
    expect(listedRows.find((row) => row.slug === 'quiet')?.clicks).toBe(0)
    const adminView = await ctx.app.inject({ method: 'GET', url: '/api/analytics', headers: { cookie: admin.cookie } })
    expect((adminView.json().links as { slug: string }[]).map((row) => row.slug).sort()).toEqual(['busy', 'foreign', 'quiet'])
    const one = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${busy.json().id}/analytics`,
      headers: { cookie: user.cookie },
    })
    expect(one.json().totalClicks).toBe(2)
    expect(one.json().links).toBeUndefined()
  })

  it('includes the calendar end day and rejects a range longer than 400 days', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/dated', slug: 'dated' },
    })
    const linkId = created.json().id as string
    await ctx.db.insert(clickEvents).values([
      clickAt(linkId, '2026-10-19T23:00:00.000Z'),
      clickAt(linkId, '2026-10-20T15:00:00.000Z'),
      clickAt(linkId, '2026-10-21T01:00:00.000Z'),
    ])
    const day = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${linkId}/analytics?from=2026-10-20&to=2026-10-20`,
      headers: { cookie: user.cookie },
    })
    expect(day.statusCode).toBe(200)
    expect(day.json().totalClicks).toBe(1)
    expect(day.json().series).toEqual([{ date: '2026-10-20', clicks: 1 }])
    const wide = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${linkId}/analytics?from=2020-01-01&to=2026-10-20`,
      headers: { cookie: user.cookie },
    })
    expect(wide.statusCode).toBe(400)
    expect(wide.json().error).toMatch(/400 days/)
  })

  it('assigns a random slug when a saved slug is cleared', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/custom', slug: 'summer-sale' },
    })
    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${created.json().id}`,
      headers: { cookie: user.cookie },
      payload: { slug: '' },
    })
    expect(updated.statusCode).toBe(200)
    const slug = updated.json().slug as string
    expect(slug).not.toBe('summer-sale')
    expect(slug).toHaveLength(5)
    const oldPath = await ctx.app.inject({ method: 'GET', url: '/s/summer-sale' })
    expect(oldPath.statusCode).toBe(404)
    const next = await ctx.app.inject({ method: 'GET', url: `/s/${slug}` })
    expect(next.statusCode).toBe(302)
    expect(next.headers.location).toBe('https://example.com/custom')
  })

  it('changes the destination without changing the slug or click history', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/2026', slug: 'summer' },
    })
    const slug = created.json().slug as string
    const visit = await ctx.app.inject({ method: 'GET', url: `/s/${slug}` })
    expect(visit.statusCode).toBe(302)
    expect(visit.headers.location).toBe('https://example.com/2026')
    const before = await waitForClicks(ctx.db, 1)
    expect(before).toHaveLength(1)
    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${created.json().id}`,
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/2027' },
    })
    expect(updated.json().slug).toBe(slug)
    const row = await ctx.db.select().from(links).where(eq(links.slug, slug))
    expect(row[0]?.destinationUrl).toBe('https://example.com/2027')
    expect(await ctx.db.select().from(clickEvents)).toHaveLength(1)
    const next = await ctx.app.inject({ method: 'GET', url: `/s/${slug}` })
    expect(next.headers.location).toBe('https://example.com/2027')
  })

  it('resolves the active prefix and an optional legacy prefix', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: admin.cookie },
      payload: { destinationUrl: 'https://example.com/go', slug: 'promo' },
    })
    expect((await ctx.app.inject({ method: 'GET', url: '/s/promo' })).statusCode).toBe(302)
    const changed = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: admin.cookie },
      payload: { shortUrlPrefix: '/go', confirmPrefixChange: true, legacyPrefixEnabled: true },
    })
    expect(changed.statusCode).toBe(200)
    expect((await ctx.app.inject({ method: 'GET', url: '/go/promo' })).statusCode).toBe(302)
    expect((await ctx.app.inject({ method: 'GET', url: '/s/promo' })).statusCode).toBe(302)
    await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: admin.cookie },
      payload: { legacyPrefixEnabled: false },
    })
    expect((await ctx.app.inject({ method: 'GET', url: '/s/promo' })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: '/go/promo' })).statusCode).toBe(302)
  })

  it('records only a tracking variant that belongs to the clicked link', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/alpha', slug: 'alpha' },
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/beta', slug: 'beta' },
    })
    const campaign = await ctx.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: user.cookie },
      payload: { name: 'Summer' },
    })
    const own = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: first.json().id, name: 'Email', utm: { utm_source: 'email' } },
    })
    const foreign = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: second.json().id, name: 'Poster', utm: { utm_source: 'poster' } },
    })
    expect(own.statusCode).toBe(200)
    expect(foreign.statusCode).toBe(200)
    const campaigns = await ctx.app.inject({ method: 'GET', url: '/api/campaigns', headers: { cookie: user.cookie } })
    expect(campaigns.json().campaigns).toEqual([expect.objectContaining({ name: 'Summer', variantCount: 2 })])

    const crossed = await ctx.app.inject({ method: 'GET', url: `/s/alpha?v=${foreign.json().id}` })
    expect(crossed.statusCode).toBe(302)
    expect(crossed.headers.location).toBe('https://example.com/alpha')
    const unknown = await ctx.app.inject({
      method: 'GET',
      url: '/s/alpha?v=00000000-0000-4000-8000-000000000000',
    })
    expect(unknown.statusCode).toBe(302)
    expect(unknown.headers.location).toBe('https://example.com/alpha')
    const matched = await ctx.app.inject({ method: 'GET', url: `/s/alpha?v=${own.json().id}` })
    expect(matched.statusCode).toBe(302)
    expect(matched.headers.location).toBe('https://example.com/alpha?utm_source=email')

    const rows = await waitForClicks(ctx.db, 3)
    expect(rows.map((row) => row.trackingVariantId).sort()).toEqual([null, null, own.json().id].sort())
  })

  it('updates a variant in place and lists it only on its link', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/alpha', slug: 'alpha' },
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/beta', slug: 'beta' },
    })
    const campaign = await ctx.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: user.cookie },
      payload: { name: 'Summer' },
    })
    const own = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: first.json().id, name: 'Email', utm: { utm_source: 'email' } },
    })
    const foreign = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: second.json().id, name: 'Poster', utm: { utm_source: 'poster' } },
    })
    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/variants/${own.json().id}`,
      headers: { cookie: user.cookie },
      payload: { name: 'Newsletter', utm: { utm_medium: 'email' } },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({
      name: 'Newsletter',
      linkId: first.json().id,
      utm: { utm_source: null, utm_medium: 'email' },
    })
    const listed = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${first.json().id}/variants`,
      headers: { cookie: user.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().variants.map((variant: { id: string }) => variant.id)).toEqual([own.json().id])
    const other = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${second.json().id}/variants`,
      headers: { cookie: user.cookie },
    })
    expect(other.json().variants.map((variant: { id: string }) => variant.id)).toEqual([foreign.json().id])
  })

  it('counts stored UTM values in analytics', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/alpha', slug: 'alpha' },
    })
    const campaign = await ctx.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: user.cookie },
      payload: { name: 'Summer' },
    })
    const variant = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Email', utm: { utm_source: 'newsletter', utm_medium: 'email' } },
    })
    const clicked = await ctx.app.inject({ method: 'GET', url: `/s/alpha?v=${variant.json().id}` })
    expect(clicked.headers.location).toBe('https://example.com/alpha?utm_source=newsletter&utm_medium=email')
    await waitForClicks(ctx.db, 1)
    const analytics = await ctx.app.inject({ method: 'GET', url: '/api/analytics', headers: { cookie: user.cookie } })
    expect(analytics.statusCode).toBe(200)
    expect(analytics.json().utmSources).toEqual([{ name: 'newsletter', clicks: 1 }])
    expect(analytics.json().utmMediums).toEqual([{ name: 'email', clicks: 1 }])
    expect(analytics.json().utmCampaigns).toEqual([{ name: 'Not set', clicks: 1 }])
  })

  it('rejects a QR code attached to another link’s variant', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/alpha', slug: 'alpha' },
    })
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/beta', slug: 'beta' },
    })
    const campaign = await ctx.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: user.cookie },
      payload: { name: 'Summer' },
    })
    const variant = await ctx.app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.json().id}/variants`,
      headers: { cookie: user.cookie },
      payload: { linkId: second.json().id, name: 'Poster' },
    })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: {
        linkId: first.json().id,
        name: 'Poster',
        style: defaultQrStyle,
        trackingVariantId: variant.json().id,
      },
    })
    expect(created.statusCode).toBe(400)
    expect(created.json().error).toBe('That variant does not belong to this link')
  })

  it('keeps public URLs on the server environment', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    await writeSetting(ctx.db, 'app_url', 'https://old.example', admin.id)
    await writeSetting(ctx.db, 'short_url_base', 'https://old.example', admin.id)
    const saved = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: admin.cookie },
      payload: { appUrl: 'https://evil.example', shortUrlBase: 'https://evil.example', slugLength: 6 },
    })
    expect(saved.statusCode).toBe(200)
    const settings = await getSettings(ctx.db, ctx.env)
    expect(settings.appUrl).toBe('http://127.0.0.1:5173')
    expect(settings.shortUrlBase).toBe('http://127.0.0.1:3000')
    expect(settings.slugLength).toBe(6)
    expect(saved.json().appUrl).toBe('http://127.0.0.1:5173')
    expect(saved.json().shortUrlBase).toBe('http://127.0.0.1:3000')
  })

  it('limits password guesses without limiting ordinary redirects', async () => {
    clearLinkPasswordAttempts()
    try {
      const ctx = await getContext()
      const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
      const created = await ctx.app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/secret', slug: 'limited' },
      })
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/links/${created.json().id}`,
        headers: { cookie: user.cookie },
        payload: { password: 'poster-secret' },
      })
      await ctx.app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/open', slug: 'open-link' },
      })
      let limited = false
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const wrong = await ctx.app.inject({ method: 'POST', url: '/s/limited', payload: { password: 'nope' } })
        if (wrong.statusCode === 429) {
          expect(wrong.body).toContain('Too many attempts')
          limited = true
          break
        }
        expect(wrong.statusCode).toBe(401)
      }
      expect(limited).toBe(true)
      const page = await ctx.app.inject({ method: 'GET', url: '/s/limited' })
      expect(page.statusCode).toBe(200)
      expect(page.body).toContain('password protected')
      const open = await ctx.app.inject({ method: 'GET', url: '/s/open-link' })
      expect(open.statusCode).toBe(302)
      expect(open.headers.location).toBe('https://example.com/open')
    } finally {
      clearLinkPasswordAttempts()
    }
  })
})

async function waitForClicks(db: Awaited<ReturnType<typeof getContext>>['db'], count: number) {
  const deadline = Date.now() + 2000
  let rows = await db.select().from(clickEvents)
  while (rows.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    rows = await db.select().from(clickEvents)
  }
  return rows
}

function clickAt(linkId: string, occurredAt: string) {
  return {
    linkId,
    occurredAt: new Date(occurredAt),
    browser: 'Chrome',
    operatingSystem: 'macOS',
    deviceType: 'desktop',
    isBot: false,
    anonymousVisitorId: 'visitor',
  }
}

function cookieHeader(header: unknown): string {
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' ? (value.split(';')[0] ?? '') : ''
}
