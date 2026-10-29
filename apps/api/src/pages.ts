import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { landingPages, mediaAssets, redirectDomains, users, type Database, type LandingPageRecord } from '@sharry/database'
import {
  PAGE_SLUG_TAKEN_MESSAGE,
  allocateRandomSlug,
  buildShortUrl,
  createPageSchema,
  defaultPageSettings,
  mediaFilePath,
  pageContentSchema,
  pageMediaIds,
  pageSettingsSchema,
  renderPage,
  starterContent,
  updatePageSchema,
  validatePrefix,
  validateSlug,
  type PageContent,
  type PageMediaRef,
  type PageSettings,
  type UpdatePageInput,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { canAccessOwned, loadVerifiedHosts, originForLink, visibleOwnedWhere } from './links.ts'
import { assertFolder } from './organize.ts'
import { isVerifiedRedirectHost, requestHostname, requireVerifiedDomain } from './redirect-domains.ts'
import { getSettings, type AppSettings } from './settings-store.ts'
import { slugify } from './ai/page-slug.ts'
import { AppError, isUniqueViolation, parseBody } from './support.ts'

export type PageStatus = 'draft' | 'published' | 'changed' | 'hidden'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Scripts, frames, forms, and outside resources are off. Pages only need their own CSS, images, and videos. */
export const PAGE_CSP =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
export const PREVIEW_BANNER = 'Preview, not public'

export function registerPageRoutes(app: FastifyInstance): void {
  /**
   * List landing pages visible to the caller.
   * @route GET /api/pages
   * @tag Pages
   * @auth api-key or session
   * @query folder string Folder id, or root. Omitted lists every visible page
   * @query q string Match the title or slug. Search ignores the open folder
   * @query status string draft, published, changed, or hidden
   * @query sort string title, slug, updatedAt, or createdAt
   * @query dir string asc or desc
   * @query limit number Page size, 1–200, default 100
   * @query offset number Number of rows to skip
   * @response 200 { pages: Page[], total: number } Content is left out of the list
   */
  app.get('/api/pages', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { folder?: string; q?: string; status?: string; sort?: string; dir?: string; limit?: string; offset?: string }
    const settings = await getSettings(app.db, app.env)
    const where = pageScope(actor, settings, query)
    const limit = clampNumber(query.limit, 100, 1, 200)
    const offset = clampNumber(query.offset, 0, 0, 100_000)
    const rows = await app.db.select().from(landingPages).where(where).orderBy(pageOrder(query.sort, query.dir)).limit(limit).offset(offset)
    const counted = await app.db.select({ count: sql<number>`count(*)::int` }).from(landingPages).where(where)
    return { pages: await presentPages(app.db, actor, settings, rows), total: counted[0]?.count ?? 0 }
  })

  /**
   * Check whether a page slug is free.
   * @route GET /api/pages/availability
   * @tag Pages
   * @auth api-key or session
   * @query slug string Slug to check
   * @query exceptId string Page id to ignore while editing
   * @response 200 { available: boolean, error: string | null }
   */
  app.get('/api/pages/availability', async (request) => {
    await requireUser(app, request, ['full'])
    const query = request.query as { slug?: string; exceptId?: string }
    const slug = query.slug?.trim() ?? ''
    const error = validateSlug(slug)
    if (error) return { available: false, error }
    const existing = await findPageBySlug(app.db, slug)
    const available = !existing || existing.id === query.exceptId
    return { available, error: available ? null : PAGE_SLUG_TAKEN_MESSAGE }
  })

  /**
   * Suggest a free slug built from a page title.
   * @route GET /api/pages/suggest-slug
   * @tag Pages
   * @auth api-key or session
   * @query title string Page title
   * @query exceptId string Page id to ignore while editing
   * @response 200 { slug: string | null }
   */
  app.get('/api/pages/suggest-slug', async (request) => {
    await requireUser(app, request, ['full'])
    const query = request.query as { title?: string; exceptId?: string }
    return { slug: await suggestPageSlug(app.db, query.title ?? '', query.exceptId) }
  })

  /**
   * Create a landing page. It starts hidden with a title, a sentence, and a button. Omit slug to assign a random one.
   * @route POST /api/pages
   * @tag Pages
   * @auth api-key or session
   * @body JSON { title, slug?, folderId?, redirectDomainId? }
   * @response 200 Page
   * @response 409 This page address is already in use
   */
  app.post('/api/pages', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createPageSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const slug = await chooseSlug(app.db, body.slug, settings.slugLength)
    const folderId = (await assertFolder(app.db, body.folderId, 'page')) ?? null
    const redirectDomainId = await requireVerifiedDomain(app.db, body.redirectDomainId)
    const created = await insertPage(app.db, {
      userId: actor.id,
      updatedBy: actor.id,
      folderId,
      redirectDomainId,
      slug,
      title: body.title,
      settings: defaultPageSettings,
      content: starterContent(body.title),
    })
    await writeAudit(app.db, { actorUserId: actor.id, action: 'page.created', entityType: 'page', entityId: created.id, metadata: { slug } })
    return presentPage(app.db, actor, settings, created)
  })

  /**
   * Read one landing page with its draft content, settings, and the media files it uses.
   * @route GET /api/pages/:id
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @response 200 Page with content, settings, and media
   * @response 404 Page not found
   */
  app.get('/api/pages/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'view')
    return presentPage(app.db, actor, settings, page)
  })

  /**
   * Save the draft of a landing page. The public page does not change until it is published.
   * @route PATCH /api/pages/:id
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @body JSON { title?, slug?, folderId?, redirectDomainId?, hidden?, settings?, content? }
   * @response 200 Page with content, settings, and media
   * @response 403 You can view this page but not change it.
   */
  app.patch('/api/pages/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(updatePageSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'edit')
    const updated = await savePage(app.db, actor, settings, page, body)
    return presentPage(app.db, actor, settings, updated)
  })

  /**
   * Save the draft if a body is sent, then make it the public page. Publishing also turns hidden off.
   * @route POST /api/pages/:id/publish
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @body JSON { title?, slug?, folderId?, redirectDomainId?, settings?, content? } Optional
   * @response 200 Page with content, settings, and media
   */
  app.post('/api/pages/:id/publish', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(updatePageSchema, request.body ?? {})
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'edit')
    const saved = await savePage(app.db, actor, settings, page, { ...body, hidden: false })
    const [published] = await app.db
      .update(landingPages)
      .set({
        publishedTitle: saved.title,
        publishedSettings: saved.settings,
        publishedContent: saved.content,
        publishedAt: new Date(),
        hidden: false,
      })
      .where(eq(landingPages.id, saved.id))
      .returning()
    if (!published) throw new AppError(404, 'Page not found')
    await writeAudit(app.db, { actorUserId: actor.id, action: 'page.published', entityType: 'page', entityId: published.id, metadata: { slug: published.slug } })
    return presentPage(app.db, actor, settings, published)
  })

  /**
   * Take a page offline. Visitors get 404 and the published version is kept for the next publish.
   * @route POST /api/pages/:id/hide
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @response 200 Page with content, settings, and media
   */
  app.post('/api/pages/:id/hide', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'edit')
    const [hidden] = await app.db.update(landingPages).set({ hidden: true }).where(eq(landingPages.id, page.id)).returning()
    if (!hidden) throw new AppError(404, 'Page not found')
    await writeAudit(app.db, { actorUserId: actor.id, action: 'page.hidden', entityType: 'page', entityId: page.id, metadata: { slug: page.slug } })
    return presentPage(app.db, actor, settings, hidden)
  })

  /**
   * Copy a page with its draft. The copy starts hidden and unpublished.
   * @route POST /api/pages/:id/duplicate
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @response 200 Page with content, settings, and media
   */
  app.post('/api/pages/:id/duplicate', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'view')
    const slug = (await suggestPageSlug(app.db, `${page.slug} copy`)) ?? (await chooseSlug(app.db, undefined, settings.slugLength))
    const copy = await insertPage(app.db, {
      userId: actor.id,
      updatedBy: actor.id,
      folderId: page.folderId,
      redirectDomainId: page.redirectDomainId,
      slug,
      title: `${page.title} (copy)`.slice(0, 200),
      settings: page.settings,
      content: page.content,
    })
    await writeAudit(app.db, { actorUserId: actor.id, action: 'page.duplicated', entityType: 'page', entityId: copy.id, metadata: { from: page.id, slug } })
    return presentPage(app.db, actor, settings, copy)
  })

  /**
   * Delete a landing page. Its address returns 404 afterwards.
   * @route DELETE /api/pages/:id
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @response 204 Empty
   * @response 403 You can view this page but not change it.
   */
  app.delete('/api/pages/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'edit')
    await app.db.delete(landingPages).where(eq(landingPages.id, page.id))
    await writeAudit(app.db, { actorUserId: actor.id, action: 'page.deleted', entityType: 'page', entityId: page.id, metadata: { slug: page.slug } })
    return reply.code(204).send()
  })

  /**
   * Render the saved draft as a full HTML page with a preview notice. It is never cached or indexed.
   * @route GET /api/pages/:id/preview
   * @tag Pages
   * @auth api-key or session
   * @param id string Page id
   * @response 200 text/html
   */
  app.get('/api/pages/:id/preview', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const page = await getPageForActor(app.db, actor, idParam(request), settings, 'view')
    return sendPageHtml(reply, await renderDraft(app.db, page, settings, true), { preview: true, noindex: true })
  })
}

