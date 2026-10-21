import { describe, expect, it } from 'vitest'
import { runMigrations } from '@sharry/database'
import { buildApp } from '../src/server.ts'
import { getContext, useTestApp } from './helpers.ts'

describe('health', () => {
  useTestApp()

  it('returns ok without a session', async () => {
    const { app, db } = await getContext()
    await runMigrations(db)
    await runMigrations(db)
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('allows blob connections in the production content security policy', async () => {
    const ctx = await getContext()
    const app = await buildApp({
      env: { ...ctx.env, NODE_ENV: 'production' },
      db: ctx.db,
      pool: ctx.pool,
      logger: false,
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/health' })
      const policy = response.headers['content-security-policy']
      expect(policy).toContain("connect-src 'self' blob:")
      expect(policy).toContain("img-src 'self' data: blob:")
    } finally {
      await app.close()
    }
  })
})
