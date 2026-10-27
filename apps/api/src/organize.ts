import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  campaignTags,
  folders,
  linkTags,
  links,
  tags,
  trackingCampaigns,
  type Database,
} from '@sharry/database'
import {
  createFolderSchema,
  createTagSchema,
  folderParentCycles,
  isIconName,
  isTagColor,
  randomTagColor,
  updateFolderSchema,
  updateTagSchema,
  type TagInput,
  type TagKind,
} from '@sharry/shared'
import { requireUser } from './auth.ts'
import { writeAudit } from './audit.ts'
import { AppError, isUniqueViolation, parseBody } from './support.ts'

export type TagRef = { id: string; name: string; color: string }
export type FolderRef = { id: string; name: string; icon: string | null; parentId: string | null }

type FolderKind = 'link' | 'campaign'

function folderKind(value: string | undefined): FolderKind {
  if (value === 'campaign') return 'campaign'
  if (value === 'link') return 'link'
  throw new AppError(400, 'Choose link or campaign folders')
}

export function registerOrganizeRoutes(app: FastifyInstance): void {
  /**
   * List folders for links or campaigns.
   * @route GET /api/folders
   * @tag Links
   * @auth api-key or session
   * @query kind string link or campaign
   * @query parent string Folder id, or root. Ignored when tree=1
   * @query tree string 1 returns every folder of this kind
   * @response 200 { folders, breadcrumb }
   */
  app.get('/api/folders', async (request) => {
    await requireUser(app, request, ['full'])
    const query = request.query as { kind?: string; parent?: string; tree?: string }
    const kind = folderKind(query.kind)
    const all = await loadKind(app.db, kind)
    if (query.tree === '1') {
      return { folders: all.map(presentFolder), breadcrumb: [] as FolderRef[] }
    }
    const parentId = await resolveParent(app.db, kind, query.parent)
    const children = all.filter((folder) => folder.parentId === parentId)
    const counts = await childCounts(app.db, kind, children.map((folder) => folder.id))
    return {
      folders: children
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((folder) => ({ ...presentFolder(folder), childCount: counts.get(folder.id) ?? 0 })),
      breadcrumb: breadcrumb(all, parentId),
    }
  })

  /**
   * Create a folder.
   * @route POST /api/folders
   * @tag Links
   * @auth api-key or session
   * @body JSON { kind, name, parentId?, icon? }
   * @response 200 Folder
   */
  app.post('/api/folders', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createFolderSchema, request.body)
    const parentId = await resolveParent(app.db, body.kind, body.parentId ?? 'root')
    const [created] = await app.db
      .insert(folders)
      .values({
        kind: body.kind,
        name: body.name,
        parentId,
        icon: body.icon ?? null,
      })
      .returning()
    if (!created) throw new AppError(500, 'Could not create the folder')
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'folder.created',
      entityType: 'folder',
      entityId: created.id,
      metadata: { name: created.name, kind: created.kind },
    })
    return presentFolder(created)
  })

  /**
   * Rename a folder, change its icon, or move it.
   * @route PATCH /api/folders/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Folder id
   * @body JSON { name?, parentId?, icon? }
   * @response 200 Folder
   */
  app.patch('/api/folders/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const body = parseBody(updateFolderSchema, request.body)
    const current = await getFolder(app.db, id)
    let parentId = current.parentId
    if (body.parentId !== undefined) {
      parentId = body.parentId
      if (parentId) {
        const parent = await getFolder(app.db, parentId)
        if (parent.kind !== current.kind) throw new AppError(400, 'Choose a folder of the same kind')
      }
      const all = await loadKind(app.db, current.kind as FolderKind)
      const parents = new Map(all.map((folder) => [folder.id, folder.parentId]))
      if (folderParentCycles(current.id, parentId, parents)) {
        throw new AppError(400, 'A folder cannot sit inside itself')
      }
    }
    const [updated] = await app.db
      .update(folders)
      .set({
        name: body.name ?? current.name,
        icon: body.icon === undefined ? current.icon : body.icon,
        parentId,
        updatedAt: new Date(),
      })
      .where(eq(folders.id, current.id))
      .returning()
    if (!updated) throw new AppError(404, 'Folder not found')
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'folder.updated',
      entityType: 'folder',
      entityId: updated.id,
      metadata: { name: updated.name },
    })
    return presentFolder(updated)
  })

  /**
   * Delete a folder. Its links and subfolders move up to the parent.
   * @route DELETE /api/folders/:id
   * @tag Links
   * @auth api-key or session
   * @param id string Folder id
   * @response 204 Empty
   */
  app.delete('/api/folders/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const current = await getFolder(app.db, id)
    await app.db.transaction(async (tx) => {
      const database = tx as unknown as Database
      await database.update(folders).set({ parentId: current.parentId, updatedAt: new Date() }).where(eq(folders.parentId, current.id))
      await database.update(links).set({ folderId: current.parentId }).where(eq(links.folderId, current.id))
      await database.update(trackingCampaigns).set({ folderId: current.parentId }).where(eq(trackingCampaigns.folderId, current.id))
      await database.delete(folders).where(eq(folders.id, current.id))
      await writeAudit(database, {
        actorUserId: actor.id,
        action: 'folder.deleted',
        entityType: 'folder',
        entityId: current.id,
        metadata: { name: current.name },
      })
    })
    return reply.code(204).send()
  })

  /**
   * List tags.
   * @route GET /api/tags
   * @tag Links
   * @auth api-key or session
   * @response 200 { tags: Tag[] }
   */
  app.get('/api/tags', async (request) => {
    await requireUser(app, request, ['full'])
    const query = request.query as { kind?: string }
    const kind = query.kind === undefined ? undefined : tagKind(query.kind)
    const rows = kind
      ? await app.db.select().from(tags).where(eq(tags.kind, kind)).orderBy(asc(tags.name))
      : await app.db.select().from(tags).orderBy(asc(tags.name))
    return { tags: rows.map(presentTag) }
  })

  /**
   * Create a tag.
   * @route POST /api/tags
   * @tag Links
   * @auth api-key or session
   * @body JSON { name }
   * @response 200 Tag
   */
  app.post('/api/tags', async (request) => {
    await requireUser(app, request, ['full'])
    const body = parseBody(createTagSchema, request.body)
    const existing = await findTag(app.db, body.name, body.kind)
    if (existing) throw new AppError(409, 'This tag is already in use.')
    try {
      const [created] = await app.db
        .insert(tags)
        .values({ name: body.name, kind: body.kind, color: body.color && isTagColor(body.color) ? body.color : randomTagColor() })
        .returning()
      if (!created) throw new AppError(500, 'Could not create the tag')
      return presentTag(created)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'This tag is already in use.')
      throw error
    }
  })

  /**
   * Change a tag color.
   * @route PATCH /api/tags/:id
   * @tag Links
   * @auth api-key or session
   * @body JSON { color }
   * @response 200 Tag
   */
  app.patch('/api/tags/:id', async (request) => {
    await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const body = parseBody(updateTagSchema, request.body)
    const [updated] = await app.db.update(tags).set({ color: body.color }).where(eq(tags.id, id)).returning()
    if (!updated) throw new AppError(404, 'Tag not found')
    return presentTag(updated)
  })
}

