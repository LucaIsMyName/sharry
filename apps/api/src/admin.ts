import fs from 'node:fs/promises'
import path from 'node:path'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { apiKeys, auditLogs, links, qrCodes, sessions, trackingCampaigns, users, type Database, type UserRecord } from '@sharry/database'
import { aiBaseUrlError, apiKeySecretPrefix, apiKeyTokenPrefix, appSlug, buildShortUrl, createApiKeySchema, createUserSchema, settingsUpdateSchema, updateUserSchema, validatePrefix, type RuntimeEnv } from '@sharry/shared'
import { requireAdmin } from './auth.ts'
import { writeAudit } from './audit.ts'
import { loadVerifiedHosts, originForLink, removeLogo } from './links.ts'
import { smtpSource } from './mail.ts'
import { hashPassword } from './passwords.ts'
import { rowsOf, getSettings, invalidateSettings, writeSetting, type AppSettings } from './settings-store.ts'
import { AppError, csv, encryptString, hashToken, isUniqueViolation, parseBody, randomToken } from './support.ts'

export function registerAdminRoutes(app: FastifyInstance): void {
  /**
   * Read the public short-link settings used by the dashboard.
   * @route GET /api/settings/public
   * @tag Settings
   * @auth api-key or session
   * @response 200 { shortUrlPrefix, shortUrlBase, appUrl, defaultRedirectType, slugLength, defaultQrStyle, appName }
   */
  app.get('/api/settings/public', async (request) => {
    const { requireUser } = await import('./auth.ts')
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    return { ...publicSettings(settings, actor.role === 'admin'), appName: app.env.APP_NAME }
  })

  /**
   * List every account.
   * @route GET /api/admin/users
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 { users: User[] }
   */
  app.get('/api/admin/users', async (request) => {
    await requireAdmin(app, request)
    const rows = await app.db.select().from(users).orderBy(desc(users.createdAt))
    return { users: rows.map(publicAdminUser) }
  })

  /**
   * Create an account. The person must change the temporary password on first sign-in.
   * @route POST /api/admin/users
   * @tag Admin
   * @auth admin api-key or admin session
   * @body JSON { username, email, password, role }
   * @response 200 User
   * @response 409 That username or email is already in use
   */
  app.post('/api/admin/users', async (request) => {
    const actor = await requireAdmin(app, request)
    const body = parseBody(createUserSchema, request.body)
    const passwordHash = await hashPassword(body.password)
    try {
      const [created] = await app.db
        .insert(users)
        .values({
          username: body.username,
          email: body.email.toLowerCase(),
          passwordHash,
          role: body.role,
          mustChangePassword: true,
          emailVerifiedAt: new Date(),
        })
        .returning()
      if (!created) throw new AppError(500, 'Could not create the user')
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'user.created',
        entityType: 'user',
        entityId: created.id,
        metadata: { username: created.username, role: created.role },
      })
      return publicAdminUser(created)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'That username or email is already in use')
      throw error
    }
  })

  /**
   * Change an account role, active flag, or temporary password.
   * @route PATCH /api/admin/users/:id
   * @tag Admin
   * @auth admin api-key or admin session
   * @param id string User id
   * @body JSON { role?, isActive?, password? }
   * @response 200 User
   */
  app.patch('/api/admin/users/:id', async (request) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const body = parseBody(updateUserSchema, request.body)
    const found = await app.db.select().from(users).where(eq(users.id, id)).limit(1)
    const user = found[0]
    if (!user) throw new AppError(404, 'User not found')
    if (user.id === actor.id && body.isActive === false) throw new AppError(400, 'You cannot deactivate your own account')
    const demoting = user.role === 'admin' && (body.role === 'user' || body.isActive === false)
    if (demoting && (await otherActiveAdmins(app.db, user.id)) < 1) {
      throw new AppError(400, 'Keep at least one active administrator')
    }
    const passwordHash = body.password ? await hashPassword(body.password) : undefined
    const [updated] = await app.db
      .update(users)
      .set({
        role: body.role ?? user.role,
        isActive: body.isActive ?? user.isActive,
        passwordHash: passwordHash ?? user.passwordHash,
        mustChangePassword: body.password ? true : user.mustChangePassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning()
    if (!updated) throw new AppError(404, 'User not found')
    if (body.password) await app.db.delete(sessions).where(eq(sessions.userId, user.id))
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: updated.role, isActive: updated.isActive, passwordReset: Boolean(body.password) },
    })
    return publicAdminUser(updated)
  })

  /**
   * Delete an account and the links, campaigns, QR codes, and API keys that belong to it.
   * @route DELETE /api/admin/users/:id
   * @tag Admin
   * @auth admin api-key or admin session
   * @param id string User id
   * @response 204 Empty
   * @response 400 You cannot delete your own account
   */
  app.delete('/api/admin/users/:id', async (request, reply) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const found = await app.db.select().from(users).where(eq(users.id, id)).limit(1)
    const user = found[0]
    if (!user) throw new AppError(404, 'User not found')
    if (user.id === actor.id) throw new AppError(400, 'You cannot delete your own account')
    if (user.role === 'admin' && user.isActive && (await otherActiveAdmins(app.db, user.id)) < 1) {
      throw new AppError(400, 'Keep at least one active administrator')
    }
    const owned = await app.db.select({ id: links.id }).from(links).where(eq(links.userId, user.id))
    const logos = owned.length
      ? await app.db.select({ logoPath: qrCodes.logoPath }).from(qrCodes).where(inArray(qrCodes.linkId, owned.map((link) => link.id)))
      : []
    await app.db.transaction(async (tx) => {
      const database = tx as unknown as Database
      await database.delete(trackingCampaigns).where(eq(trackingCampaigns.userId, user.id))
      await database.delete(links).where(eq(links.userId, user.id))
      await database.delete(users).where(eq(users.id, user.id))
      await writeAudit(database, {
        actorUserId: actor.id,
        action: 'user.deleted',
        entityType: 'user',
        entityId: user.id,
        metadata: { username: user.username, role: user.role },
      })
    })
    await Promise.all(logos.map((logo) => removeLogo(app.env.QR_DATA_DIR, logo.logoPath)))
    await removeAvatarFile(app.env.AVATAR_DATA_DIR, user.avatarPath)
    return reply.code(204).send()
  })

  /**
   * Read administrator settings, including mail configuration. The SMTP password is not returned.
   * @route GET /api/admin/settings
   * @tag Settings
   * @auth admin api-key or admin session
   * @response 200 Settings
   */
  app.get('/api/admin/settings', async (request) => {
    await requireAdmin(app, request)
    const settings = await getSettings(app.db, app.env)
    return adminSettingsView(settings, app.env)
  })

  /**
   * Update prefix, retention, session length, two-factor requirement, and mail settings.
   * @route PATCH /api/admin/settings
   * @tag Settings
   * @auth admin api-key or admin session
   * @body JSON settings fields. shortUrlPrefix changes require confirmPrefixChange
   * @response 200 Settings
   */
  app.patch('/api/admin/settings', async (request) => {
    const actor = await requireAdmin(app, request)
    const body = parseBody(settingsUpdateSchema, request.body)
    const current = await getSettings(app.db, app.env)
    if (body.shortUrlPrefix && body.shortUrlPrefix !== current.shortUrlPrefix) {
      const error = validatePrefix(body.shortUrlPrefix)
      if (error) throw new AppError(400, error, 'validation')
      if (!body.confirmPrefixChange) {
        throw new AppError(
          400,
          'Changing the public prefix updates every short URL and printed QR code. Confirm the change to continue.',
          'confirm_prefix',
        )
      }
      const legacyEnabled = body.legacyPrefixEnabled ?? current.legacyPrefixEnabled
      const legacy = legacyEnabled
        ? [...new Set([...current.legacyPrefixes, current.shortUrlPrefix])].filter((prefix) => prefix !== body.shortUrlPrefix)
        : current.legacyPrefixes.filter((prefix) => prefix !== body.shortUrlPrefix)
      await writeSetting(app.db, 'short_url_prefix', body.shortUrlPrefix, actor.id)
      await writeSetting(app.db, 'legacy_prefixes', JSON.stringify(legacy), actor.id)
      if (body.legacyPrefixEnabled !== undefined) {
        await writeSetting(app.db, 'legacy_prefix_enabled', body.legacyPrefixEnabled ? 'true' : 'false', actor.id)
      }
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'settings.prefix_changed',
        entityType: 'settings',
        entityId: 'short_url_prefix',
        metadata: { from: current.shortUrlPrefix, to: body.shortUrlPrefix, legacy: legacyEnabled },
      })
    } else if (body.legacyPrefixEnabled !== undefined) {
      await writeSetting(app.db, 'legacy_prefix_enabled', body.legacyPrefixEnabled ? 'true' : 'false', actor.id)
    }
    if (body.defaultRedirectType) await writeSetting(app.db, 'default_redirect_type', body.defaultRedirectType, actor.id)
    if (body.slugLength) await writeSetting(app.db, 'slug_length', String(body.slugLength), actor.id)
    if (body.analyticsRetentionDays !== undefined) {
      await writeSetting(app.db, 'analytics_retention_days', String(body.analyticsRetentionDays), actor.id)
    }
    if (body.registrationPolicy) await writeSetting(app.db, 'registration_policy', body.registrationPolicy, actor.id)
    if (body.sessionTtlHours) await writeSetting(app.db, 'session_ttl_hours', String(body.sessionTtlHours), actor.id)
    if (body.defaultQrStyle) await writeSetting(app.db, 'default_qr_style', JSON.stringify(body.defaultQrStyle), actor.id)
    if (body.mfaRequired !== undefined && body.mfaRequired !== current.mfaRequired) {
      await writeSetting(app.db, 'mfa_required', body.mfaRequired ? 'true' : 'false', actor.id)
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'settings.mfa_required',
        entityType: 'settings',
        entityId: 'mfa_required',
        metadata: { enabled: body.mfaRequired },
      })
    }
    await saveLinkSharing(app.db, actor.id, body, current)
    if (body.smtpHost !== undefined) await writeSetting(app.db, 'smtp_host', body.smtpHost, actor.id)
    if (body.smtpPort !== undefined) await writeSetting(app.db, 'smtp_port', String(body.smtpPort), actor.id)
    if (body.smtpUser !== undefined) await writeSetting(app.db, 'smtp_user', body.smtpUser, actor.id)
    if (body.emailFrom !== undefined) await writeSetting(app.db, 'email_from', body.emailFrom, actor.id)
    if (body.smtpPassword) {
      await writeSetting(app.db, 'smtp_password', encryptString(body.smtpPassword, app.env.ENCRYPTION_KEY), actor.id)
    }
    await saveAiSettings(app.db, actor.id, app.env.ENCRYPTION_KEY, body, current)
    if (body.utmPresets) await writeSetting(app.db, 'utm_presets', JSON.stringify(body.utmPresets), actor.id)
    const smtpChanged =
      (body.smtpHost !== undefined && body.smtpHost !== current.smtpHost) ||
      (body.smtpPort !== undefined && body.smtpPort !== current.smtpPort) ||
      (body.smtpUser !== undefined && body.smtpUser !== current.smtpUser) ||
      (body.emailFrom !== undefined && body.emailFrom !== current.emailFrom) ||
      Boolean(body.smtpPassword)
    if (smtpChanged) {
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'settings.smtp_updated',
        entityType: 'settings',
        entityId: 'smtp',
        metadata: { host: body.smtpHost ?? current.smtpHost, from: body.emailFrom ?? current.emailFrom },
      })
    }
    invalidateSettings()
    const settings = await getSettings(app.db, app.env)
    return adminSettingsView(settings, app.env)
  })

  /**
   * List audit events, newest first.
   * @route GET /api/admin/audit
   * @tag Admin
   * @auth admin api-key or admin session
   * @query limit number Page size, 1–200, default 50
   * @query offset number Number of rows to skip
   * @query entry string Audit row id to include when it is outside this page
   * @response 200 { entries: AuditEntry[] }
   */
  app.get('/api/admin/audit', async (request) => {
    await requireAdmin(app, request)
    const query = request.query as { limit?: string; offset?: string; entry?: string }
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
    const offset = Math.max(0, Number(query.offset) || 0)
    const entryId = isUuid(query.entry) ? query.entry : ''
    let rows = await app.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        actorUsername: users.username,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)
    if (entryId && !rows.some((row) => row.id === entryId)) {
      const extra = await app.db
        .select({
          id: auditLogs.id,
          actorUserId: auditLogs.actorUserId,
          actorUsername: users.username,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          metadata: auditLogs.metadata,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorUserId, users.id))
        .where(eq(auditLogs.id, entryId))
        .limit(1)
      if (extra[0]) rows = [extra[0], ...rows]
    }
    return {
      entries: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        actorUsername: row.actorUsername,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  })

  /**
   * Download every short link as CSV.
   * @route GET /api/admin/export/links.csv
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 text/csv
   */
  app.get('/api/admin/export/links.csv', async (request, reply) => {
    await requireAdmin(app, request)
    const settings = await getSettings(app.db, app.env)
    const rows = await app.db
      .select({ link: links, email: users.email })
      .from(links)
      .innerJoin(users, eq(links.userId, users.id))
      .orderBy(desc(links.createdAt))
    const hosts = await loadVerifiedHosts(app.db, rows.map(({ link }) => link.redirectDomainId))
    const body = csv([
      ['id', 'slug', 'short_url', 'destination_url', 'title', 'status', 'owner_email', 'created_at'],
      ...rows.map(({ link, email }) => [
        link.id,
        link.slug,
        buildShortUrl(originForLink(link, settings, hosts), settings.shortUrlPrefix, link.slug),
        link.destinationUrl,
        link.title ?? '',
        link.status,
        email,
        link.createdAt.toISOString(),
      ]),
    ])
    return reply.header('content-disposition', `attachment; filename="${appSlug(app.env.APP_NAME)}-links.csv"`).type('text/csv').send(body)
  })

  /**
   * Download click events as CSV, including UTM columns.
   * @route GET /api/admin/export/clicks.csv
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 text/csv
   */
  app.get('/api/admin/export/clicks.csv', async (request, reply) => {
    await requireAdmin(app, request)
    const result = await app.db.execute<{
      occurred_at: Date
      slug: string
      referrer: string | null
      country_code: string | null
      browser: string | null
      operating_system: string | null
      device_type: string | null
      is_bot: boolean
      utm_source: string | null
      utm_medium: string | null
      utm_campaign: string | null
      utm_id: string | null
      utm_term: string | null
      utm_content: string | null
    }>(sql`
      select e.occurred_at, l.slug, e.referrer, e.country_code, e.browser, e.operating_system,
             e.device_type, e.is_bot, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_id, e.utm_term, e.utm_content
      from click_events e
      join links l on l.id = e.link_id
      order by e.occurred_at desc
      limit 100000
    `)
    const exported = rowsOf<{
      occurred_at: Date | string
      slug: string
      referrer: string | null
      country_code: string | null
      browser: string | null
      operating_system: string | null
      device_type: string | null
      is_bot: boolean
      utm_source: string | null
      utm_medium: string | null
      utm_campaign: string | null
      utm_id: string | null
      utm_term: string | null
      utm_content: string | null
    }>(result)
    const body = csv([
      ['occurred_at', 'slug', 'referrer', 'country', 'browser', 'os', 'device', 'bot', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content'],
      ...exported.map((row) => [
        new Date(row.occurred_at).toISOString(),
        row.slug,
        row.referrer ?? '',
        row.country_code ?? '',
        row.browser ?? '',
        row.operating_system ?? '',
        row.device_type ?? '',
        row.is_bot ? 'true' : 'false',
        row.utm_source ?? '',
        row.utm_medium ?? '',
        row.utm_campaign ?? '',
        row.utm_id ?? '',
        row.utm_term ?? '',
        row.utm_content ?? '',
      ]),
    ])
    return reply.header('content-disposition', `attachment; filename="${appSlug(app.env.APP_NAME)}-clicks.csv"`).type('text/csv').send(body)
  })

  /**
   * List API keys. The secret is never returned.
   * @route GET /api/admin/api-keys
   * @tag Admin
   * @auth admin api-key or admin session
   * @response 200 { keys: ApiKey[] }
   */
  app.get('/api/admin/api-keys', async (request) => {
    await requireAdmin(app, request)
    const rows = await app.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        userId: apiKeys.userId,
        username: users.username,
        tokenPrefix: apiKeys.tokenPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .orderBy(desc(apiKeys.createdAt))
    return {
      keys: rows.map((row) => ({
        id: row.id,
        name: row.name,
        userId: row.userId,
        username: row.username,
        tokenPrefix: row.tokenPrefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
    }
  })

  /**
   * Create an API key for a user. The secret is returned once.
   * @route POST /api/admin/api-keys
   * @tag Admin
   * @auth admin api-key or admin session
   * @body JSON { name, userId }
   * @response 200 { id, name, userId, username, tokenPrefix, secret, createdAt }
   * @response 400 Turn on two-factor authentication for this account before creating an API key
   * @response 404 User not found
   */
  app.post('/api/admin/api-keys', async (request) => {
    const actor = await requireAdmin(app, request)
    const body = parseBody(createApiKeySchema, request.body)
    const found = await app.db.select().from(users).where(eq(users.id, body.userId)).limit(1)
    const user = found[0]
    if (!user) throw new AppError(404, 'User not found')
    const settings = await getSettings(app.db, app.env)
    if (settings.mfaRequired && !user.totpEnabled) {
      throw new AppError(400, 'Turn on two-factor authentication for this account before creating an API key')
    }
    const secret = `${apiKeySecretPrefix(app.env.APP_NAME)}${randomToken(32)}`
    const [created] = await app.db
      .insert(apiKeys)
      .values({
        userId: user.id,
        name: body.name,
        tokenHash: hashToken(secret, app.env.SESSION_SECRET),
        tokenPrefix: apiKeyTokenPrefix(secret, app.env.APP_NAME),
        createdBy: actor.id,
      })
      .returning()
    if (!created) throw new AppError(500, 'Could not create the API key')
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'api_key.create',
      entityType: 'api_key',
      entityId: created.id,
      metadata: { name: created.name, userId: user.id, username: user.username },
    })
    return {
      id: created.id,
      name: created.name,
      userId: user.id,
      username: user.username,
      tokenPrefix: created.tokenPrefix,
      secret,
      createdAt: created.createdAt.toISOString(),
    }
  })

  /**
   * Revoke an API key. A second revoke leaves the key revoked.
   * @route POST /api/admin/api-keys/:id/revoke
   * @tag Admin
   * @auth admin api-key or admin session
   * @param id string Key id
   * @response 200 { ok: true }
   * @response 404 API key not found
   */
  app.post('/api/admin/api-keys/:id/revoke', async (request) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const found = await app.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1)
    const key = found[0]
    if (!key) throw new AppError(404, 'API key not found')
    if (!key.revokedAt) {
      await app.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.id))
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'api_key.revoke',
        entityType: 'api_key',
        entityId: key.id,
        metadata: { name: key.name, userId: key.userId },
      })
    }
    return { ok: true }
  })
}

