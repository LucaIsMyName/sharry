import { describe, expect, it } from 'vitest'
import { Secret, TOTP } from 'otpauth'
import { buildApp } from '../src/server.ts'
import { provisionAdmin } from '../src/provision.ts'
import { getContext, useTestApp } from './helpers.ts'
import { decryptString } from '../src/support.ts'
import { appSettings } from '@sharry/database'
import { eq } from 'drizzle-orm'

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
    await mailApp.close()
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
})

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