/** Serve a public landing page, or a signed-in preview of one that is not public yet. */
export async function tryLandingPage(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const pathname = new URL(request.url, 'http://localhost').pathname
  const settings = await getSettings(app.db, app.env)
  if (!isPagePath(pathname, settings)) return false
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean)[1] ?? '')
  const page = await findPageBySlug(app.db, slug)
  const hostname = requestHostname(request)
  const onRedirectHost = await isVerifiedRedirectHost(app.db, hostname)
  if (page && onRedirectHost && page.redirectDomainId !== (await verifiedDomainId(app.db, hostname))) {
    notFound(reply)
    return true
  }
  if (page && isPublic(page)) {
    const hosts = await loadVerifiedHosts(app.db, [page.redirectDomainId])
    const origin = publicPageOrigin({ protocol: request.protocol, host: request.host, hostname }, page, settings, hosts)
    const html = renderPage(
      {
        title: page.publishedTitle ?? page.title,
        settings: page.publishedSettings ?? defaultPageSettings,
        content: page.publishedContent ?? { blocks: [] },
        origin,
        url: `${origin}${settings.pagePrefix}/${encodeURIComponent(page.slug)}`,
      },
      { media: mediaLookup(await loadMediaRefs(app.db, pageMediaIds(page.publishedContent ?? { blocks: [] }, page.publishedSettings ?? undefined))) },
    )
    sendPageHtml(reply, html, { preview: false, noindex: Boolean(page.publishedSettings?.noindex) })
    return true
  }
  if (page && !onRedirectHost) {
    const actor = await optionalActor(app, request)
    if (actor && canAccessOwned(actor, page, await ownerRole(app.db, page.userId), settings, 'view')) {
      sendPageHtml(reply, await renderDraft(app.db, page, settings, true), { preview: true, noindex: true })
      return true
    }
  }
  notFound(reply)
  return true
}