async function saveLinkSharing(
  db: Database,
  actorId: string,
  body: {
    linkSharing?: boolean
    linkSharingAccess?: 'view' | 'edit'
    linkSharingShowAdmin?: boolean
    linkSharingEditAdmin?: boolean
  },
  current: AppSettings,
): Promise<void> {
  if (
    body.linkSharing === undefined &&
    body.linkSharingAccess === undefined &&
    body.linkSharingShowAdmin === undefined &&
    body.linkSharingEditAdmin === undefined
  ) {
    return
  }
  let linkSharingShowAdmin = body.linkSharingShowAdmin ?? current.linkSharingShowAdmin
  let linkSharingEditAdmin = body.linkSharingEditAdmin ?? current.linkSharingEditAdmin
  if (body.linkSharingEditAdmin === true) linkSharingShowAdmin = true
  else if (body.linkSharingShowAdmin === false) linkSharingEditAdmin = false
  if (linkSharingEditAdmin) linkSharingShowAdmin = true
  if (!linkSharingShowAdmin) linkSharingEditAdmin = false
  const next = {
    linkSharing: body.linkSharing ?? current.linkSharing,
    linkSharingAccess: body.linkSharingAccess ?? current.linkSharingAccess,
    linkSharingShowAdmin,
    linkSharingEditAdmin,
  }
  const changed =
    next.linkSharing !== current.linkSharing ||
    next.linkSharingAccess !== current.linkSharingAccess ||
    next.linkSharingShowAdmin !== current.linkSharingShowAdmin ||
    next.linkSharingEditAdmin !== current.linkSharingEditAdmin
  if (!changed) return
  if (next.linkSharing !== current.linkSharing) {
    await writeSetting(db, 'link_sharing', next.linkSharing ? 'true' : 'false', actorId)
  }
  if (next.linkSharingAccess !== current.linkSharingAccess) {
    await writeSetting(db, 'link_sharing_access', next.linkSharingAccess, actorId)
  }
  if (next.linkSharingShowAdmin !== current.linkSharingShowAdmin) {
    await writeSetting(db, 'link_sharing_show_admin', next.linkSharingShowAdmin ? 'true' : 'false', actorId)
  }
  if (next.linkSharingEditAdmin !== current.linkSharingEditAdmin) {
    await writeSetting(db, 'link_sharing_edit_admin', next.linkSharingEditAdmin ? 'true' : 'false', actorId)
  }
  await writeAudit(db, {
    actorUserId: actorId,
    action: 'settings.link_sharing',
    entityType: 'settings',
    entityId: 'link_sharing',
    metadata: next,
  })
}

