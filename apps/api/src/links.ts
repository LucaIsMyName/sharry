import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { clickEvents, links, qrCodes, trackingConfigs, type Database, type LinkRecord } from '@sharry/database'
import {
  SLUG_TAKEN_MESSAGE,
  buildShortUrl,
  cleanUtm,
  createLinkSchema,
  generateRandomSlug,
  updateLinkSchema,
  validateSlug,
  type UtmParams,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { hashPassword } from './passwords.ts'
import { getSettings, type AppSettings } from './settings-store.ts'
import { AppError, isUniqueViolation, parseBody, uniqueConstraint } from './support.ts'
import fs from 'node:fs/promises'
import path from 'node:path'

export function registerLinkRoutes(app: FastifyInstance): void {
  /**
   * List short links visible to the caller.
   * @route GET /api/links
   * @tag Links
   * @auth api-key or session
   * @query q string Filter by slug, title, or destination
   * @query limit number Page size, 1–100, default 50
   * @query offset number Number of rows to skip
   * @response 200 { links: Link[], total: number } Each link includes clicks, the all-time click total.
   */
  app.get('/api/links', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { q?: string; limit?: string; offset?: string }
    const limit = clampNumber(query.limit, 50, 1, 100)
    const offset = clampNumber(query.offset, 0, 0, 100_000)
    const settings = await getSettings(app.db, app.env)
    const where = linkScope(actor, query.q)
    const rows = await app.db.select().from(links).where(where).orderBy(desc(links.createdAt)).limit(limit).offset(offset)
    const total = await countLinks(app.db, where)
    const ids = rows.map((row) => row.id)
    const [configs, clicks] = await Promise.all([loadConfigs(app.db, ids), loadClickCounts(app.db, ids)])
    return {
      links: rows.map((row) => ({ ...serializeLink(row, settings, configs.get(row.id)), clicks: clicks.get(row.id) ?? 0 })),
      total,
    }
  })

  /**
   * Check whether a slug is free.
   * @route GET /api/links/availability
   * @tag Links
   * @auth api-key or session
   * @query slug string Slug to check
   * @query exceptId string Link id to ignore while editing
   * @response 200 { available: boolean, error: string | null }
   */
  app.get('/api/links/availability', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { slug?: string; exceptId?: string }
    const slug = query.slug?.trim() ?? ''
    const error = validateSlug(slug)
    if (error) return { available: false, error }
    const existing = await findBySlug(app.db, slug)
    const available = !existing || existing.id === query.exceptId
    return { available, error: available ? null : SLUG_TAKEN_MESSAGE }
  })

  /**
   * Create a short link. Omit slug to assign a random one.
   * @route POST /api/links
   * @tag Links
   * @auth api-key or session
   * @body JSON { destinationUrl, title?, description?, slug?, redirectType?, expiresAt?, password?, utm? }
   * @response 200 Link
   * @response 409 This short URL is already in use
   */
  app.post('/api/links', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createLinkSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const link = await createLink(app.db, actor, body, settings)
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    return serializeLink(link, settings, config)
  })

  /**
   * Read one short link.
   * @route GET /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @response 200 Link
   * @response 404 Link not found
   */
  app.get('/api/links/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const link = await getLinkForActor(app.db, actor, id)
    const settings = await getSettings(app.db, app.env)
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    return serializeLink(link, settings, config)
  })

  /**
   * Update a short link. The slug and click history stay unless slug is sent.
   * @route PATCH /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @body JSON { destinationUrl?, title?, description?, slug?, redirectType?, status?, expiresAt?, password?, utm? }
   * @response 200 Link
   */
  app.patch('/api/links/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const body = parseBody(updateLinkSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const link = await updateLink(app.db, actor, id, body, settings)
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    return serializeLink(link, settings, config)
  })

  /**
   * Delete a short link and its click history.
   * @route DELETE /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @response 204 Empty
   */
  app.delete('/api/links/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    await deleteLink(app, actor, id)
    return reply.code(204).send()
  })
}

type CreateBody = {
  destinationUrl: string
  title?: string
  description?: string
  slug?: string
  redirectType?: '301' | '302' | '307' | '308'
  expiresAt?: string | null
  password?: string
  utm?: UtmParams
}

