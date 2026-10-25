import fs from 'node:fs/promises'
import path from 'node:path'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { Secret, TOTP } from 'otpauth'
import sharp from 'sharp'
import {
  passwordResetTokens,
  recoveryCodes,
  sessions,
  users,
  type Database,
  type UserRecord,
} from '@sharry/database'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  localeSchema,
  loginSchema,
  mfaSchema,
  resetPasswordSchema,
  updateLocaleSchema,
  type Locale,
} from '@sharry/shared'
import { actorFromApiKey, bearerToken, isAccountPath } from './api-keys.ts'
import { writeAudit } from './audit.ts'
import type { Mailer } from './mail.ts'
import { hashPassword, verifyPassword } from './passwords.ts'
import { mailerFor, smtpSource } from './mail.ts'
import { getSettings } from './settings-store.ts'
import { AppError, decryptString, encryptString, hashToken, parseBody, randomToken } from './support.ts'

export const SESSION_COOKIE = 'sharry_session'
export type SessionScope = 'full' | 'password_change' | 'mfa_enroll' | 'mfa_challenge'

export type Actor = {
  id: string
  username: string
  email: string
  role: 'admin' | 'user'
  isActive: boolean
  totpEnabled: boolean
  mustChangePassword: boolean
  scope: SessionScope
}

let dummyHashPromise: Promise<string> | null = null

function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('dummy-password-not-used-for-login')
  return dummyHashPromise
}