export function isPagePath(
  pathname: string,
  settings: { pagePrefix: string; legacyPagePrefixEnabled: boolean; legacyPagePrefixes: string[] },
): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return false
  const prefix = `/${segments[0]}`
  if (validatePrefix(prefix)) return false
  if (prefix === settings.pagePrefix) return true
  return settings.legacyPagePrefixEnabled && settings.legacyPagePrefixes.includes(prefix)
}

export function pageStatus(page: LandingPageRecord): PageStatus {
  if (!page.publishedAt) return 'draft'
  if (page.hidden) return 'hidden'
  return draftDiffers(page) ? 'changed' : 'published'
}

export async function findPageBySlug(db: Database, slug: string): Promise<LandingPageRecord | undefined> {
  const found = await db.select().from(landingPages).where(sql`lower(${landingPages.slug}) = ${slug.toLowerCase()}`).limit(1)
  return found[0]
}

export async function getPageForActor(db: Database, actor: Actor, id: string, settings: AppSettings, mode: 'view' | 'edit'): Promise<LandingPageRecord> {
  if (!uuidPattern.test(id)) throw new AppError(404, 'Page not found')
  const found = await db
    .select({ page: landingPages, ownerRole: users.role })
    .from(landingPages)
    .innerJoin(users, eq(users.id, landingPages.userId))
    .where(eq(landingPages.id, id))
    .limit(1)
  const row = found[0]
  if (!row || !canAccessOwned(actor, row.page, row.ownerRole, settings, 'view')) throw new AppError(404, 'Page not found')
  if (mode === 'edit' && !canAccessOwned(actor, row.page, row.ownerRole, settings, 'edit')) {
    throw new AppError(403, 'You can view this page but not change it.')
  }
  return row.page
}

