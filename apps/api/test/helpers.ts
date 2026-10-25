import { afterAll, beforeEach, inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
import { sql } from 'drizzle-orm'
import { createDb, sessions, users, type Database } from '@sharry/database'
import { parseRuntimeEnv, type RuntimeEnv } from '@sharry/shared'
import { hashPassword } from '../src/passwords.ts'
import { buildApp } from '../src/server.ts'
import { invalidateRedirectHosts } from '../src/redirect-domains.ts'
import { invalidateSettings } from '../src/settings-store.ts'
import { hashToken, randomToken } from '../src/support.ts'
import type { FastifyInstance } from 'fastify'
import type pg from 'pg'

export type TestContext = {
  app: FastifyInstance
  db: Database
  pool: pg.Pool
  env: RuntimeEnv
}

let context: TestContext | null = null

export function testEnv(databaseUrl: string): RuntimeEnv {
  return parseRuntimeEnv({
    NODE_ENV: 'test',
    APP_NAME: 'Sharry',
    APP_URL: 'http://127.0.0.1:5173',
    APP_HOST: '127.0.0.1',
    APP_PORT: '3000',
    SHORT_URL_BASE: 'http://127.0.0.1:3000',
    SHORT_URL_PREFIX: '/s',
    DATABASE_URL: databaseUrl,
    INITIAL_ADMIN_USERNAME: 'admin',
    INITIAL_ADMIN_EMAIL: 'admin@example.com',
    INITIAL_ADMIN_PASSWORD: 'initial-admin-password',
    SESSION_SECRET: 'test-session-secret-should-be-long-enough',
    ENCRYPTION_KEY: 'test-encryption-key-should-be-long-enough',
    OTP_ISSUER: 'Sharry',
    SMTP_HOST: '',
    EMAIL_FROM: '',
    QR_DATA_DIR: 'data/qr-test',
    AVATAR_DATA_DIR: 'data/avatars-test',
  })
}

export function useTestApp(): void {
  beforeEach(async () => {
    const ctx = await getContext()
    await resetDatabase(ctx.db)
  })
  afterAll(async () => {
    await closeContext()
  })
}

export async function getContext(): Promise<TestContext> {
  if (context) return context
  const env = testEnv(inject('databaseUrl'))
  const { db, pool } = createDb(env.DATABASE_URL)
  const app = await buildApp({ env, db, pool, logger: false })
  await app.ready()
  context = { app, db, pool, env }
  return context
}

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql`
    truncate table
      click_events,
      qr_codes,
      tracking_variants,
      tracking_configs,
      tracking_campaigns,
      password_reset_tokens,
      recovery_codes,
      api_keys,
      sessions,
      audit_logs,
      links,
      redirect_domains,
      users,
      app_settings
    restart identity cascade
  `)
  invalidateSettings()
  invalidateRedirectHosts()
}

async function closeContext(): Promise<void> {
  if (!context) return
  await context.app.close()
  await context.pool.end()
  context = null
}

export async function createSessionUser(
  ctx: TestContext,
  fields: { username: string; email: string; role?: 'admin' | 'user'; password?: string },
): Promise<{ id: string; cookie: string }> {
  const passwordHash = await hashPassword(fields.password ?? 'long-password-value')
  const [user] = await ctx.db
    .insert(users)
    .values({
      username: fields.username,
      email: fields.email,
      passwordHash,
      role: fields.role ?? 'user',
      totpEnabled: true,
      mustChangePassword: false,
      emailVerifiedAt: new Date(),
    })
    .returning()
  if (!user) throw new Error('user insert failed')
  const token = randomToken()
  await ctx.db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token, ctx.env.SESSION_SECRET),
    scope: 'full',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return { id: user.id, cookie: `sharry_session=${token}` }
}