export async function assertFolder(db: Database, folderId: string | null | undefined, kind: FolderKind): Promise<string | null | undefined> {
  if (folderId === undefined) return undefined
  if (folderId === null) return null
  const folder = await getFolder(db, folderId)
  if (folder.kind !== kind) throw new AppError(400, 'Choose a folder of the same kind')
  return folder.id
}

export async function replaceLinkTags(db: Database, linkId: string, entries: TagInput[]): Promise<void> {
  const next = await resolveTags(db, entries, 'link')
  await db.delete(linkTags).where(eq(linkTags.linkId, linkId))
  if (next.length === 0) return
  await db.insert(linkTags).values(next.map((tag) => ({ linkId, tagId: tag.id })))
}

export async function replaceCampaignTags(db: Database, campaignId: string, entries: TagInput[]): Promise<void> {
  const next = await resolveTags(db, entries, 'campaign')
  await db.delete(campaignTags).where(eq(campaignTags.campaignId, campaignId))
  if (next.length === 0) return
  await db.insert(campaignTags).values(next.map((tag) => ({ campaignId, tagId: tag.id })))
}

export async function loadLinkTags(db: Database, ids: string[]): Promise<Map<string, TagRef[]>> {
  const map = new Map<string, TagRef[]>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ linkId: linkTags.linkId, id: tags.id, name: tags.name, color: tags.color })
    .from(linkTags)
    .innerJoin(tags, eq(tags.id, linkTags.tagId))
    .where(inArray(linkTags.linkId, ids))
  for (const row of rows) {
    const list = map.get(row.linkId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    map.set(row.linkId, list)
  }
  return map
}

export async function loadCampaignTags(db: Database, ids: string[]): Promise<Map<string, TagRef[]>> {
  const map = new Map<string, TagRef[]>()
  if (ids.length === 0) return map
  const rows = await db
    .select({ campaignId: campaignTags.campaignId, id: tags.id, name: tags.name, color: tags.color })
    .from(campaignTags)
    .innerJoin(tags, eq(tags.id, campaignTags.tagId))
    .where(inArray(campaignTags.campaignId, ids))
  for (const row of rows) {
    const list = map.get(row.campaignId) ?? []
    list.push({ id: row.id, name: row.name, color: row.color })
    map.set(row.campaignId, list)
  }
  return map
}