function adminSettingsView(settings: AppSettings, env: RuntimeEnv) {
  return {
    appUrl: settings.appUrl,
    shortUrlBase: settings.shortUrlBase,
    shortUrlPrefix: settings.shortUrlPrefix,
    legacyPrefixEnabled: settings.legacyPrefixEnabled,
    legacyPrefixes: settings.legacyPrefixes,
    defaultRedirectType: settings.defaultRedirectType,
    slugLength: settings.slugLength,
    analyticsRetentionDays: settings.analyticsRetentionDays,
    registrationPolicy: settings.registrationPolicy,
    sessionTtlHours: settings.sessionTtlHours,
    defaultQrStyle: settings.defaultQrStyle,
    mfaRequired: settings.mfaRequired,
    linkSharing: settings.linkSharing,
    linkSharingAccess: settings.linkSharingAccess,
    linkSharingShowAdmin: settings.linkSharingShowAdmin,
    linkSharingEditAdmin: settings.linkSharingEditAdmin,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    emailFrom: settings.emailFrom,
    smtpPasswordSet: Boolean(settings.smtpPasswordEncrypted),
    smtpSource: smtpSource(settings, env),
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    aiBaseUrl: settings.aiBaseUrl,
    aiApiKeySet: Boolean(settings.aiApiKeyEncrypted),
    aiEnabled: settings.aiEnabled,
    utmPresets: settings.utmPresets,
  }
}

