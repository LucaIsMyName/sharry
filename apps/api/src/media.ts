import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import sharp from 'sharp'
import { links, mediaAssets, qrCodes, users, type Database, type MediaRecord } from '@sharry/database'
import {
  MEDIA_TYPE_MESSAGE,
  MEDIA_UNSAFE_SVG_MESSAGE,
  detectMediaType,
  fitMediaImage,
  mediaDisplayName,
  mediaFilePath,
  mediaKinds,
  rasterImageMimes,
  svgIsUnsafe,
  uniqueMediaName,
  updateMediaSchema,
  type MediaKind,
  type RuntimeEnv,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { canAccessOwned, visibleOwnedWhere } from './links.ts'
import { assertFolder } from './organize.ts'
import { getSettings, type AppSettings } from './settings-store.ts'
import { AppError, parseBody } from './support.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const thumbnailSize = 320
const photoQuality = 82

export type MediaUsage = { qrCodes: { id: string; name: string; linkId: string; linkSlug: string }[] }

export function registerMediaRoutes(app: FastifyInstance): void {
  /**
   * List media files visible to the caller.
   * @route GET /api/media
   * @tag Media
   * @auth api-key or session
   * @query folder string Folder id, or root. Omitted lists every visible file
   * @query q string Match the name, alt text, or title. Search ignores the open folder
   * @query kind string image, video, or document
   * @query sort string name, size, kind, or createdAt
   * @query dir string asc or desc
   * @query limit number Page size, 1–200, default 100
   * @query offset number Number of rows to skip
   * @response 200 { media: Media[], total: number }
   */
  app.get('/api/media', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as {
      folder?: string
      q?: string
      kind?: string
      sort?: string
      dir?: string
      limit?: string
      offset?: string
    }
    const settings = await getSettings(app.db, app.env)
    const where = mediaScope(actor, settings, query)
    const limit = clampNumber(query.limit, 100, 1, 200)
    const offset = clampNumber(query.offset, 0, 0, 100_000)
    const rows = await app.db.select().from(mediaAssets).where(where).orderBy(mediaOrder(query.sort, query.dir)).limit(limit).offset(offset)
    const counted = await app.db.select({ count: sql<number>`count(*)::int` }).from(mediaAssets).where(where)
    return { media: await presentMedia(app.db, actor, settings, rows), total: counted[0]?.count ?? 0 }
  })

  /**
   * Upload one file into the media library. JPEG, PNG, WebP, GIF, SVG, MP4, WebM, or PDF up to MEDIA_MAX_UPLOAD_MB. The type is read from the file contents. A JPEG, PNG, or WebP larger than 1920 by 1080 (1080 by 1920 upright) is scaled down, turned upright, and stored without camera metadata. A name that is already used in the folder gets a number, such as "photo (2).jpg".
   * @route POST /api/media
   * @tag Media
   * @auth api-key or session
   * @query folder string Folder id, or root. Default root
   * @body multipart file
   * @response 200 Media
   * @response 413 The file is larger than the upload limit
   */
  app.post('/api/media', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const folder = (request.query as { folder?: string }).folder
    const folderId = folder && folder !== 'root' ? await assertFolder(app.db, folder, 'media') : null
    const upload = await readMediaUpload(app, request)
    const created = await storeMedia(app.db, app.env, { userId: actor.id, folderId: folderId ?? null, ...upload })
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'media.uploaded',
      entityType: 'media',
      entityId: created.id,
      metadata: { name: created.name, mime: created.mime, size: created.size },
    })
    const settings = await getSettings(app.db, app.env)
    const [presented] = await presentMedia(app.db, actor, settings, [created])
    return presented
  })

  /**
   * Read one media file with the places that use it.
   * @route GET /api/media/:id
   * @tag Media
   * @auth api-key or session
   * @param id string Media id
   * @response 200 Media with usage
   */
  app.get('/api/media/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const media = await getMediaForActor(app.db, actor, (request.params as { id: string }).id, settings, 'view')
    const [presented] = await presentMedia(app.db, actor, settings, [media])
    return { ...presented, usage: (await mediaUsage(app.db, [media.id])).get(media.id) ?? emptyUsage() }
  })

  /**
   * List the QR codes that use a media file.
   * @route GET /api/media/:id/usage
   * @tag Media
   * @auth api-key or session
   * @param id string Media id
   * @response 200 { qrCodes }
   */
  app.get('/api/media/:id/usage', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const media = await getMediaForActor(app.db, actor, (request.params as { id: string }).id, settings, 'view')
    return (await mediaUsage(app.db, [media.id])).get(media.id) ?? emptyUsage()
  })

  /**
   * Rename a media file, change its alt text or title, or move it to another folder. The file extension always stays.
   * @route PATCH /api/media/:id
   * @tag Media
   * @auth api-key or session
   * @param id string Media id
   * @body JSON { name?, alt?, title?, folderId? }
   * @response 200 Media
   */
  app.patch('/api/media/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const current = await getMediaForActor(app.db, actor, (request.params as { id: string }).id, settings, 'edit')
    const body = parseBody(updateMediaSchema, request.body)
    const folderId = body.folderId === undefined ? current.folderId : ((await assertFolder(app.db, body.folderId, 'media')) ?? null)
    let name = current.name
    if (body.name !== undefined || folderId !== current.folderId) {
      const ext = path.extname(current.fileName).slice(1)
      const wanted = body.name === undefined ? current.name : mediaDisplayName(body.name, ext)
      name = uniqueMediaName(wanted, await namesInFolder(app.db, folderId, current.id))
    }
    const [updated] = await app.db
      .update(mediaAssets)
      .set({
        name,
        folderId,
        alt: body.alt === undefined ? current.alt : body.alt || null,
        title: body.title === undefined ? current.title : body.title || null,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, current.id))
      .returning()
    if (!updated) throw new AppError(404, 'File not found')
    const [presented] = await presentMedia(app.db, actor, settings, [updated])
    return presented
  })

  /**
   * Delete a media file. A file that a QR code still uses cannot be deleted.
   * @route DELETE /api/media/:id
   * @tag Media
   * @auth api-key or session
   * @param id string Media id
   * @response 204 Empty
   * @response 409 This file is still in use
   */
  app.delete('/api/media/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const media = await getMediaForActor(app.db, actor, (request.params as { id: string }).id, settings, 'edit')
    const usage = (await mediaUsage(app.db, [media.id])).get(media.id)
    if (usage && usage.qrCodes.length > 0) {
      throw new AppError(409, inUseMessage(usage), 'media_in_use')
    }
    await app.db.delete(mediaAssets).where(eq(mediaAssets.id, media.id))
    await removeMediaFiles(app.env.MEDIA_DATA_DIR, media)
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'media.deleted',
      entityType: 'media',
      entityId: media.id,
      metadata: { name: media.name },
    })
    return reply.code(204).send()
  })

  /**
   * Download a small WebP preview of an image. SVG files return the original.
   * @route GET /api/media/:id/thumbnail
   * @tag Media
   * @auth api-key or session
   * @param id string Media id
   * @response 200 Image bytes
   * @response 404 This file has no preview
   */
  app.get('/api/media/:id/thumbnail', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    const media = await getMediaForActor(app.db, actor, (request.params as { id: string }).id, settings, 'view')
    if (media.hasThumbnail) {
      const buffer = await fs.readFile(path.join(app.env.MEDIA_DATA_DIR, thumbnailName(media.id))).catch(() => null)
      if (buffer) return reply.header('cache-control', 'private, max-age=86400').type('image/webp').send(buffer)
    }
    if (media.mime === 'image/svg+xml') return sendMediaFile(app, reply, media)
    throw new AppError(404, 'This file has no preview')
  })

  /**
   * Public file URL used on landing pages and when a file is shared. Anyone with the link can open it.
   * @route GET /files/:id/:name
   * @tag Media
   * @auth public
   * @param id string Media id
   * @param name string File name. Only the id is used to find the file
   * @response 200 File bytes. Range requests are supported
   * @response 404 Not found
   */
  app.get('/files/:id/:name', async (request, reply) => servePublicFile(app, request, reply))
  app.get('/files/:id', async (request, reply) => servePublicFile(app, request, reply))
}