/** Media library files a page needs, keyed by id. Files that were deleted are left out. */
export async function loadMediaRefs(db: Database, ids: string[]): Promise<Map<string, PageMediaRef>> {
  const refs = new Map<string, PageMediaRef>()
  const valid = ids.filter((id) => uuidPattern.test(id))
  if (valid.length === 0) return refs
  const rows = await db.select().from(mediaAssets).where(inArray(mediaAssets.id, valid))
  for (const row of rows) {
    refs.set(row.id, { id: row.id, path: mediaFilePath(row.id, row.name), mime: row.mime, alt: row.alt, width: row.width, height: row.height })
  }
  return refs
}

async function savePage(db: Database, actor: Actor, settings: AppSettings, page: LandingPageRecord, body: UpdatePageInput): Promise<LandingPageRecord> {
  const changes: Partial<typeof landingPages.$inferInsert> = { updatedAt: new Date(), updatedBy: actor.id }
  if (body.title !== undefined) changes.title = body.title
  if (body.hidden !== undefined) changes.hidden = body.hidden
  if (body.settings !== undefined) changes.settings = body.settings
  if (body.content !== undefined) changes.content = body.content
  if (body.slug !== undefined && body.slug !== page.slug) changes.slug = await chooseSlug(db, body.slug, settings.slugLength, page.id)
  if (body.folderId !== undefined) changes.folderId = (await assertFolder(db, body.folderId, 'page')) ?? null
  if (body.redirectDomainId !== undefined) changes.redirectDomainId = await requireVerifiedDomain(db, body.redirectDomainId)
  if (body.content !== undefined || body.settings !== undefined) {
    await assertUsableMedia(db, actor, settings, pageMediaIds(body.content ?? page.content, body.settings ?? page.settings))
  }
  try {
    const [updated] = await db.update(landingPages).set(changes).where(eq(landingPages.id, page.id)).returning()
    if (!updated) throw new AppError(404, 'Page not found')
    return updated
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, PAGE_SLUG_TAKEN_MESSAGE, 'slug_taken')
    throw error
  }
}

async function insertPage(db: Database, values: typeof landingPages.$inferInsert): Promise<LandingPageRecord> {
  try {
    const [created] = await db.insert(landingPages).values(values).returning()
    if (!created) throw new AppError(500, 'Could not create the page')
    return created
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, PAGE_SLUG_TAKEN_MESSAGE, 'slug_taken')
    throw error
  }
}

async function chooseSlug(db: Database, requested: string | undefined, length: number, exceptId?: string): Promise<string> {
  const custom = requested?.trim()
  if (!custom) return allocateRandomSlug(length, async (slug) => Boolean(await findPageBySlug(db, slug)))
  const error = validateSlug(custom)
  if (error) throw new AppError(400, error, 'validation')
  const existing = await findPageBySlug(db, custom)
  if (existing && existing.id !== exceptId) throw new AppError(409, PAGE_SLUG_TAKEN_MESSAGE, 'slug_taken')
  return custom
}