async function saveAiSettings(
  db: Database,
  actorId: string,
  encryptionKey: string,
  body: {
    aiProvider?: AppSettings['aiProvider']
    aiModel?: string
    aiBaseUrl?: string
    aiApiKey?: string
    aiApiKeyClear?: boolean
    aiEnabled?: boolean
  },
  current: AppSettings,
): Promise<void> {
  const touched =
    body.aiProvider !== undefined ||
    body.aiModel !== undefined ||
    body.aiBaseUrl !== undefined ||
    body.aiApiKey !== undefined ||
    body.aiApiKeyClear === true ||
    body.aiEnabled !== undefined
  if (!touched) return
  const provider = body.aiProvider ?? current.aiProvider
  const baseUrl = body.aiBaseUrl ?? current.aiBaseUrl
  if (provider === 'openai_compatible') {
    const error = aiBaseUrlError(baseUrl)
    if (error) throw new AppError(400, error, 'validation')
  }
  let changed = false
  if (body.aiProvider !== undefined && body.aiProvider !== current.aiProvider) {
    await writeSetting(db, 'ai_provider', body.aiProvider, actorId)
    changed = true
  }
  if (body.aiModel !== undefined && body.aiModel !== current.aiModel) {
    await writeSetting(db, 'ai_model', body.aiModel, actorId)
    changed = true
  }
  if (body.aiBaseUrl !== undefined && body.aiBaseUrl !== current.aiBaseUrl) {
    await writeSetting(db, 'ai_base_url', body.aiBaseUrl, actorId)
    changed = true
  }
  if (body.aiApiKey) {
    await writeSetting(db, 'ai_api_key', encryptString(body.aiApiKey, encryptionKey), actorId)
    changed = true
  } else if (body.aiApiKeyClear && current.aiApiKeyEncrypted) {
    await writeSetting(db, 'ai_api_key', '', actorId)
    changed = true
  }
  if (body.aiEnabled !== undefined && body.aiEnabled !== current.aiEnabled) {
    await writeSetting(db, 'ai_enabled', body.aiEnabled ? 'true' : 'false', actorId)
    changed = true
  }
  if (!changed) return
  await writeAudit(db, {
    actorUserId: actorId,
    action: 'settings.ai_updated',
    entityType: 'settings',
    entityId: 'ai',
    metadata: { provider, model: body.aiModel ?? current.aiModel },
  })
}

