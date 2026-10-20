import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { users } from '@sharry/database'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

describe('API keys', () => {
  useTestApp()

  it('lets a user key see only that user, and an admin key call admin routes', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/ada', slug: 'ada-link' },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: other.cookie },
      payload: { destinationUrl: 'https://example.com/grace', slug: 'grace-link' },
    })

    const userKey = await issueKey(admin.cookie, owner.id, 'Ada script')
    const listed = await ctx.app.inject({
      method: 'GET',
      url: '/api/links',
      headers: { authorization: `Bearer ${userKey.secret}` },
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().links.map((link: { slug: string }) => link.slug)).toEqual(['ada-link'])

    const hiddenAdmin = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${userKey.secret}` },
    })
    expect(hiddenAdmin.statusCode).toBe(404)

    const adminKey = await issueKey(admin.cookie, admin.id, 'Root script')
    const usersResponse = await ctx.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${adminKey.secret}` },
    })
    expect(usersResponse.statusCode).toBe(200)
    expect(usersResponse.json().users.some((user: { username: string }) => user.username === 'ada')).toBe(true)

    const keys = await ctx.app.inject({ method: 'GET', url: '/api/admin/api-keys', headers: { cookie: admin.cookie } })
    expect(keys.statusCode).toBe(200)
    const body = JSON.stringify(keys.json())
    expect(body).not.toContain(userKey.secret)
    expect(body).toContain(userKey.tokenPrefix)
    expect(keys.json().keys.find((key: { id: string }) => key.id === userKey.id).lastUsedAt).toEqual(expect.any(String))
  })

  it('rejects account routes, revoked keys, and keys for inactive or unfinished accounts', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const key = await issueKey(admin.cookie, user.id, 'Ada script')

    const account = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${key.secret}` },
    })
    expect(account.statusCode).toBe(401)
    expect(account.json().error).toMatch(/account routes/)

    const revoked = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/api-keys/${key.id}/revoke`,
      headers: { cookie: admin.cookie },
    })
    expect(revoked.statusCode).toBe(200)
    const afterRevoke = await ctx.app.inject({
      method: 'GET',
      url: '/api/links',
      headers: { authorization: `Bearer ${key.secret}` },
    })
    expect(afterRevoke.statusCode).toBe(401)

    const replacement = await issueKey(admin.cookie, user.id, 'Replacement')
    await ctx.db.update(users).set({ isActive: false }).where(eq(users.id, user.id))
    const inactive = await ctx.app.inject({
      method: 'GET',
      url: '/api/links',
      headers: { authorization: `Bearer ${replacement.secret}` },
    })
    expect(inactive.statusCode).toBe(401)

    await ctx.db.update(users).set({ isActive: true, mustChangePassword: true }).where(eq(users.id, user.id))
    const unfinished = await ctx.app.inject({
      method: 'GET',
      url: '/api/links',
      headers: { authorization: `Bearer ${replacement.secret}` },
    })
    expect(unfinished.statusCode).toBe(401)
  })
})

async function issueKey(cookie: string, userId: string, name: string): Promise<{ id: string; secret: string; tokenPrefix: string }> {
  const ctx = await getContext()
  const response = await ctx.app.inject({
    method: 'POST',
    url: '/api/admin/api-keys',
    headers: { cookie },
    payload: { name, userId },
  })
  expect(response.statusCode).toBe(200)
  const body = response.json()
  expect(body.secret.startsWith('sharry_')).toBe(true)
  expect(body.tokenPrefix).toBe(body.secret.slice(0, 12))
  return body
}