/** The title as a slug, with -2, -3, and so on when it is taken. Null when the title has no usable words. */
export async function suggestPageSlug(db: Database, title: string, exceptId?: string): Promise<string | null> {
  const base = slugify(title)
  if (!base) return null
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const slug = attempt === 1 ? base : `${base.slice(0, 60)}-${attempt}`
    const taken = await findPageBySlug(db, slug)
    if (!taken || taken.id === exceptId) return slug
  }
  return null
}

async function assertUsableMedia(db: Database, actor: Actor, settings: AppSettings, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const visibility = visibleOwnedWhere(actor, settings, sql`${mediaAssets.userId}`)
  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(visibility ? and(inArray(mediaAssets.id, ids), visibility) : inArray(mediaAssets.id, ids))
  if (rows.length !== ids.length) throw new AppError(400, 'A block uses a file that is missing from the media library', 'validation')
}

async function renderDraft(db: Database, page: LandingPageRecord, settings: AppSettings, banner: boolean): Promise<string> {
  const content = pageContentSchema.parse(page.content)
  const pageSettings = pageSettingsSchema.parse(page.settings)
  const hosts = await loadVerifiedHosts(db, [page.redirectDomainId])
  const origin = originForLink(page, settings, hosts)
  return renderPage(
    { title: page.title, settings: pageSettings, content, origin, banner: banner ? PREVIEW_BANNER : null },
    { media: mediaLookup(await loadMediaRefs(db, pageMediaIds(content, pageSettings))) },
  )
}

function sendPageHtml(reply: FastifyReply, html: string, options: { preview: boolean; noindex: boolean }) {
  reply
    .code(200)
    .type('text/html; charset=utf-8')
    .header('content-security-policy', PAGE_CSP)
    .header('x-content-type-options', 'nosniff')
    .header('cache-control', options.preview ? 'no-store' : 'public, max-age=60')
  if (options.noindex) reply.header('x-robots-tag', 'noindex, nofollow')
  if (options.preview) reply.header('referrer-policy', 'no-referrer')
  return reply.send(html)
}

function notFound(reply: FastifyReply) {
  reply.code(404).header('cache-control', 'no-store').type('text/plain').send('Not found')
}

function isPublic(page: LandingPageRecord): boolean {
  return Boolean(page.publishedAt && page.publishedContent && !page.hidden)
}

function draftDiffers(page: LandingPageRecord): boolean {
  return (
    page.title !== page.publishedTitle ||
    JSON.stringify(page.content) !== JSON.stringify(page.publishedContent) ||
    JSON.stringify(page.settings) !== JSON.stringify(page.publishedSettings)
  )
}

function mediaLookup(refs: Map<string, PageMediaRef>) {
  return (id: string | null) => (id ? (refs.get(id) ?? null) : null)
}

async function optionalActor(app: FastifyInstance, request: FastifyRequest): Promise<Actor | null> {
  try {
    return await requireUser(app, request, ['full'])
  } catch {
    return null
  }
}

async function ownerRole(db: Database, userId: string): Promise<string> {
  const found = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
  return found[0]?.role ?? 'user'
}

async function verifiedDomainId(db: Database, hostname: string): Promise<string | null> {
  const found = await db
    .select({ id: redirectDomains.id })
    .from(redirectDomains)
    .where(and(eq(redirectDomains.hostname, hostname), eq(redirectDomains.status, 'verified')))
    .limit(1)
  return found[0]?.id ?? null
}

/** Canonical origin for a public page. A host that is not this app, the short-link host, or the page's domain is ignored. */
export function publicPageOrigin(
  request: { protocol: string; host: string; hostname: string },
  page: { redirectDomainId: string | null },
  settings: { appUrl: string; shortUrlBase: string },
  hosts: Map<string, string>,
): string {
  const allowed = new Set<string>()
  for (const value of [settings.appUrl, settings.shortUrlBase]) {
    try {
      allowed.add(new URL(value).hostname.toLowerCase())
    } catch {
      // A missing base never becomes an allowed host.
    }
  }
  const pageHost = page.redirectDomainId ? hosts.get(page.redirectDomainId)?.toLowerCase() : undefined
  if (pageHost) allowed.add(pageHost)
  if (allowed.has(request.hostname.toLowerCase())) return `${request.protocol}://${request.host}`
  return originForLink(page, settings, hosts)
}

