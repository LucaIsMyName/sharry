import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { clickEvents, links } from '@sharry/database'
import { createLink } from '../src/links.ts'
import { getSettings } from '../src/settings-store.ts'
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
