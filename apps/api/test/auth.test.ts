import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { Secret, TOTP } from 'otpauth'
import { buildApp } from '../src/server.ts'
import { provisionAdmin } from '../src/provision.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'
import { decryptString } from '../src/support.ts'
import { appSettings, passwordResetTokens, recoveryCodes, sessions } from '@sharry/database'
import { eq } from 'drizzle-orm'
import { purgeExpiredResetTokens } from '../src/auth.ts'
import { hashToken, randomToken } from '../src/support.ts'

describe('authentication', () => {
  useTestApp()

  it('opens the dashboard after a password change and keeps MFA opt-in', async () => {
    const { app, db, env } = await getContext()
    await provisionAdmin(db, env)
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin', password: env.INITIAL_ADMIN_PASSWORD },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().scope).toBe('password_change')
    const cookie = cookieFrom(login)
    const blocked = await app.inject({ method: 'GET', url: '/api/links', headers: { cookie } })
    expect(blocked.statusCode).toBe(403)

    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: env.INITIAL_ADMIN_PASSWORD, newPassword: 'a-new-long-password' },
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().scope).toBe('full')
    const enrollCookie = cookieFrom(changed)
    const open = await app.inject({ method: 'GET', url: '/api/links', headers: { cookie: enrollCookie } })
    expect(open.statusCode).toBe(200)
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: enrollCookie } })
    expect(me.json().mailConfigured).toBe(false)
    const blockedSetup = await app.inject({ method: 'POST', url: '/api/auth/mfa/setup', headers: { cookie: enrollCookie } })
    expect(blockedSetup.statusCode).toBe(400)
    await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: enrollCookie },
      payload: { smtpHost: 'smtp.example.com', emailFrom: 'sharry@example.com' },
    })
    const setup = await app.inject({ method: 'POST', url: '/api/auth/mfa/setup', headers: { cookie: enrollCookie } })
    expect(setup.statusCode).toBe(200)
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/confirm',
      headers: { cookie: enrollCookie },
      payload: { code: totp(setup.json().secret as string, 'admin@example.com', env.OTP_ISSUER) },
    })
    expect(confirm.statusCode).toBe(200)
    expect(confirm.json().recoveryCodes).toHaveLength(8)
    const full = cookieFrom(confirm)
    const links = await app.inject({ method: 'GET', url: '/api/links', headers: { cookie: full } })
    expect(links.statusCode).toBe(200)

    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: full } })
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin@example.com', password: 'a-new-long-password' },
    })
    expect(again.json().scope).toBe('mfa_challenge')
    const challenge = cookieFrom(again)
    const stillBlocked = await app.inject({ method: 'GET', url: '/api/links', headers: { cookie: challenge } })
    expect(stillBlocked.statusCode).toBe(403)
    const verified = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa',
      headers: { cookie: challenge },
      payload: { code: totp(setup.json().secret as string, 'admin@example.com', env.OTP_ISSUER) },
    })
    expect(verified.statusCode).toBe(200)
    const ready = await app.inject({ method: 'GET', url: '/api/links', headers: { cookie: cookieFrom(verified) } })
    expect(ready.statusCode).toBe(200)

    const disabled = await app.inject({
      method: 'POST',
      url: '/api/auth/mfa/disable',
      headers: { cookie: cookieFrom(verified) },
      payload: { currentPassword: 'a-new-long-password' },
    })
    expect(disabled.statusCode).toBe(200)
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookieFrom(verified) } })
    const passwordOnly = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin', password: 'a-new-long-password' },
    })
    expect(passwordOnly.json().scope).toBe('full')
  })

  it('rejects a foreign origin on cookie-authenticated writes', async () => {
    const { app } = await getContext()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { usernameOrEmail: 'admin', password: 'whatever-password' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('emails a reset link only through the configured mailer', async () => {
    const { db, env, pool } = await getContext()
    await provisionAdmin(db, env)
    const messages: { text: string }[] = []
    const mailApp = await buildApp({
      env,
      db,
      pool,
      logger: false,
      mailer: { async send(message) { messages.push(message) } },
    })
    await mailApp.ready()
    const forgot = await mailApp.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'admin@example.com' },
    })
    expect(forgot.statusCode).toBe(200)
    expect(messages).toHaveLength(1)
    const token = new URL(messages[0]?.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token')
    expect(token).toBeTruthy()
    const reset = await mailApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword: 'reset-password-value' },
    })
    expect(reset.statusCode).toBe(200)
    const login = await mailApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin', password: 'reset-password-value' },
    })
    expect(login.statusCode).toBe(200)
    const again = await mailApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword: 'another-reset-password' },
    })
    expect(again.statusCode).toBe(400)
    await mailApp.close()
  })

  it('replaces an unused reset link and accepts only one overlapping use', async () => {
    const { db, env, pool } = await getContext()
    await provisionAdmin(db, env)
    const messages: { text: string }[] = []
    const mailApp = await buildApp({
      env,
      db,
      pool,
      logger: false,
      mailer: { async send(message) { messages.push(message) } },
    })
    await mailApp.ready()
    await mailApp.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'admin@example.com' } })
    await mailApp.inject({ method: 'POST', url: '/api/auth/forgot-password', payload: { email: 'admin@example.com' } })
    const tokens = messages.map((message) => new URL(message.text.match(/https?:\/\/\S+/)?.[0] ?? '').searchParams.get('token'))
    const first = tokens[0]
    const second = tokens[1]
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    const stale = await mailApp.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: first, newPassword: 'stale-reset-password' },
    })
    expect(stale.statusCode).toBe(400)
    const [left, right] = await Promise.all([
      mailApp.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: second, newPassword: 'race-reset-password-a' },
      }),
      mailApp.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: second, newPassword: 'race-reset-password-b' },
      }),
    ])
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 400])
    await mailApp.close()
  })

  it('accepts a recovery code once when two requests overlap', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const code = 'abcd-2345'
    await ctx.db.insert(recoveryCodes).values({
      userId: user.id,
      codeHash: hashToken('abcd2345', ctx.env.ENCRYPTION_KEY),
    })
    const token = randomToken()
    await ctx.db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token, ctx.env.SESSION_SECRET),
      scope: 'mfa_challenge',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const cookie = `sharry_session=${token}`
    const [left, right] = await Promise.all([
      ctx.app.inject({ method: 'POST', url: '/api/auth/mfa', headers: { cookie }, payload: { code } }),
      ctx.app.inject({ method: 'POST', url: '/api/auth/mfa', headers: { cookie }, payload: { code } }),
    ])
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 401])
  })

  it('limits authenticator confirmation attempts', async () => {
    const { db, env, pool } = await getContext()
    const limited = await buildApp({ env, db, pool, logger: false })
    await limited.ready()
    const responses = []
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(await limited.inject({
        method: 'POST',
        url: '/api/auth/mfa/confirm',
        payload: { code: '000000' },
      }))
    }
    expect(responses[9]?.statusCode).not.toBe(429)
    expect(responses[10]?.statusCode).toBe(429)
    await limited.close()
  })

  it('deletes expired and used reset tokens', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await ctx.db.insert(passwordResetTokens).values([
      {
        userId: user.id,
        tokenHash: hashToken('expired', ctx.env.SESSION_SECRET),
        expiresAt: new Date(Date.now() - 60_000),
      },
      {
        userId: user.id,
        tokenHash: hashToken('used', ctx.env.SESSION_SECRET),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      },
      {
        userId: user.id,
        tokenHash: hashToken('fresh', ctx.env.SESSION_SECRET),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ])
    await purgeExpiredResetTokens(ctx.db)
    const left = await ctx.db.select().from(passwordResetTokens)
    expect(left.map((row) => row.tokenHash)).toEqual([hashToken('fresh', ctx.env.SESSION_SECRET)])
  })

  it('saves mail settings without returning the password and can require a code', async () => {
    const { app, db, env } = await getContext()
    await provisionAdmin(db, env)
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin', password: env.INITIAL_ADMIN_PASSWORD },
    })
    const changed = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: cookieFrom(login) },
      payload: { currentPassword: env.INITIAL_ADMIN_PASSWORD, newPassword: 'a-new-long-password' },
    })
    const cookie = cookieFrom(changed)
    const saved = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: {
        mfaRequired: true,
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'sharry',
        smtpPassword: 'smtp-secret-value',
        emailFrom: 'sharry@example.com',
      },
    })
    expect(saved.statusCode).toBe(200)
    expect(JSON.stringify(saved.json())).not.toContain('smtp-secret-value')
    expect(saved.json()).toMatchObject({ mfaRequired: true, smtpPasswordSet: true, smtpSource: 'app' })
    const stored = await db.select().from(appSettings).where(eq(appSettings.key, 'smtp_password'))
    expect(decryptString(stored[0]?.value ?? '', env.ENCRYPTION_KEY)).toBe('smtp-secret-value')
    const kept = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie },
      payload: { smtpHost: 'smtp.example.com' },
    })
    expect(kept.json().smtpPasswordSet).toBe(true)
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'admin', password: 'a-new-long-password' },
    })
    expect(again.json().scope).toBe('mfa_enroll')
  })

  it('stores a language on the signed-in account and leaves other accounts in english', async () => {
    const ctx = await getContext()
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const grace = await createSessionUser(ctx, { username: 'grace', email: 'grace@example.com' })
    const before = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ada.cookie } })
    expect(before.json().user.locale).toBe('en')
    const rejected = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/locale',
      headers: { cookie: ada.cookie },
      payload: { locale: 'fr' },
    })
    expect(rejected.statusCode).toBe(400)
    const updated = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/auth/locale',
      headers: { cookie: ada.cookie },
      payload: { locale: 'de' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().user.locale).toBe('de')
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ada.cookie } })
    expect(me.json().user.locale).toBe('de')
    const other = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: grace.cookie } })
    expect(other.json().user.locale).toBe('en')
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { usernameOrEmail: 'ada', password: 'long-password-value' },
    })
    expect(login.json().user.locale).toBe('de')
  })

  it('stores a square thumbnail and reports it on the current user', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const before = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: user.cookie } })
    expect(before.json().user.hasAvatar).toBe(false)
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/auth/avatar', headers: { cookie: user.cookie } })
    expect(missing.statusCode).toBe(404)
    const png = await sharp({
      create: { width: 32, height: 16, channels: 3, background: { r: 12, g: 80, b: 40 } },
    }).png().toBuffer()
    const uploaded = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/avatar',
      headers: { cookie: user.cookie, ...multipart(png).headers },
      payload: multipart(png).payload,
    })
    expect(uploaded.statusCode).toBe(200)
    expect(uploaded.json().hasAvatar).toBe(true)
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: user.cookie } })
    expect(me.json().user.hasAvatar).toBe(true)
    const image = await ctx.app.inject({ method: 'GET', url: '/api/auth/avatar', headers: { cookie: user.cookie } })
    expect(image.statusCode).toBe(200)
    expect(image.headers['content-type']).toContain('image/webp')
    const meta = await sharp(image.rawPayload).metadata()
    expect(meta.width).toBe(256)
    expect(meta.height).toBe(256)
    const removed = await ctx.app.inject({ method: 'DELETE', url: '/api/auth/avatar', headers: { cookie: user.cookie } })
    expect(removed.statusCode).toBe(204)
    const after = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: user.cookie } })
    expect(after.json().user.hasAvatar).toBe(false)
    await expect(fs.access(path.join(ctx.env.AVATAR_DATA_DIR, `${user.id}.webp`))).rejects.toThrow()
  })
})

function multipart(file: Buffer): { payload: Buffer; headers: { 'content-type': string } } {
  const boundary = '----sharry-avatar'
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

function cookieFrom(response: { headers: { 'set-cookie'?: unknown } }): string {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' ? (value.split(';')[0] ?? '') : ''
}

function totp(secret: string, email: string, issuer: string): string {
  return new TOTP({
    issuer,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate()
}