async function servePublicFile(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const media = uuidPattern.test(id) ? await findMedia(app.db, id) : undefined
  if (!media) return reply.code(404).type('text/plain').send('Not found')
  reply.header('cache-control', 'public, max-age=86400')
  return sendMediaFile(app, reply, media)
}

async function sendMediaFile(app: FastifyInstance, reply: FastifyReply, media: MediaRecord) {
  const file = path.join(app.env.MEDIA_DATA_DIR, media.fileName)
  const stat = await fs.stat(file).catch(() => null)
  if (!stat) return reply.code(404).type('text/plain').send('Not found')
  reply
    .header('x-content-type-options', 'nosniff')
    .header('cross-origin-resource-policy', 'cross-origin')
    .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(media.name)}`)
    .header('accept-ranges', 'bytes')
    .type(media.mime)
  if (media.mime === 'image/svg+xml') {
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
  }
  const range = parseRange(reply.request.headers.range, stat.size)
  if (range === 'invalid') {
    return reply.code(416).header('content-range', `bytes */${stat.size}`).send()
  }
  const handle = await fs.open(file)
  if (range) {
    const length = range.end - range.start + 1
    reply.code(206).header('content-range', `bytes ${range.start}-${range.end}/${stat.size}`).header('content-length', length)
    if (reply.request.method === 'HEAD') {
      await handle.close()
      return reply.send()
    }
    return reply.send(handle.createReadStream({ start: range.start, end: range.end }))
  }
  reply.header('content-length', stat.size)
  if (reply.request.method === 'HEAD') {
    await handle.close()
    return reply.send()
  }
  return reply.send(handle.createReadStream())
}

export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart = '', rawEnd = ''] = match
  if (rawStart === '' && rawEnd === '') return 'invalid'
  let start: number
  let end: number
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (suffix === 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

export async function readMediaUpload(app: FastifyInstance, request: FastifyRequest): Promise<{ buffer: Buffer; originalName: string }> {
  const maxBytes = app.env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024
  const file = await request.file({ limits: { fileSize: maxBytes, files: 1 } })
  if (!file) throw new AppError(400, 'Choose a file to upload')
  try {
    return { buffer: await file.toBuffer(), originalName: file.filename }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError(413, `Files must be ${app.env.MEDIA_MAX_UPLOAD_MB} MB or smaller`, 'file_too_large')
    }
    throw error
  }
}

/** Check, store, and record one file. Used by uploads, the QR center image, and the startup backfill. */
export async function storeMedia(
  db: Database,
  env: RuntimeEnv,
  input: { userId: string; folderId: string | null; buffer: Buffer; originalName: string; allowedMimes?: readonly string[] },
): Promise<MediaRecord> {
  const type = detectMediaType(input.buffer)
  if (!type) throw new AppError(400, MEDIA_TYPE_MESSAGE, 'media_type')
  if (input.allowedMimes && !input.allowedMimes.includes(type.mime)) {
    throw new AppError(400, 'Use a PNG, JPEG, or WebP image', 'media_type')
  }
  if (type.mime === 'image/svg+xml' && svgIsUnsafe(input.buffer.toString('utf8'))) {
    throw new AppError(400, MEDIA_UNSAFE_SVG_MESSAGE, 'media_unsafe')
  }
  let buffer = input.buffer
  let width: number | null = null
  let height: number | null = null
  let thumbnail: Buffer | null = null
  if (type.kind === 'image') {
    const meta = await sharp(buffer, { animated: false }).metadata().catch(() => null)
    if (!meta && type.mime !== 'image/svg+xml') throw new AppError(400, 'This image could not be read', 'media_type')
    if (meta?.width && meta.height) {
      const turned = (meta.orientation ?? 1) >= 5
      width = turned ? meta.height : meta.width
      height = turned ? meta.width : meta.height
    }
    if (meta && width && height && rasterImageMimes.includes(type.mime) && (meta.pages ?? 1) === 1) {
      const optimized = await optimizePhoto(buffer, type.mime, meta, width, height)
      buffer = optimized.buffer
      width = optimized.width
      height = optimized.height
    }
    thumbnail = await sharp(buffer, { animated: false })
      .rotate()
      .resize(thumbnailSize, thumbnailSize, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()
      .catch(() => null)
  }
  const id = randomUUID()
  const fileName = `${id}.${type.ext}`
  const name = uniqueMediaName(mediaDisplayName(input.originalName, type.ext), await namesInFolder(db, input.folderId))
  await fs.mkdir(env.MEDIA_DATA_DIR, { recursive: true })
  await fs.writeFile(path.join(env.MEDIA_DATA_DIR, fileName), buffer)
  if (thumbnail) await fs.writeFile(path.join(env.MEDIA_DATA_DIR, thumbnailName(id)), thumbnail)
  try {
    const [created] = await db
      .insert(mediaAssets)
      .values({
        id,
        userId: input.userId,
        folderId: input.folderId,
        kind: type.kind,
        mime: type.mime,
        name,
        fileName,
        size: buffer.length,
        width,
        height,
        hasThumbnail: Boolean(thumbnail),
      })
      .returning()
    if (!created) throw new AppError(500, 'Could not save the file')
    return created
  } catch (error) {
    await removeMediaFiles(env.MEDIA_DATA_DIR, { id, fileName })
    throw error
  }
}

/**
 * Scale a JPEG, PNG, or WebP down to the MEDIA_IMAGE_MAX box and re-encode it in the same format.
 * Re-encoding also applies the camera rotation and drops EXIF data such as GPS position.
 * The original bytes are kept when they are already smaller and carry nothing to strip.
 */
export async function optimizePhoto(
  buffer: Buffer,
  mime: string,
  meta: sharp.Metadata,
  width: number,
  height: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const target = fitMediaImage(width, height)
  let pipeline = sharp(buffer, { animated: false }).rotate()
  if (target.resized) pipeline = pipeline.resize(target.width, target.height, { fit: 'inside', withoutEnlargement: true })
  if (mime === 'image/jpeg') pipeline = pipeline.jpeg({ quality: photoQuality, mozjpeg: true })
  else if (mime === 'image/webp') pipeline = pipeline.webp({ quality: photoQuality, effort: 5, smartSubsample: true })
  else pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
  const output = await pipeline.toBuffer({ resolveWithObject: true }).catch(() => null)
  if (!output) throw new AppError(400, 'This image could not be read', 'media_type')
  const carriesMetadata = Boolean(meta.exif || meta.xmp || meta.iptc) || (meta.orientation ?? 1) !== 1
  if (!target.resized && !carriesMetadata && output.data.length >= buffer.length) return { buffer, width, height }
  return { buffer: output.data, width: output.info.width, height: output.info.height }
}

export async function findMedia(db: Database, id: string): Promise<MediaRecord | undefined> {
  if (!uuidPattern.test(id)) return undefined
  const found = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1)
  return found[0]
}

export async function getMediaForActor(
  db: Database,
  actor: Actor,
  id: string,
  settings: AppSettings,
  mode: 'view' | 'edit',
): Promise<MediaRecord> {
  if (!uuidPattern.test(id)) throw new AppError(404, 'File not found')
  const found = await db
    .select({ media: mediaAssets, ownerRole: users.role })
    .from(mediaAssets)
    .innerJoin(users, eq(users.id, mediaAssets.userId))
    .where(eq(mediaAssets.id, id))
    .limit(1)
  const row = found[0]
  if (!row || !canAccessOwned(actor, row.media, row.ownerRole, settings, 'view')) throw new AppError(404, 'File not found')
  if (mode === 'edit' && !canAccessOwned(actor, row.media, row.ownerRole, settings, 'edit')) {
    throw new AppError(403, 'You can view this file but not change it.')
  }
  return row.media
}

export async function readMediaFile(env: RuntimeEnv, media: Pick<MediaRecord, 'fileName'>): Promise<Buffer> {
  if (media.fileName.includes('/') || media.fileName.includes('..')) throw new AppError(400, 'Invalid file')
  return fs.readFile(path.join(env.MEDIA_DATA_DIR, media.fileName))
}

export async function mediaUsage(db: Database, ids: string[]): Promise<Map<string, MediaUsage>> {
  const usage = new Map<string, MediaUsage>()
  if (ids.length === 0) return usage
  const rows = await db
    .select({ mediaId: qrCodes.logoMediaId, id: qrCodes.id, name: qrCodes.name, linkId: links.id, linkSlug: links.slug })
    .from(qrCodes)
    .innerJoin(links, eq(links.id, qrCodes.linkId))
    .where(inArray(qrCodes.logoMediaId, ids))
    .orderBy(asc(qrCodes.name))
  for (const row of rows) {
    if (!row.mediaId) continue
    const entry = usage.get(row.mediaId) ?? emptyUsage()
    entry.qrCodes.push({ id: row.id, name: row.name, linkId: row.linkId, linkSlug: row.linkSlug })
    usage.set(row.mediaId, entry)
  }
  return usage
}

function emptyUsage(): MediaUsage {
  return { qrCodes: [] }
}

function inUseMessage(usage: MediaUsage): string {
  const count = usage.qrCodes.length
  return count === 1
    ? 'This file is used by 1 QR code. Remove it there first.'
    : `This file is used by ${count} QR codes. Remove it there first.`
}

async function presentMedia(db: Database, actor: Actor, settings: AppSettings, rows: MediaRecord[]) {
  const [usage, owners] = await Promise.all([
    mediaUsage(db, rows.map((row) => row.id)),
    loadOwners(db, rows.map((row) => row.userId)),
  ])
  return rows.map((row) => {
    const owner = owners.get(row.userId) ?? null
    return {
      ...serializeMedia(row, settings.appUrl),
      owner: owner ? { username: owner.username, role: owner.role } : null,
      canEdit: canAccessOwned(actor, row, owner?.role ?? 'user', settings, 'edit'),
      usageCount: usage.get(row.id)?.qrCodes.length ?? 0,
    }
  })
}

export function serializeMedia(row: MediaRecord, appUrl: string) {
  const filePath = mediaFilePath(row.id, row.name)
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as MediaKind,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    alt: row.alt,
    title: row.title,
    folderId: row.folderId,
    userId: row.userId,
    path: filePath,
    url: `${appUrl.replace(/\/$/, '')}${filePath}`,
    thumbnailUrl: row.hasThumbnail || row.mime === 'image/svg+xml' ? `/api/media/${row.id}/thumbnail` : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function loadOwners(db: Database, ids: string[]) {
  const unique = [...new Set(ids)]
  const owners = new Map<string, { username: string; role: 'admin' | 'user' }>()
  if (unique.length === 0) return owners
  const rows = await db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(inArray(users.id, unique))
  for (const row of rows) owners.set(row.id, { username: row.username, role: row.role === 'admin' ? 'admin' : 'user' })
  return owners
}

async function namesInFolder(db: Database, folderId: string | null, exceptId?: string): Promise<string[]> {
  const rows = await db
    .select({ id: mediaAssets.id, name: mediaAssets.name })
    .from(mediaAssets)
    .where(folderId ? eq(mediaAssets.folderId, folderId) : isNull(mediaAssets.folderId))
  return rows.filter((row) => row.id !== exceptId).map((row) => row.name)
}

function mediaScope(actor: Actor, settings: AppSettings, query: { folder?: string; q?: string; kind?: string }) {
  const filters: SQL[] = []
  const visibility = visibleOwnedWhere(actor, settings, sql`${mediaAssets.userId}`)
  if (visibility) filters.push(visibility)
  const q = query.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, '')}%`
    const match = or(ilike(mediaAssets.name, pattern), ilike(sql`coalesce(${mediaAssets.alt}, '')`, pattern), ilike(sql`coalesce(${mediaAssets.title}, '')`, pattern))
    if (match) filters.push(match)
  } else if (query.folder !== undefined) {
    const folder = query.folder && query.folder !== 'root' ? query.folder : null
    if (!folder) filters.push(isNull(mediaAssets.folderId))
    else filters.push(uuidPattern.test(folder) ? eq(mediaAssets.folderId, folder) : sql`false`)
  }
  if (query.kind && (mediaKinds as readonly string[]).includes(query.kind)) filters.push(eq(mediaAssets.kind, query.kind))
  return filters.length ? and(...filters) : undefined
}

function mediaOrder(sort: string | undefined, dir: string | undefined) {
  const direction = dir === 'asc' ? asc : desc
  if (sort === 'name') return direction(sql`lower(${mediaAssets.name})`)
  if (sort === 'size') return direction(mediaAssets.size)
  if (sort === 'kind') return direction(mediaAssets.kind)
  if (sort === 'createdAt') return direction(mediaAssets.createdAt)
  return desc(mediaAssets.createdAt)
}

function thumbnailName(id: string): string {
  return `${id}.thumb.webp`
}

export async function removeMediaFiles(directory: string, media: { id: string; fileName: string }): Promise<void> {
  if (media.fileName.includes('/') || media.fileName.includes('..')) return
  await Promise.all([
    fs.rm(path.join(directory, media.fileName), { force: true }),
    fs.rm(path.join(directory, thumbnailName(media.id)), { force: true }),
  ])
}

function clampNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}