export async function folderPaths(db: Database, ids: Array<string | null>): Promise<Map<string, FolderRef[]>> {
  const result = new Map<string, FolderRef[]>()
  const needed = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (needed.length === 0) return result
  const rows = await db.select().from(folders)
  for (const id of needed) result.set(id, breadcrumb(rows, id).map(presentFolder))
  return result
}

async function resolveTags(db: Database, entries: TagInput[], kind: TagKind): Promise<TagRef[]> {
  const unique: { name: string; color?: string }[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const draft = typeof entry === 'string' ? { name: entry } : entry
    const name = draft.name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    unique.push({ name, color: draft.color })
  }
  const resolved: TagRef[] = []
  for (const draft of unique) resolved.push(await findOrCreateTag(db, draft.name, kind, draft.color))
  return resolved
}

async function findTag(db: Database, name: string, kind: TagKind): Promise<TagRef | null> {
  const found = await db
    .select()
    .from(tags)
    .where(and(eq(tags.kind, kind), sql`lower(${tags.name}) = ${name.toLowerCase()}`))
    .limit(1)
  const tag = found[0]
  return tag ? presentTag(tag) : null
}

async function findOrCreateTag(db: Database, name: string, kind: TagKind, color?: string): Promise<TagRef> {
  const found = await findTag(db, name, kind)
  if (found) return found
  const nextColor = color && isTagColor(color) ? color : randomTagColor()
  try {
    const [created] = await db.insert(tags).values({ name, kind, color: nextColor }).returning()
    if (!created) throw new AppError(500, 'Could not create the tag')
    return presentTag(created)
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const again = await findTag(db, name, kind)
    if (again) return again
    throw error
  }
}

function presentTag(tag: { id: string; name: string; color: string; kind?: string }): TagRef {
  return { id: tag.id, name: tag.name, color: tag.color }
}

function tagKind(value: string): TagKind {
  if (value === 'link' || value === 'campaign') return value
  throw new AppError(400, 'Choose a tag kind')
}

async function getFolder(db: Database, id: string) {
  const found = await db.select().from(folders).where(eq(folders.id, id)).limit(1)
  const folder = found[0]
  if (!folder) throw new AppError(404, 'Folder not found')
  return folder
}

async function resolveParent(db: Database, kind: FolderKind, parent: string | null | undefined): Promise<string | null> {
  if (!parent || parent === 'root') return null
  const folder = await getFolder(db, parent)
  if (folder.kind !== kind) throw new AppError(400, 'Choose a folder of the same kind')
  return folder.id
}

async function loadKind(db: Database, kind: FolderKind) {
  return db.select().from(folders).where(eq(folders.kind, kind)).orderBy(asc(folders.name))
}

function breadcrumb(rows: { id: string; name: string; icon: string | null; parentId: string | null }[], parentId: string | null) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const chain: typeof rows = []
  let current = parentId ? byId.get(parentId) : undefined
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

function presentFolder(folder: { id: string; name: string; icon: string | null; parentId: string | null }) {
  return {
    id: folder.id,
    name: folder.name,
    icon: isIconName(folder.icon) ? folder.icon : null,
    parentId: folder.parentId,
  }
}

async function childCounts(db: Database, kind: FolderKind, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts
  const nested = await db
    .select({ parentId: folders.parentId, count: sql<number>`count(*)::int` })
    .from(folders)
    .where(and(eq(folders.kind, kind), inArray(folders.parentId, ids)))
    .groupBy(folders.parentId)
  for (const row of nested) {
    if (row.parentId) counts.set(row.parentId, row.count)
  }
  if (kind === 'link') {
    const owned = await db
      .select({ folderId: links.folderId, count: sql<number>`count(*)::int` })
      .from(links)
      .where(inArray(links.folderId, ids))
      .groupBy(links.folderId)
    for (const row of owned) {
      if (row.folderId) counts.set(row.folderId, (counts.get(row.folderId) ?? 0) + row.count)
    }
  } else {
    const owned = await db
      .select({ folderId: trackingCampaigns.folderId, count: sql<number>`count(*)::int` })
      .from(trackingCampaigns)
      .where(inArray(trackingCampaigns.folderId, ids))
      .groupBy(trackingCampaigns.folderId)
    for (const row of owned) {
      if (row.folderId) counts.set(row.folderId, (counts.get(row.folderId) ?? 0) + row.count)
    }
  }
  return counts
}

export function linksInFolder(folderId: string | null) {
  if (!folderId) return isNull(links.folderId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId)) return sql`false`
  return eq(links.folderId, folderId)
}