export function registerAuthRoutes(app: FastifyInstance, mailer: Mailer | null): void {
  const limit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

  /**
   * Sign in with a username or email and a password.
   * @route POST /api/auth/login
   * @tag Account
   * @auth session
   * @body JSON { usernameOrEmail, password }
   * @response 200 { scope, user, tokenIssued }
   * @response 401 Invalid username or password
   */
  app.post('/api/auth/login', limit, async (request, reply) => {
    const body = parseBody(loginSchema, request.body)
    const identifier = body.usernameOrEmail.toLowerCase()
    const found = await app.db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${identifier} or lower(${users.email}) = ${identifier}`)
      .limit(1)
    const user = found[0]
    const passwordOk = await verifyPassword(user?.passwordHash ?? (await dummyHash()), body.password)
    if (!user || !passwordOk) throw new AppError(401, 'Invalid username or password')
    if (!user.isActive) throw new AppError(403, 'This account is disabled')
    const settings = await getSettings(app.db, app.env)
    const scope = scopeAfterPassword(user, settings.mfaRequired)
    const token = await startSession(app, reply, user.id, scope)
    await writeAudit(app.db, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      metadata: { scope },
    })
    return { scope, user: publicUser(user), tokenIssued: Boolean(token) }
  })

  /**
   * Finish sign-in with an authenticator or recovery code.
   * @route POST /api/auth/mfa
   * @tag Account
   * @auth session
   * @body JSON { code }
   * @response 200 { scope, user }
   * @response 401 That code is not valid
   */
  app.post('/api/auth/mfa', limit, async (request, reply) => {
    const actor = await requireUser(app, request, ['mfa_challenge'])
    const body = parseBody(mfaSchema, request.body)
    const user = await requireRecord(app.db, actor.id)
    const code = body.code.replace(/\s/g, '')
    const totpOk = user.totpSecretEncrypted ? verifyTotp(app, user, code) : false
    if (!totpOk) {
      const consumed = await consumeRecoveryCode(app, user.id, code)
      if (!consumed) throw new AppError(401, 'That code is not valid')
    }
    await replaceSession(app, reply, request, user.id, 'full')
    return { scope: 'full' as const, user: publicUser({ ...user, totpEnabled: true }) }
  })

  /**
   * End the current session.
   * @route POST /api/auth/logout
   * @tag Account
   * @auth session
   * @response 200 { ok: true }
   */
  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) {
      await app.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token, app.env.SESSION_SECRET)))
    }
    clearSessionCookie(reply, app)
    return { ok: true }
  })

  /**
   * Return the signed-in account and session scope.
   * @route GET /api/auth/me
   * @tag Account
   * @auth session
   * @response 200 { user, scope, mfaRequired, mailConfigured }
   */
  app.get('/api/auth/me', async (request) => {
    const actor = await requireUser(app, request, ['full', 'password_change', 'mfa_enroll', 'mfa_challenge'])
    const settings = await getSettings(app.db, app.env)
    const record = await requireRecord(app.db, actor.id)
    return {
      user: {
        ...actor,
        locale: localeOf(record.locale),
        hasAvatar: Boolean(record.avatarPath),
        updatedAt: record.updatedAt.toISOString(),
      },
      scope: actor.scope,
      mfaRequired: settings.mfaRequired,
      mailConfigured: smtpSource(settings, app.env) === 'app',
    }
  })

  /**
   * Save the language for the signed-in account.
   * @route PATCH /api/auth/locale
   * @tag Account
   * @auth session
   * @body JSON { locale }
   * @response 200 { user }
   */
  app.patch('/api/auth/locale', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(updateLocaleSchema, request.body)
    const updatedAt = new Date()
    const [updated] = await app.db
      .update(users)
      .set({ locale: body.locale, updatedAt })
      .where(eq(users.id, actor.id))
      .returning()
    if (!updated) throw new AppError(404, 'User not found')
    return { user: publicUser(updated) }
  })

  /**
   * Replace the account image. Send one PNG, JPEG, or WebP file up to 512 KB.
   * @route POST /api/auth/avatar
   * @tag Account
   * @auth session
   * @body multipart file
   * @response 200 { hasAvatar, updatedAt }
   */
  app.post('/api/auth/avatar', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const file = await request.file()
    if (!file) throw new AppError(400, 'Choose a PNG, JPEG, or WebP image')
    const buffer = await file.toBuffer()
    if (buffer.length > 512 * 1024) throw new AppError(400, 'Images must be 512 KB or smaller')
    const meta = await sharp(buffer).metadata().catch(() => null)
    if (!meta?.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
      throw new AppError(400, 'Use a PNG, JPEG, or WebP image')
    }
    const resized = await sharp(buffer).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer()
    const filename = `${actor.id}.webp`
    const user = await requireRecord(app.db, actor.id)
    await fs.mkdir(app.env.AVATAR_DATA_DIR, { recursive: true })
    if (user.avatarPath && user.avatarPath !== filename) await removeAvatarFile(app.env.AVATAR_DATA_DIR, user.avatarPath)
    await fs.writeFile(path.join(app.env.AVATAR_DATA_DIR, filename), resized)
    const updatedAt = new Date()
    await app.db.update(users).set({ avatarPath: filename, updatedAt }).where(eq(users.id, actor.id))
    return { hasAvatar: true, updatedAt: updatedAt.toISOString() }
  })

  /**
   * Remove the account image.
   * @route DELETE /api/auth/avatar
   * @tag Account
   * @auth session
   * @response 204 Empty
   */
  app.delete('/api/auth/avatar', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const user = await requireRecord(app.db, actor.id)
    await removeAvatarFile(app.env.AVATAR_DATA_DIR, user.avatarPath)
    await app.db.update(users).set({ avatarPath: null, updatedAt: new Date() }).where(eq(users.id, actor.id))
    return reply.code(204).send()
  })

  /**
   * Download the signed-in account image.
   * @route GET /api/auth/avatar
   * @tag Account
   * @auth session
   * @response 200 Image bytes
   * @response 404 No account image
   */
  app.get('/api/auth/avatar', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const user = await requireRecord(app.db, actor.id)
    if (!user.avatarPath) throw new AppError(404, 'No thumbnail is set')
    const file = await readAvatar(app.env.AVATAR_DATA_DIR, user.avatarPath)
    return reply.header('cache-control', 'private, no-cache').type(file.mime).send(file.buffer)
  })

  /**
   * Replace the current password. Required before the dashboard opens on a new account.
   * @route POST /api/auth/change-password
   * @tag Account
   * @auth session
   * @body JSON { currentPassword, newPassword }
   * @response 200 { scope }
   */
  app.post('/api/auth/change-password', async (request, reply) => {
    const actor = await requireUser(app, request, ['full', 'password_change'])
    const body = parseBody(changePasswordSchema, request.body)
    const user = await requireRecord(app.db, actor.id)
    const ok = await verifyPassword(user.passwordHash, body.currentPassword)
    if (!ok) throw new AppError(401, 'Current password is incorrect')
    const passwordHash = await hashPassword(body.newPassword)
    await app.db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    await writeAudit(app.db, {
      actorUserId: user.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
    })
    const settings = await getSettings(app.db, app.env)
    const next = scopeAfterPassword({ ...user, mustChangePassword: false }, settings.mfaRequired)
    const scope: SessionScope = actor.scope === 'full' ? 'full' : next
    await replaceSession(app, reply, request, user.id, scope)
    return { scope }
  })

  /**
   * Email a password reset link when the address matches an account.
   * @route POST /api/auth/forgot-password
   * @tag Account
   * @auth session
   * @body JSON { email }
   * @response 200 { ok: true }
   */
  app.post('/api/auth/forgot-password', limit, async (request) => {
    const body = parseBody(forgotPasswordSchema, request.body)
    const email = body.email.toLowerCase()
    const found = await app.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1)
    const user = found[0]
    const settings = await getSettings(app.db, app.env)
    const delivery = mailer ?? mailerFor(settings, app.env)
    if (user && user.isActive && delivery) {
      const token = randomToken()
      await app.db.transaction(async (tx) => {
        await tx
          .delete(passwordResetTokens)
          .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)))
        await tx.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token, app.env.SESSION_SECRET),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
      })
      const url = `${settings.appUrl.replace(/\/$/, '')}/login/reset?token=${encodeURIComponent(token)}`
      await delivery.send({
        to: user.email,
        subject: `${app.env.APP_NAME} password reset`,
        text: `Reset your password:\n${url}\n\nThis link expires in one hour.`,
      })
    }
    return { ok: true }
  })

  /**
   * Set a new password with a reset token from email.
   * @route POST /api/auth/reset-password
   * @tag Account
   * @auth session
   * @body JSON { token, newPassword }
   * @response 200 { ok: true }
   */
  app.post('/api/auth/reset-password', limit, async (request) => {
    const body = parseBody(resetPasswordSchema, request.body)
    const tokenHash = hashToken(body.token, app.env.SESSION_SECRET)
    const passwordHash = await hashPassword(body.newPassword)
    const userId = await app.db.transaction(async (tx) => {
      const consumed = await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          sql`${passwordResetTokens.expiresAt} > now()`,
        ))
        .returning({ userId: passwordResetTokens.userId })
      const row = consumed[0]
      if (!row) return null
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
        .where(eq(users.id, row.userId))
      await tx.delete(sessions).where(eq(sessions.userId, row.userId))
      return row.userId
    })
    if (!userId) throw new AppError(400, 'This reset link is invalid or expired')
    await writeAudit(app.db, {
      actorUserId: userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: userId,
    })
    return { ok: true }
  })

  /**
   * Start authenticator enrollment and return the otpauth URL.
   * @route POST /api/auth/mfa/setup
   * @tag Account
   * @auth session
   * @response 200 { secret, otpauthUrl }
   */
  app.post('/api/auth/mfa/setup', async (request) => {
    const actor = await requireUser(app, request, ['full', 'mfa_enroll'])
    const user = await requireRecord(app.db, actor.id)
    if (user.totpEnabled) throw new AppError(400, 'Two-factor authentication is already on')
    const settings = await getSettings(app.db, app.env)
    if (actor.scope !== 'mfa_enroll' && smtpSource(settings, app.env) !== 'app') {
      throw new AppError(400, 'An administrator needs to save a mail server in Settings before two-factor authentication can be turned on.')
    }
    const secret = new Secret({ size: 20 })
    const totp = buildTotp(app, user.email, secret)
    await app.db
      .update(users)
      .set({ totpSecretEncrypted: encryptString(secret.base32, app.env.ENCRYPTION_KEY), totpEnabled: false, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    return { secret: secret.base32, otpauthUrl: totp.toString() }
  })

  /**
   * Confirm authenticator enrollment with a current code.
   * @route POST /api/auth/mfa/confirm
   * @tag Account
   * @auth session
   * @body JSON { code }
   * @response 200 { scope, recoveryCodes }
   */
  app.post('/api/auth/mfa/confirm', limit, async (request, reply) => {
    const actor = await requireUser(app, request, ['full', 'mfa_enroll'])
    const body = parseBody(mfaSchema, request.body)
    const user = await requireRecord(app.db, actor.id)
    if (!user.totpSecretEncrypted || !verifyTotp(app, user, body.code)) {
      throw new AppError(401, 'That code is not valid')
    }
    const codes = await replaceRecoveryCodes(app, user.id)
    await app.db.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, user.id))
    await replaceSession(app, reply, request, user.id, 'full')
    await writeAudit(app.db, {
      actorUserId: user.id,
      action: 'auth.mfa_enabled',
      entityType: 'user',
      entityId: user.id,
    })
    return { scope: 'full' as const, recoveryCodes: codes }
  })

  /**
   * Turn off two-factor authentication after checking the current password.
   * @route POST /api/auth/mfa/disable
   * @tag Account
   * @auth session
   * @body JSON { currentPassword }
   * @response 200 { totpEnabled: false }
   */
  app.post('/api/auth/mfa/disable', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(changePasswordSchema.pick({ currentPassword: true }), request.body)
    const user = await requireRecord(app.db, actor.id)
    if (!user.totpEnabled) throw new AppError(400, 'Two-factor authentication is already off')
    const settings = await getSettings(app.db, app.env)
    if (settings.mfaRequired) throw new AppError(400, 'An administrator requires two-factor authentication')
    const ok = await verifyPassword(user.passwordHash, body.currentPassword)
    if (!ok) throw new AppError(401, 'Current password is incorrect')
    await app.db
      .update(users)
      .set({ totpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
      .where(eq(users.id, user.id))
    await app.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id))
    await writeAudit(app.db, {
      actorUserId: user.id,
      action: 'auth.mfa_disabled',
      entityType: 'user',
      entityId: user.id,
    })
    return { totpEnabled: false }
  })

  /**
   * Replace recovery codes after checking the current password.
   * @route POST /api/auth/recovery-codes
   * @tag Account
   * @auth session
   * @body JSON { currentPassword }
   * @response 200 { recoveryCodes }
   */
  app.post('/api/auth/recovery-codes', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(changePasswordSchema.pick({ currentPassword: true }), request.body)
    const user = await requireRecord(app.db, actor.id)
    if (!user.totpEnabled) throw new AppError(400, 'Turn on two-factor authentication first')
    const ok = await verifyPassword(user.passwordHash, body.currentPassword)
    if (!ok) throw new AppError(401, 'Current password is incorrect')
    const codes = await replaceRecoveryCodes(app, user.id)
    return { recoveryCodes: codes }
  })
}

export async function requireUser(
  app: FastifyInstance,
  request: FastifyRequest,
  scopes: SessionScope[],
): Promise<Actor> {
  const pathname = request.url.split('?')[0] ?? ''
  const presented = bearerToken(request)
  if (presented !== null && !isAccountPath(pathname)) return actorFromApiKey(app, presented)
  const token = request.cookies[SESSION_COOKIE]
  if (!token) throw new AppError(401, 'Sign in required')
  const tokenHash = hashToken(token, app.env.SESSION_SECRET)
  const found = await app.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1)
  const row = found[0]
  if (!row || row.session.expiresAt.getTime() < Date.now()) {
    if (row) await app.db.delete(sessions).where(eq(sessions.id, row.session.id))
    throw new AppError(401, 'Sign in required')
  }
  if (!row.user.isActive) throw new AppError(403, 'This account is disabled')
  const scope = row.session.scope as SessionScope
  if (!scopes.includes(scope)) throw new AppError(403, 'Finish account setup before continuing')
  return { ...toActor(row.user), scope }
}

export async function requireAdmin(app: FastifyInstance, request: FastifyRequest): Promise<Actor> {
  const actor = await requireUser(app, request, ['full'])
  if (actor.role !== 'admin') throw new AppError(404, 'Not found')
  return actor
}

function scopeAfterPassword(user: UserRecord, mfaRequired: boolean): SessionScope {
  if (user.mustChangePassword) return 'password_change'
  if (user.totpEnabled) return 'mfa_challenge'
  if (mfaRequired) return 'mfa_enroll'
  return 'full'
}

async function startSession(app: FastifyInstance, reply: FastifyReply, userId: string, scope: SessionScope): Promise<string> {
  const settings = await getSettings(app.db, app.env)
  const ttl = scope === 'full' ? settings.sessionTtlHours * 3600 : scope === 'mfa_challenge' ? 5 * 60 : 30 * 60
  const token = randomToken()
  await app.db.insert(sessions).values({
    userId,
    scope,
    tokenHash: hashToken(token, app.env.SESSION_SECRET),
    expiresAt: new Date(Date.now() + ttl * 1000),
  })
  setSessionCookie(reply, app, token, ttl)
  return token
}

async function replaceSession(
  app: FastifyInstance,
  reply: FastifyReply,
  request: FastifyRequest,
  userId: string,
  scope: SessionScope,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE]
  if (token) {
    await app.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token, app.env.SESSION_SECRET)))
  }
  await startSession(app, reply, userId, scope)
}

function setSessionCookie(reply: FastifyReply, app: FastifyInstance, token: string, maxAge: number): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
}

function clearSessionCookie(reply: FastifyReply, app: FastifyInstance): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', secure: app.env.NODE_ENV === 'production', sameSite: 'lax' })
}

function publicUser(
  user: Pick<UserRecord, 'id' | 'username' | 'email' | 'role' | 'totpEnabled' | 'mustChangePassword' | 'locale'>,
) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    totpEnabled: user.totpEnabled,
    mustChangePassword: user.mustChangePassword,
    locale: localeOf(user.locale),
  }
}

function localeOf(value: string): Locale {
  const parsed = localeSchema.safeParse(value)
  return parsed.success ? parsed.data : 'en'
}

function toActor(user: UserRecord): Omit<Actor, 'scope'> {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
    isActive: user.isActive,
    totpEnabled: user.totpEnabled,
    mustChangePassword: user.mustChangePassword,
  }
}

async function requireRecord(db: Database, id: string): Promise<UserRecord> {
  const found = await db.select().from(users).where(eq(users.id, id)).limit(1)
  const user = found[0]
  if (!user) throw new AppError(401, 'Sign in required')
  return user
}

function buildTotp(app: FastifyInstance, email: string, secret: Secret): TOTP {
  return new TOTP({
    issuer: app.env.OTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })
}

function verifyTotp(app: FastifyInstance, user: UserRecord, code: string): boolean {
  if (!user.totpSecretEncrypted) return false
  const base32 = decryptString(user.totpSecretEncrypted, app.env.ENCRYPTION_KEY)
  const totp = buildTotp(app, user.email, Secret.fromBase32(base32))
  return totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

async function consumeRecoveryCode(app: FastifyInstance, userId: string, code: string): Promise<boolean> {
  const codeHash = hashToken(normalizeRecoveryCode(code), app.env.ENCRYPTION_KEY)
  const consumed = await app.db
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, codeHash), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id })
  return consumed.length > 0
}

export async function purgeExpiredResetTokens(db: Database): Promise<void> {
  await db
    .delete(passwordResetTokens)
    .where(sql`${passwordResetTokens.expiresAt} < now() or ${passwordResetTokens.usedAt} is not null`)
}

async function replaceRecoveryCodes(app: FastifyInstance, userId: string): Promise<string[]> {
  const codes = Array.from({ length: 8 }, () => formatRecoveryCode(randomToken(6)))
  await app.db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId))
  await app.db.insert(recoveryCodes).values(
    codes.map((code) => ({
      userId,
      codeHash: hashToken(normalizeRecoveryCode(code), app.env.ENCRYPTION_KEY),
    })),
  )
  return codes
}

async function removeAvatarFile(directory: string, filename: string | null): Promise<void> {
  if (!filename || filename.includes('/') || filename.includes('..')) return
  await fs.rm(path.join(directory, filename), { force: true })
}

async function readAvatar(directory: string, filename: string): Promise<{ buffer: Buffer; mime: string }> {
  if (filename.includes('/') || filename.includes('..')) throw new AppError(400, 'Invalid image')
  const buffer = await fs.readFile(path.join(directory, filename))
  const mime = filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.webp') ? 'image/webp' : 'image/png'
  return { buffer, mime }
}

function formatRecoveryCode(token: string): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let raw = ''
  for (const character of token) {
    raw += alphabet[character.charCodeAt(0) % alphabet.length]
    if (raw.length === 8) break
  }
  while (raw.length < 8) raw += alphabet[raw.length % alphabet.length]
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}