export async function createLink(
  db: Database,
  actor: Actor,
  input: CreateBody,
  settings: AppSettings,
  nextSlug?: () => string,
): Promise<LinkRecord> {
  const custom = input.slug?.trim()
  if (custom) {
    const error = validateSlug(custom)
    if (error) throw new AppError(400, error, 'validation')
  }
  const passwordHash = input.password ? await hashPassword(input.password) : null
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database
    let created: LinkRecord | undefined
    const attempts = custom ? [custom] : Array.from({ length: 8 }, () => nextSlug?.() ?? generateRandomSlug(settings.slugLength))
    let lastError: unknown
    for (const slug of attempts) {
      try {
        created = await insertLink(database, {
          userId: actor.id,
          slug,
          destinationUrl: input.destinationUrl,
          title: input.title || null,
          description: input.description || null,
          redirectType: input.redirectType ?? settings.defaultRedirectType,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          passwordHash,
        })
        break
      } catch (error) {
        lastError = error
        if (uniqueConstraint(error) !== 'links_slug_lower_idx' && !isUniqueViolation(error)) throw error
        if (custom) throw new AppError(409, SLUG_TAKEN_MESSAGE, 'slug_taken')
      }
    }
    if (!created) {
      if (lastError && !isUniqueViolation(lastError)) throw lastError
      throw new AppError(409, 'Could not generate a unique slug. Try again.', 'slug_exhausted')
    }
    if (input.utm) await upsertUtm(database, created.id, input.utm)
    await writeAudit(database, {
      actorUserId: actor.id,
      action: 'link.created',
      entityType: 'link',
      entityId: created.id,
      metadata: { slug: created.slug },
    })
    return created
  })
}

async function insertLink(
  db: Database,
  values: typeof links.$inferInsert,
): Promise<LinkRecord> {
  await db.execute(sql`SAVEPOINT link_insert`)
  try {
    const [created] = await db.insert(links).values(values).returning()
    await db.execute(sql`RELEASE SAVEPOINT link_insert`)
    if (!created) throw new AppError(500, 'Could not create the link')
    return created
  } catch (error) {
    await db.execute(sql`ROLLBACK TO SAVEPOINT link_insert`)
    throw error
  }
}

export async function updateLink(
  db: Database,
  actor: Actor,
  id: string,
  input: {
    destinationUrl?: string
    title?: string | null
    description?: string | null
    slug?: string
    redirectType?: '301' | '302' | '307' | '308'
    status?: 'active' | 'disabled'
    expiresAt?: string | null
    password?: string | null
    utm?: UtmParams
  },
  settings: AppSettings,
): Promise<LinkRecord> {
  const current = await getLinkForActor(db, actor, id)
  const requestedSlug = input.slug?.trim()
  const assignRandomSlug = input.slug !== undefined && !requestedSlug
  if (requestedSlug) {
    const error = validateSlug(requestedSlug)
    if (error) throw new AppError(400, error, 'validation')
  }
  const passwordHash =
    input.password === undefined ? undefined : input.password === null ? null : await hashPassword(input.password)
  return db.transaction(async (tx) => {
    const database = tx as unknown as Database
    const patch: Partial<typeof links.$inferInsert> = { updatedAt: new Date() }
    if (input.destinationUrl && input.destinationUrl !== current.destinationUrl) {
      patch.destinationUrl = input.destinationUrl
    }
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    if (input.redirectType) patch.redirectType = input.redirectType
    if (input.status) patch.status = input.status
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (passwordHash !== undefined) patch.passwordHash = passwordHash
    if (requestedSlug && requestedSlug.toLowerCase() !== current.slug.toLowerCase()) patch.slug = requestedSlug
    let updated = current
    if (assignRandomSlug) {
      let assigned = false
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateRandomSlug(settings.slugLength)
        try {
          updated = await updateWithSavepoint(database, id, { ...patch, slug: candidate })
          patch.slug = candidate
          assigned = true
          break
        } catch (error) {
          if (!isUniqueViolation(error)) throw error
        }
      }
      if (!assigned) throw new AppError(409, 'Could not generate a unique slug. Try again.', 'slug_exhausted')
    } else if (Object.keys(patch).length > 1) {
      try {
        updated = await updateWithSavepoint(database, id, patch)
      } catch (error) {
        if (isUniqueViolation(error)) throw new AppError(409, SLUG_TAKEN_MESSAGE, 'slug_taken')
        throw error
      }
    }
    if (input.utm) await upsertUtm(database, id, input.utm)
    if (patch.destinationUrl) {
      await writeAudit(database, {
        actorUserId: actor.id,
        action: 'link.destination_changed',
        entityType: 'link',
        entityId: id,
        metadata: { from: current.destinationUrl, to: patch.destinationUrl },
      })
    }
    if (patch.slug) {
      await writeAudit(database, {
        actorUserId: actor.id,
        action: 'link.slug_changed',
        entityType: 'link',
        entityId: id,
        metadata: { from: current.slug, to: patch.slug },
      })
    }
    return updated
  })
}

