import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { links } from '@sharry/database'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

describe('administrator accounts', () => {
  useTestApp()

  it('sets another administrator password and ends that session', async () => {
    const ctx = await getContext()
    const target = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com', role: 'admin' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const open = await ctx.app.inject({ method: 'GET', url: '/api/links', headers: { cookie: target.cookie } })
    expect(open.statusCode).toBe(200)

    const reset = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${target.id}`,
      headers: { cookie: admin.cookie },
      payload: { password: 'replacement-password-value' },
    })
    expect(reset.statusCode).toBe(200)
    expect(reset.json().mustChangePassword).toBe(true)

    const closed = await ctx.app.inject({ method: 'GET', url: '/api/links', headers: { cookie: target.cookie } })
    expect(closed.statusCode).toBe(401)
  })

  it('refuses to delete the signed-in account or the last active administrator', async () => {
    const ctx = await getContext()
    const only = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const self = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${only.id}`,
      headers: { cookie: only.cookie },
    })
    expect(self.statusCode).toBe(400)
    expect(self.json().error).toMatch(/own account/)

    const second = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com', role: 'admin' })
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${second.id}`,
      headers: { cookie: only.cookie },
      payload: { isActive: false },
    })
    const last = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${only.id}`,
      headers: { cookie: only.cookie },
    })
    expect(last.statusCode).toBe(400)
  })

  it('deletes a user, their links, and later sign-in', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com', password: 'long-password-value' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/ada', slug: 'ada-link' },
    })
    const campaign = await ctx.app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: owner.cookie },
      payload: { name: 'Ada campaign' },
    })
    expect(created.statusCode).toBe(200)
    expect(campaign.statusCode).toBe(200)

    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${owner.id}`,
      headers: { cookie: admin.cookie },
    })
    expect(removed.statusCode).toBe(204)
    const remaining = await ctx.db.select().from(links).where(eq(links.slug, 'ada-link'))
    expect(remaining).toHaveLength(0)

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'ada', password: 'long-password-value' },
    })
    expect(login.statusCode).toBe(401)
  })
})
