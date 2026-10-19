import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { users } from '@sharry/database'
import { provisionAdmin } from '../src/provision.ts'
import { getContext, useTestApp } from './helpers.ts'

describe('first-run provisioning', () => {
  useTestApp()

  it('creates one administrator and does not reset the password later', async () => {
    const { db, env } = await getContext()
    const messages: string[] = []
    const logger = {
      info: (message: string) => messages.push(message),
      error: (message: string) => messages.push(message),
    }
    const first = await provisionAdmin(db, env, logger)
    const created = await db.select().from(users)
    expect(first.created).toBe(true)
    expect(created).toHaveLength(1)
    expect(created[0]?.role).toBe('admin')
    expect(created[0]?.mustChangePassword).toBe(true)
    const hash = created[0]?.passwordHash
    const second = await provisionAdmin(db, env, logger)
    const again = await db.select().from(users)
    expect(second.created).toBe(false)
    expect(again).toHaveLength(1)
    expect(again[0]?.passwordHash).toBe(hash)
    expect(messages.join('\n')).not.toContain(env.INITIAL_ADMIN_PASSWORD)
  })

  it('does not recreate an administrator after initialization', async () => {
    const { db, env } = await getContext()
    await provisionAdmin(db, env)
    await db.delete(users)
    const result = await provisionAdmin(db, env)
    const rows = await db.select().from(users)
    expect(result.created).toBe(false)
    expect(rows).toHaveLength(0)
  })

  it('fails a fresh install when administrator credentials are missing', async () => {
    const { db, env } = await getContext()
    await expect(
      provisionAdmin(db, {
        ...env,
        INITIAL_ADMIN_USERNAME: undefined,
        INITIAL_ADMIN_EMAIL: undefined,
        INITIAL_ADMIN_PASSWORD: undefined,
      }),
    ).rejects.toThrow(/credentials/i)
  })

  it('stores the admin email in lowercase', async () => {
    const { db, env } = await getContext()
    await provisionAdmin(db, { ...env, INITIAL_ADMIN_EMAIL: 'Admin@Example.com' })
    const [admin] = await db.select().from(users).where(eq(users.role, 'admin'))
    expect(admin?.email).toBe('admin@example.com')
  })
})