async function updateWithSavepoint(db: Database, id: string, patch: Partial<typeof links.$inferInsert>): Promise<LinkRecord> {
  await db.execute(sql`SAVEPOINT link_update`)
  try {
    const [updated] = await db.update(links).set(patch).where(eq(links.id, id)).returning()
    await db.execute(sql`RELEASE SAVEPOINT link_update`)
    if (!updated) throw new AppError(404, 'Link not found')
    return updated
  } catch (error) {
    await db.execute(sql`ROLLBACK TO SAVEPOINT link_update`)
    throw error
  }
}

async function deleteLink(app: FastifyInstance, actor: Actor, id: string): Promise<void> {
  const link = await getLinkForActor(app.db, actor, id)
  const logos = await app.db.select().from(qrCodes).where(eq(qrCodes.linkId, link.id))
  await writeAudit(app.db, {
    actorUserId: actor.id,
    action: 'link.deleted',
    entityType: 'link',
    entityId: link.id,
    metadata: { slug: link.slug },
  })
  await app.db.delete(links).where(eq(links.id, link.id))
  await Promise.all(logos.map((logo) => removeLogo(app.env.QR_DATA_DIR, logo.logoPath)))
}

export async function getLinkForActor(db: Database, actor: Actor, id: string): Promise<LinkRecord> {
  const found = await db.select().from(links).where(eq(links.id, id)).limit(1)
  const link = found[0]
  if (!link || (actor.role !== 'admin' && link.userId !== actor.id)) throw new AppError(404, 'Link not found')
  return link
}

export async function findBySlug(db: Database, slug: string): Promise<LinkRecord | undefined> {
  const found = await db
    .select()
    .from(links)
    .where(sql`lower(${links.slug}) = ${slug.toLowerCase()}`)
    .limit(1)
  return found[0]
}

async function upsertUtm(db: Database, linkId: string, utm: UtmParams): Promise<void> {
  const clean = cleanUtm(utm)
  await db
    .insert(trackingConfigs)
    .values({
      linkId,
      utmSource: clean.utm_source ?? null,
      utmMedium: clean.utm_medium ?? null,
      utmCampaign: clean.utm_campaign ?? null,
      utmId: clean.utm_id ?? null,
      utmTerm: clean.utm_term ?? null,
      utmContent: clean.utm_content ?? null,
    })
    .onConflictDoUpdate({
      target: trackingConfigs.linkId,
      set: {
        utmSource: clean.utm_source ?? null,
        utmMedium: clean.utm_medium ?? null,
        utmCampaign: clean.utm_campaign ?? null,
        utmId: clean.utm_id ?? null,
        utmTerm: clean.utm_term ?? null,
        utmContent: clean.utm_content ?? null,
        updatedAt: new Date(),
      },
    })
}

export function serializeLink(
  link: LinkRecord,
  settings: AppSettings,
  utm?: UtmParams,
) {
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: buildShortUrl(settings.shortUrlBase, settings.shortUrlPrefix, link.slug),
    destinationUrl: link.destinationUrl,
    title: link.title,
    description: link.description,
    redirectType: link.redirectType,
    status: link.status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    hasPassword: Boolean(link.passwordHash),
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    utm: utm ?? {},
    userId: link.userId,
  }
}

async function loadClickCounts(db: Database, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts
  const rows = await db
    .select({ linkId: clickEvents.linkId, clicks: sql<number>`count(*)::int` })
    .from(clickEvents)
    .where(inArray(clickEvents.linkId, ids))
    .groupBy(clickEvents.linkId)
  for (const row of rows) counts.set(row.linkId, row.clicks)
  return counts
}

async function loadConfigs(db: Database, ids: string[]): Promise<Map<string, UtmParams>> {
  const map = new Map<string, UtmParams>()
  if (ids.length === 0) return map
  const rows = await db.select().from(trackingConfigs).where(inArray(trackingConfigs.linkId, ids))
  for (const row of rows) {
    map.set(row.linkId, {
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
      utm_id: row.utmId,
      utm_term: row.utmTerm,
      utm_content: row.utmContent,
    })
  }
  return map
}

function linkScope(actor: Actor, q?: string) {
  const filters = []
  if (actor.role !== 'admin') filters.push(eq(links.userId, actor.id))
  if (q?.trim()) {
    const pattern = `%${q.trim().replace(/[%_]/g, '')}%`
    filters.push(sql`(${links.slug} ilike ${pattern} or coalesce(${links.title}, '') ilike ${pattern} or ${links.destinationUrl} ilike ${pattern})`)
  }
  return filters.length ? and(...filters) : undefined
}

async function countLinks(db: Database, where: ReturnType<typeof linkScope>): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(links).where(where)
  return rows[0]?.count ?? 0
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export async function removeLogo(directory: string, filename: string | null): Promise<void> {
  if (!filename || filename.includes('/') || filename.includes('..')) return
  await fs.rm(path.join(directory, filename), { force: true })
}
