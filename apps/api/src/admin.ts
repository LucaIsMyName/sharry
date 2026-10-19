import { desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { auditLogs, links, users, type Database, type UserRecord } from '@sharry/database'
import {
  buildShortUrl,
  createUserSchema,
  settingsUpdateSchema,
  updateUserSchema,
  validatePrefix,
  type RuntimeEnv,
} from '@sharry/shared'
import { requireAdmin } from './auth.ts'
import { writeAudit } from './audit.ts'
import { smtpSource } from './mail.ts'
import { hashPassword } from './passwords.ts'
import { rowsOf, getSettings, invalidateSettings, writeSetting, type AppSettings } from './settings-store.ts'
import { AppError, csv, encryptString, isUniqueViolation, parseBody } from './support.ts'

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get('/api/settings/public', async (request) => {
    const { requireUser } = await import('./auth.ts')
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    return { ...publicSettings(settings, actor.role === 'admin'), appName: app.env.APP_NAME }
  })

  app.get('/api/admin/users', async (request) => {
    await requireAdmin(app, request)
    const rows = await app.db.select().from(users).orderBy(desc(users.createdAt))
    return { users: rows.map(publicAdminUser) }
  })

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

  app.patch('/api/admin/users/:id', async (request) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const body = parseBody(updateUserSchema, request.body)
    const found = await app.db.select().from(users).where(eq(users.id, id)).limit(1)
    const user = found[0]
    if (!user) throw new AppError(404, 'User not found')
    if (user.id === actor.id && body.isActive === false) throw new AppError(400, 'You cannot deactivate your own account')
    const demoting = user.role === 'admin' && (body.role === 'user' || body.isActive === false)
    if (demoting) {
      const others = rowsOf<{ count: number }>(
        await app.db.execute(sql`select count(*)::int as count from users where role = 'admin' and is_active = true and id <> ${user.id}`),
      )[0]?.count ?? 0
      if (others < 1) throw new AppError(400, 'Keep at least one active administrator')
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
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: updated.role, isActive: updated.isActive, passwordReset: Boolean(body.password) },
    })
    return publicAdminUser(updated)
  })

  app.get('/api/admin/settings', async (request) => {
    await requireAdmin(app, request)
    const settings = await getSettings(app.db, app.env)
    return adminSettingsView(settings, app.env)
  })

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
    if (body.appUrl) await writeSetting(app.db, 'app_url', trim(body.appUrl), actor.id)
    if (body.shortUrlBase) await writeSetting(app.db, 'short_url_base', trim(body.shortUrlBase), actor.id)
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
    if (body.smtpHost !== undefined) await writeSetting(app.db, 'smtp_host', body.smtpHost, actor.id)
    if (body.smtpPort !== undefined) await writeSetting(app.db, 'smtp_port', String(body.smtpPort), actor.id)
    if (body.smtpUser !== undefined) await writeSetting(app.db, 'smtp_user', body.smtpUser, actor.id)
    if (body.emailFrom !== undefined) await writeSetting(app.db, 'email_from', body.emailFrom, actor.id)
    if (body.smtpPassword) {
      await writeSetting(app.db, 'smtp_password', encryptString(body.smtpPassword, app.env.ENCRYPTION_KEY), actor.id)
    }
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

  app.get('/api/admin/audit', async (request) => {
    await requireAdmin(app, request)
    const query = request.query as { limit?: string; offset?: string }
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
    const offset = Math.max(0, Number(query.offset) || 0)
    const rows = await app.db
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

  app.get('/api/admin/export/links.csv', async (request, reply) => {
    await requireAdmin(app, request)
    const settings = await getSettings(app.db, app.env)
    const rows = await app.db
      .select({ link: links, email: users.email })
      .from(links)
      .innerJoin(users, eq(links.userId, users.id))
      .orderBy(desc(links.createdAt))
    const body = csv([
      ['id', 'slug', 'short_url', 'destination_url', 'title', 'status', 'owner_email', 'created_at'],
      ...rows.map(({ link, email }) => [
        link.id,
        link.slug,
        buildShortUrl(settings.shortUrlBase, settings.shortUrlPrefix, link.slug),
        link.destinationUrl,
        link.title ?? '',
        link.status,
        email,
        link.createdAt.toISOString(),
      ]),
    ])
    return reply.header('content-disposition', 'attachment; filename="sharry-links.csv"').type('text/csv').send(body)
  })

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
      utm_campaign: string | null
    }>(sql`
      select e.occurred_at, l.slug, e.referrer, e.country_code, e.browser, e.operating_system,
             e.device_type, e.is_bot, e.utm_source, e.utm_campaign
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
      utm_campaign: string | null
    }>(result)
    const body = csv([
      ['occurred_at', 'slug', 'referrer', 'country', 'browser', 'os', 'device', 'bot', 'utm_source', 'utm_campaign'],
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
        row.utm_campaign ?? '',
      ]),
    ])
    return reply.header('content-disposition', 'attachment; filename="sharry-clicks.csv"').type('text/csv').send(body)
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
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser,
    emailFrom: settings.emailFrom,
    smtpPasswordSet: Boolean(settings.smtpPasswordEncrypted),
    smtpSource: smtpSource(settings, env),
  }
}

function publicSettings(settings: AppSettings, admin: boolean) {
  return {
    shortUrlPrefix: settings.shortUrlPrefix,
    shortUrlBase: settings.shortUrlBase,
    appUrl: settings.appUrl,
    defaultRedirectType: settings.defaultRedirectType,
    slugLength: settings.slugLength,
    defaultQrStyle: settings.defaultQrStyle,
    legacyPrefixEnabled: admin ? settings.legacyPrefixEnabled : undefined,
    legacyPrefixes: admin ? settings.legacyPrefixes : undefined,
  }
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

function trim(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

export async function countOwnedLinks(db: Database, userId: string): Promise<number> {
  const rows = rowsOf<{ count: number }>(await db.execute(sql`select count(*)::int as count from links where user_id = ${userId}`))
  return rows[0]?.count ?? 0
}