async function presentPages(db: Database, actor: Actor, settings: AppSettings, rows: LandingPageRecord[]) {
  const [owners, hosts] = await Promise.all([
    loadOwners(db, rows.map((row) => row.userId)),
    loadVerifiedHosts(db, rows.map((row) => row.redirectDomainId)),
  ])
  return rows.map((row) => {
    const owner = owners.get(row.userId) ?? null
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      url: buildShortUrl(originForLink(row, settings, hosts), settings.pagePrefix, row.slug),
      status: pageStatus(row),
      hidden: row.hidden,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      folderId: row.folderId,
      redirectDomainId: row.redirectDomainId,
      userId: row.userId,
      owner: owner ? { username: owner.username, role: owner.role } : null,
      canEdit: canAccessOwned(actor, row, owner?.role ?? 'user', settings, 'edit'),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

async function presentPage(db: Database, actor: Actor, settings: AppSettings, row: LandingPageRecord) {
  const [summary] = await presentPages(db, actor, settings, [row])
  const content: PageContent = pageContentSchema.parse(row.content)
  const pageSettings: PageSettings = pageSettingsSchema.parse(row.settings)
  const refs = await loadMediaRefs(db, pageMediaIds(content, pageSettings))
  return { ...summary, content, settings: pageSettings, media: Object.fromEntries(refs) }
}

async function loadOwners(db: Database, ids: string[]) {
  const unique = [...new Set(ids)]
  const owners = new Map<string, { username: string; role: 'admin' | 'user' }>()
  if (unique.length === 0) return owners
  const rows = await db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(inArray(users.id, unique))
  for (const row of rows) owners.set(row.id, { username: row.username, role: row.role === 'admin' ? 'admin' : 'user' })
  return owners
}

function pageScope(actor: Actor, settings: AppSettings, query: { folder?: string; q?: string; status?: string }) {
  const filters: SQL[] = []
  const visibility = visibleOwnedWhere(actor, settings, sql`${landingPages.userId}`)
  if (visibility) filters.push(visibility)
  const q = query.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '')}%`
    const match = or(ilike(landingPages.title, pattern), ilike(landingPages.slug, pattern))
    if (match) filters.push(match)
  } else if (query.folder !== undefined) {
    const folder = query.folder && query.folder !== 'root' ? query.folder : null
    if (!folder) filters.push(isNull(landingPages.folderId))
    else filters.push(uuidPattern.test(folder) ? eq(landingPages.folderId, folder) : sql`false`)
  }
  const differs = sql`(${landingPages.title} is distinct from ${landingPages.publishedTitle} or ${landingPages.content} is distinct from ${landingPages.publishedContent} or ${landingPages.settings} is distinct from ${landingPages.publishedSettings})`
  if (query.status === 'draft') filters.push(isNull(landingPages.publishedAt))
  if (query.status === 'hidden') filters.push(sql`${landingPages.publishedAt} is not null and ${landingPages.hidden}`)
  if (query.status === 'changed') filters.push(sql`${landingPages.publishedAt} is not null and not ${landingPages.hidden} and ${differs}`)
  if (query.status === 'published') filters.push(sql`${landingPages.publishedAt} is not null and not ${landingPages.hidden} and not ${differs}`)
  return filters.length ? and(...filters) : undefined
}

function pageOrder(sort: string | undefined, dir: string | undefined) {
  const direction = dir === 'asc' ? asc : desc
  if (sort === 'title') return direction(sql`lower(${landingPages.title})`)
  if (sort === 'slug') return direction(sql`lower(${landingPages.slug})`)
  if (sort === 'createdAt') return direction(landingPages.createdAt)
  if (sort === 'updatedAt') return direction(landingPages.updatedAt)
  return desc(landingPages.updatedAt)
}

function idParam(request: FastifyRequest): string {
  return (request.params as { id: string }).id
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}
