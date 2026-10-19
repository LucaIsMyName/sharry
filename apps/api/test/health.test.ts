import { describe, expect, it } from 'vitest'
import { runMigrations } from '@sharry/database'
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
})