function publicSettings(settings: AppSettings, admin: boolean) {
  return {
    shortUrlPrefix: settings.shortUrlPrefix,
    shortUrlBase: settings.shortUrlBase,
    appUrl: settings.appUrl,
    defaultRedirectType: settings.defaultRedirectType,
    slugLength: settings.slugLength,
    defaultQrStyle: settings.defaultQrStyle,
    utmPresets: settings.utmPresets,
    legacyPrefixEnabled: admin ? settings.legacyPrefixEnabled : undefined,
    legacyPrefixes: admin ? settings.legacyPrefixes : undefined,
  }
}

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function publicAdminUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    totpEnabled: user.totpEnabled,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function countOwnedLinks(db: Database, userId: string): Promise<number> {
  const rows = rowsOf<{ count: number }>(await db.execute(sql`select count(*)::int as count from links where user_id = ${userId}`))
  return rows[0]?.count ?? 0
}

async function otherActiveAdmins(db: Database, userId: string): Promise<number> {
  const rows = rowsOf<{ count: number }>(
    await db.execute(sql`select count(*)::int as count from users where role = 'admin' and is_active = true and id <> ${userId}`),
  )
  return rows[0]?.count ?? 0
}

async function removeAvatarFile(directory: string, filename: string | null): Promise<void> {
  if (!filename || filename.includes('/') || filename.includes('..')) return
  await fs.rm(path.join(directory, filename), { force: true })
}
