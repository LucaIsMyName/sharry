import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { clickEvents, links, qrCodes, redirectDomains, trackingConfigs, trackingVariants, users, type Database, type LinkRecord } from '@sharry/database'
import {
  SLUG_TAKEN_MESSAGE,
  buildShortUrl,
  cleanUtm,
  createLinkSchema,
  generateRandomSlug,
  normalizeRoutingRules,
  sameRoutingRules,
  updateLinkSchema,
  validateSlug,
  type RoutingChoices,
  type RoutingRule,
  type UtmParams,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { requireVerifiedDomain } from './redirect-domains.ts'
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
   * @response 200 { links: Link[], total: number } Each link includes clicks, the all-time click total. Owner is included when another person's links can appear.
   */
  app.get('/api/links', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { q?: string; limit?: string; offset?: string }
    const limit = clampNumber(query.limit, 50, 1, 100)
    const offset = clampNumber(query.offset, 0, 0, 100_000)
    const settings = await getSettings(app.db, app.env)
    const where = linkScope(actor, settings, query.q)
    const rows = await app.db.select().from(links).where(where).orderBy(desc(links.createdAt)).limit(limit).offset(offset)
    const total = await countLinks(app.db, where)
    const ids = rows.map((row) => row.id)
    const [configs, clicks, hosts] = await Promise.all([
      loadConfigs(app.db, ids),
      loadClickCounts(app.db, ids),
      loadVerifiedHosts(app.db, rows.map((row) => row.redirectDomainId)),
    ])
    const presented = await decorateLinks(app.db, actor, rows, settings, configs, hosts, actor.role === 'admin' || settings.linkSharing)
    return {
      links: presented.map((link) => ({ ...link, clicks: clicks.get(link.id) ?? 0 })),
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
   * @body JSON { destinationUrl, title?, description?, slug?, redirectType?, redirectDomainId?, expiresAt?, password?, utm? }
   * @response 200 Link
   * @response 409 This short URL is already in use
   */
  app.post('/api/links', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createLinkSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const link = await createLink(app.db, actor, body, settings)
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    const [presented] = await decorateLinks(
      app.db,
      actor,
      [link],
      settings,
      new Map(config ? [[link.id, config]] : []),
      await loadVerifiedHosts(app.db, [link.redirectDomainId]),
      true,
    )
    return presented
  })

  /**
   * Read one short link.
   * @route GET /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @response 200 Link with owner, updatedBy, canEdit, routingRules, and routingChoices
   * @response 404 Link not found
   */
  app.get('/api/links/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const settings = await getSettings(app.db, app.env)
    const link = await getLinkForActor(app.db, actor, id, settings, 'view')
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    const [presented] = await decorateLinks(
      app.db,
      actor,
      [link],
      settings,
      new Map(config ? [[link.id, config]] : []),
      await loadVerifiedHosts(app.db, [link.redirectDomainId]),
      true,
    )
    return { ...presented, routingChoices: await loadRoutingChoices(app.db, link.id, config) }
  })

  /**
   * Update a short link. The slug and click history stay unless slug is sent.
   * @route PATCH /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @body JSON { destinationUrl?, title?, description?, slug?, redirectType?, redirectDomainId?, status?, expiresAt?, password?, utm?, routingRules? }
   * @response 200 Link with owner, updatedBy, canEdit, routingRules, and routingChoices
   * @response 403 You can view this link but not change it.
   */
  app.patch('/api/links/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const body = parseBody(updateLinkSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const link = await updateLink(app.db, actor, id, body, settings)
    const config = (await loadConfigs(app.db, [link.id])).get(link.id)
    const [presented] = await decorateLinks(
      app.db,
      actor,
      [link],
      settings,
      new Map(config ? [[link.id, config]] : []),
      await loadVerifiedHosts(app.db, [link.redirectDomainId]),
      true,
    )
    return { ...presented, routingChoices: await loadRoutingChoices(app.db, link.id, config) }
  })

  /**
   * Delete a short link and its click history.
   * @route DELETE /api/links/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Link id
   * @response 204 Empty
   * @response 403 You can view this link but not change it.
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
  redirectDomainId?: string | null
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
  const redirectDomainId = await requireVerifiedDomain(db, input.redirectDomainId)
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
          redirectDomainId,
          updatedBy: actor.id,
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
    redirectDomainId?: string | null
    utm?: UtmParams
    routingRules?: RoutingRule[]
  },
  settings: AppSettings,
): Promise<LinkRecord> {
  const current = await getLinkForActor(db, actor, id, settings, 'edit')
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
    const patch: Partial<typeof links.$inferInsert> = { updatedAt: new Date(), updatedBy: actor.id }
    if (input.destinationUrl && input.destinationUrl !== current.destinationUrl) {
      patch.destinationUrl = input.destinationUrl
    }
    if (input.title !== undefined) patch.title = input.title
    if (input.description !== undefined) patch.description = input.description
    if (input.redirectType) patch.redirectType = input.redirectType
    if (input.status) patch.status = input.status
    if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (passwordHash !== undefined) patch.passwordHash = passwordHash
    if (input.redirectDomainId !== undefined) patch.redirectDomainId = await requireVerifiedDomain(database, input.redirectDomainId)
    if (requestedSlug && requestedSlug.toLowerCase() !== current.slug.toLowerCase()) patch.slug = requestedSlug
    const rulesChanged = input.routingRules !== undefined && !sameRoutingRules(current.routingRules, input.routingRules)
    if (rulesChanged && input.routingRules) patch.routingRules = normalizeRoutingRules(input.routingRules)
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
    if (rulesChanged) {
      await writeAudit(database, {
        actorUserId: actor.id,
        action: 'link.routing_changed',
        entityType: 'link',
        entityId: id,
        metadata: { from: normalizeRoutingRules(current.routingRules), to: patch.routingRules ?? [] },
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
  const settings = await getSettings(app.db, app.env)
  const link = await getLinkForActor(app.db, actor, id, settings, 'edit')
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

export async function getLinkForActor(
  db: Database,
  actor: Actor,
  id: string,
  settings: AppSettings,
  mode: 'view' | 'edit',
): Promise<LinkRecord> {
  const found = await db
    .select({ link: links, ownerRole: users.role })
    .from(links)
    .innerJoin(users, eq(users.id, links.userId))
    .where(eq(links.id, id))
    .limit(1)
  const row = found[0]
  if (!row || !canAccessLink(actor, row.link, row.ownerRole, settings, 'view')) throw new AppError(404, 'Link not found')
  if (mode === 'edit' && !canAccessLink(actor, row.link, row.ownerRole, settings, 'edit')) {
    throw new AppError(403, 'You can view this link but not change it.')
  }
  return row.link
}

export function visibleLinksWhere(actor: Actor, settings: AppSettings, alias: 'links' | 'l'): SQL | null {
  if (actor.role === 'admin' || (settings.linkSharing && settings.linkSharingShowAdmin)) return null
  const column = alias === 'l' ? sql`l.user_id` : sql`links.user_id`
  if (!settings.linkSharing) return sql`${column} = ${actor.id}`
  return sql`${column} = ${actor.id} or ${column} in (select id from users where role <> 'admin')`
}

function canAccessLink(
  actor: Actor,
  link: { userId: string },
  ownerRole: string,
  settings: AppSettings,
  mode: 'view' | 'edit',
): boolean {
  if (actor.role === 'admin' || link.userId === actor.id) return true
  if (!settings.linkSharing) return false
  if (ownerRole === 'admin') {
    if (!settings.linkSharingShowAdmin) return false
    if (mode === 'edit') return settings.linkSharingEditAdmin
    return true
  }
  if (mode === 'edit') return settings.linkSharingAccess === 'edit'
  return true
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

export async function loadVerifiedHosts(db: Database, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const hosts = new Map<string, string>()
  if (unique.length === 0) return hosts
  const rows = await db
    .select({ id: redirectDomains.id, hostname: redirectDomains.hostname })
    .from(redirectDomains)
    .where(and(inArray(redirectDomains.id, unique), eq(redirectDomains.status, 'verified')))
  for (const row of rows) hosts.set(row.id, row.hostname)
  return hosts
}

export function originForLink(
  link: { redirectDomainId: string | null },
  settings: { shortUrlBase: string },
  hosts: Map<string, string>,
): string {
  const hostname = link.redirectDomainId ? hosts.get(link.redirectDomainId) : undefined
  return hostname ? `https://${hostname}` : settings.shortUrlBase
}

export function serializeLink(
  link: LinkRecord,
  settings: AppSettings,
  utm?: UtmParams,
  hosts: Map<string, string> = new Map(),
) {
  const redirectDomainId = link.redirectDomainId && hosts.has(link.redirectDomainId) ? link.redirectDomainId : null
  return {
    id: link.id,
    slug: link.slug,
    shortUrl: buildShortUrl(originForLink(link, settings, hosts), settings.shortUrlPrefix, link.slug),
    redirectDomainId,
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
    routingRules: normalizeRoutingRules(link.routingRules),
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

async function loadRoutingChoices(db: Database, linkId: string, utm?: UtmParams): Promise<RoutingChoices> {
  const [variants, campaign, id, term, content] = await Promise.all([
    db
      .select({
        utmCampaign: trackingVariants.utmCampaign,
        utmId: trackingVariants.utmId,
        utmTerm: trackingVariants.utmTerm,
        utmContent: trackingVariants.utmContent,
      })
      .from(trackingVariants)
      .where(eq(trackingVariants.linkId, linkId)),
    distinctUtm(db, linkId, clickEvents.utmCampaign),
    distinctUtm(db, linkId, clickEvents.utmId),
    distinctUtm(db, linkId, clickEvents.utmTerm),
    distinctUtm(db, linkId, clickEvents.utmContent),
  ])
  return {
    utm_campaign: uniqueRoutingValues([utm?.utm_campaign, ...variants.map((row) => row.utmCampaign), ...campaign]),
    utm_id: uniqueRoutingValues([utm?.utm_id, ...variants.map((row) => row.utmId), ...id]),
    utm_term: uniqueRoutingValues([utm?.utm_term, ...variants.map((row) => row.utmTerm), ...term]),
    utm_content: uniqueRoutingValues([utm?.utm_content, ...variants.map((row) => row.utmContent), ...content]),
  }
}

async function distinctUtm(
  db: Database,
  linkId: string,
  column:
    | typeof clickEvents.utmCampaign
    | typeof clickEvents.utmId
    | typeof clickEvents.utmTerm
    | typeof clickEvents.utmContent,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ value: column })
    .from(clickEvents)
    .where(and(eq(clickEvents.linkId, linkId), sql`${column} is not null`, sql`${column} <> ''`))
  return rows.flatMap((row) => (row.value ? [row.value] : []))
}

function uniqueRoutingValues(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    result.push(trimmed)
  }
  return result.sort((left, right) => left.localeCompare(right)).slice(0, 100)
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

type LinkPerson = { username: string; role: 'admin' | 'user' }

async function decorateLinks(
  db: Database,
  actor: Actor,
  rows: LinkRecord[],
  settings: AppSettings,
  configs: Map<string, UtmParams>,
  hosts: Map<string, string>,
  includePeople: boolean,
) {
  const people = await loadPeople(
    db,
    rows.flatMap((row) => (includePeople ? [row.userId, row.updatedBy] : [row.userId])),
  )
  return rows.map((row) => {
    const owner = people.get(row.userId) ?? null
    const editor = row.updatedBy ? (people.get(row.updatedBy) ?? null) : null
    return {
      ...serializeLink(row, settings, configs.get(row.id), hosts),
      canEdit: canAccessLink(actor, row, owner?.role ?? 'user', settings, 'edit'),
      ...(includePeople ? { owner, updatedBy: editor } : {}),
    }
  })
}

async function loadPeople(db: Database, ids: Array<string | null | undefined>): Promise<Map<string, LinkPerson>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const people = new Map<string, LinkPerson>()
  if (unique.length === 0) return people
  const rows = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(inArray(users.id, unique))
  for (const row of rows) people.set(row.id, { username: row.username, role: row.role === 'admin' ? 'admin' : 'user' })
  return people
}

function linkScope(actor: Actor, settings: AppSettings, q?: string) {
  const filters = []
  const visibility = visibleLinksWhere(actor, settings, 'links')
  if (visibility) filters.push(visibility)
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
