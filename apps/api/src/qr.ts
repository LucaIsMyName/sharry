import fs from 'node:fs/promises'
import path from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import sharp from 'sharp'
import { mediaAssets, qrCodes, trackingVariants, type Database } from '@sharry/database'
import {
  buildShortUrl,
  createQrSchema,
  mediaFilePath,
  parseQrStyle,
  qrWarningMessages,
  rasterImageMimes,
  renderQrSvg,
  updateQrSchema,
  type QrStyle,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { getLinkForActor, loadVerifiedHosts, originForLink, removeLogo } from './links.ts'
import { findMedia, getMediaForActor, readMediaFile, readMediaUpload, storeMedia } from './media.ts'
import { getSettings, type AppSettings } from './settings-store.ts'
import { AppError, parseBody } from './support.ts'

type QrRecord = typeof qrCodes.$inferSelect

export function registerQrRoutes(app: FastifyInstance): void {
  /**
   * List QR codes saved for a short link.
   * @route GET /api/links/:id/qr
   * @tag QR codes
   * @auth api-key or session
   * @param id string Link id
   * @response 200 { qrCodes: QrCode[] }
   */
  app.get('/api/links/:id/qr', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const settings = await getSettings(app.db, app.env)
    const link = await getLinkForActor(app.db, actor, id, settings, 'view')
    const hosts = await loadVerifiedHosts(app.db, [link.redirectDomainId])
    const base = originForLink(link, settings, hosts)
    const rows = await app.db
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.linkId, link.id))
      .orderBy(desc(qrCodes.createdAt))
    const logos = await loadLogoNames(app.db, rows)
    return { qrCodes: rows.map((row) => serializeQr(row, base, settings.shortUrlPrefix, link.slug, logos)) }
  })

  /**
   * Save a QR code for a short link. The image encodes the short URL plus a qr id.
   * @route POST /api/qr
   * @tag QR codes
   * @auth api-key or session
   * @body JSON { linkId, name, style, trackingVariantId?, logoMediaId? }
   * @response 200 QrCode with warnings
   */
  app.post('/api/qr', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createQrSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    const link = await getLinkForActor(app.db, actor, body.linkId, settings, 'edit')
    await assertVariantOnLink(app.db, link.id, body.trackingVariantId)
    if (body.logoMediaId) await assertLogoMedia(app.db, actor, settings, body.logoMediaId)
    const style = parseQrStyle(body.style)
    const [created] = await app.db
      .insert(qrCodes)
      .values({
        linkId: link.id,
        name: body.name,
        styleConfig: body.logoMediaId ? { ...style, errorCorrectionLevel: 'H' } : style,
        trackingVariantId: body.trackingVariantId ?? null,
        logoMediaId: body.logoMediaId ?? null,
      })
      .returning()
    if (!created) throw new AppError(500, 'Could not create the QR code')
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'qr.created',
      entityType: 'qr_code',
      entityId: created.id,
      metadata: { linkId: link.id, name: created.name },
    })
    const hosts = await loadVerifiedHosts(app.db, [link.redirectDomainId])
    const logos = await loadLogoNames(app.db, [created])
    return serializeQr(created, originForLink(link, settings, hosts), settings.shortUrlPrefix, link.slug, logos)
  })

  /**
   * Update a QR code name, style, campaign variant, or center image. Send logoMediaId null to remove the center image.
   * @route PATCH /api/qr/:id
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @body JSON { name?, style?, trackingVariantId?, logoMediaId? }
   * @response 200 QrCode with warnings
   */
  app.patch('/api/qr/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'edit')
    const body = parseBody(updateQrSchema, request.body)
    if (body.trackingVariantId) await assertVariantOnLink(app.db, current.link.id, body.trackingVariantId)
    if (body.logoMediaId) await assertLogoMedia(app.db, actor, current.settings, body.logoMediaId)
    let style = body.style ? parseQrStyle(body.style) : current.qr.styleConfig
    const logoChanged = body.logoMediaId !== undefined && body.logoMediaId !== current.qr.logoMediaId
    if (logoChanged && body.logoMediaId) style = { ...style, errorCorrectionLevel: 'H' }
    const [updated] = await app.db
      .update(qrCodes)
      .set({
        name: body.name ?? current.qr.name,
        styleConfig: style,
        trackingVariantId: body.trackingVariantId === undefined ? current.qr.trackingVariantId : body.trackingVariantId,
        ...(body.logoMediaId === undefined ? {} : { logoMediaId: body.logoMediaId, logoPath: null }),
      })
      .where(eq(qrCodes.id, current.qr.id))
      .returning()
    if (!updated) throw new AppError(404, 'QR code not found')
    if (body.logoMediaId !== undefined) await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    const logos = await loadLogoNames(app.db, [updated])
    return serializeQr(updated, current.base, current.prefix, current.link.slug, logos)
  })

  /**
   * Delete a QR code. Its center image stays in the media library.
   * @route DELETE /api/qr/:id
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @response 204 Empty
   */
  app.delete('/api/qr/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'edit')
    await app.db.delete(qrCodes).where(eq(qrCodes.id, current.qr.id))
    await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    return reply.code(204).send()
  })

  /**
   * Upload a center image. PNG, JPEG, or WebP. The file is saved in the media library and used by this QR code.
   * @route POST /api/qr/:id/logo
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @body multipart file
   * @response 200 { logoMediaId, logoUrl, warnings }
   */
  app.post('/api/qr/:id/logo', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'edit')
    const upload = await readMediaUpload(app, request)
    const media = await storeMedia(app.db, app.env, {
      userId: actor.id,
      folderId: null,
      allowedMimes: rasterImageMimes,
      ...upload,
    })
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'media.uploaded',
      entityType: 'media',
      entityId: media.id,
      metadata: { name: media.name, mime: media.mime, size: media.size },
    })
    const style = { ...current.qr.styleConfig, errorCorrectionLevel: 'H' as const }
    await app.db
      .update(qrCodes)
      .set({ logoMediaId: media.id, logoPath: null, styleConfig: style })
      .where(eq(qrCodes.id, current.qr.id))
    await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    return { logoMediaId: media.id, logoUrl: mediaFilePath(media.id, media.name), warnings: qrWarningMessages(style, true) }
  })

  /**
   * Remove the center image from a QR code. The file stays in the media library.
   * @route DELETE /api/qr/:id/logo
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @response 204 Empty
   */
  app.delete('/api/qr/:id/logo', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'edit')
    await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    await app.db.update(qrCodes).set({ logoPath: null, logoMediaId: null }).where(eq(qrCodes.id, current.qr.id))
    return reply.code(204).send()
  })

  /**
   * Download the center image.
   * @route GET /api/qr/:id/logo
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @response 200 Image bytes
   * @response 404 This QR code has no center image
   */
  app.get('/api/qr/:id/logo', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'view')
    const logo = await readQrLogo(app, current.qr)
    if (!logo) throw new AppError(404, 'This QR code has no center image')
    return reply.type(logo.mime).send(logo.buffer)
  })

  /**
   * Download a QR code as SVG, PNG, or JPEG.
   * @route GET /api/qr/:id/export
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @query format string svg, png, or jpeg. Default svg
   * @response 200 Image bytes
   */
  app.get('/api/qr/:id/export', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id, 'view')
    const format = (request.query as { format?: string }).format ?? 'svg'
    if (format !== 'svg' && format !== 'png' && format !== 'jpeg') {
      throw new AppError(400, 'Choose svg, png, or jpeg')
    }
    const logo = await readQrLogo(app, current.qr)
    const href = logo ? await embeddableLogo(logo.buffer, logo.mime) : null
    const svg = renderQrSvg(current.url, current.qr.styleConfig, href)
    const filename = `${current.link.slug}-${current.qr.name}`.replace(/[^a-zA-Z0-9-_]+/g, '-')
    if (format === 'svg') return sendDownload(reply, Buffer.from(svg), 'image/svg+xml', `${filename}.svg`)
    const image = sharp(Buffer.from(svg))
    if (format === 'jpeg') {
      const jpeg = await image.flatten({ background: current.qr.styleConfig.jpegBackground }).jpeg({ quality: 90 }).toBuffer()
      return sendDownload(reply, jpeg, 'image/jpeg', `${filename}.jpg`)
    }
    const png = await image.png().toBuffer()
    return sendDownload(reply, png, 'image/png', `${filename}.png`)
  })
}

export async function renderExport(svg: string, format: 'png' | 'jpeg', jpegBackground: string): Promise<Buffer> {
  if (format === 'jpeg') return sharp(Buffer.from(svg)).flatten({ background: jpegBackground }).jpeg({ quality: 90 }).toBuffer()
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function assertVariantOnLink(db: Database, linkId: string, variantId: string | null | undefined): Promise<void> {
  if (!variantId) return
  const found = await db
    .select({ id: trackingVariants.id })
    .from(trackingVariants)
    .where(and(eq(trackingVariants.id, variantId), eq(trackingVariants.linkId, linkId)))
    .limit(1)
  if (!found[0]) throw new AppError(400, 'That variant does not belong to this link')
}

async function assertLogoMedia(db: Database, actor: Actor, settings: AppSettings, mediaId: string): Promise<void> {
  const media = await getMediaForActor(db, actor, mediaId, settings, 'view')
  if (!rasterImageMimes.includes(media.mime)) throw new AppError(400, 'Use a PNG, JPEG, or WebP image')
}

async function getQrForActor(app: FastifyInstance, actor: Actor, id: string, mode: 'view' | 'edit') {
  const found = await app.db.select().from(qrCodes).where(eq(qrCodes.id, id)).limit(1)
  const qr = found[0]
  if (!qr) throw new AppError(404, 'QR code not found')
  const settings = await getSettings(app.db, app.env)
  const link = await getLinkForActor(app.db, actor, qr.linkId, settings, mode)
  const hosts = await loadVerifiedHosts(app.db, [link.redirectDomainId])
  const base = originForLink(link, settings, hosts)
  const url = buildShortUrl(base, settings.shortUrlPrefix, link.slug, {
    qr: qr.id,
    v: qr.trackingVariantId ?? undefined,
  })
  return { qr, link, url, base, prefix: settings.shortUrlPrefix, settings }
}

async function loadLogoNames(db: Database, rows: QrRecord[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap((row) => (row.logoMediaId ? [row.logoMediaId] : [])))]
  const names = new Map<string, string>()
  if (ids.length === 0) return names
  const found = await db.select({ id: mediaAssets.id, name: mediaAssets.name }).from(mediaAssets).where(inArray(mediaAssets.id, ids))
  for (const row of found) names.set(row.id, row.name)
  return names
}

function serializeQr(qr: QrRecord, base: string, prefix: string, slug: string, logos: Map<string, string>) {
  const logoName = qr.logoMediaId ? logos.get(qr.logoMediaId) : undefined
  const hasLogo = Boolean(qr.logoMediaId || qr.logoPath)
  return {
    id: qr.id,
    linkId: qr.linkId,
    trackingVariantId: qr.trackingVariantId,
    name: qr.name,
    style: qr.styleConfig,
    hasLogo,
    logoMediaId: qr.logoMediaId,
    logoUrl: qr.logoMediaId && logoName ? mediaFilePath(qr.logoMediaId, logoName) : null,
    createdAt: qr.createdAt.toISOString(),
    url: buildShortUrl(base, prefix, slug, { qr: qr.id, v: qr.trackingVariantId ?? undefined }),
    warnings: qrWarningMessages(qr.styleConfig as QrStyle, hasLogo),
  }
}

async function readQrLogo(app: FastifyInstance, qr: QrRecord): Promise<{ buffer: Buffer; mime: string } | null> {
  if (qr.logoMediaId) {
    const media = await findMedia(app.db, qr.logoMediaId)
    if (!media) return null
    const buffer = await readMediaFile(app.env, media).catch(() => null)
    return buffer ? { buffer, mime: media.mime } : null
  }
  if (!qr.logoPath) return null
  if (qr.logoPath.includes('/') || qr.logoPath.includes('..')) throw new AppError(400, 'Invalid image')
  const buffer = await fs.readFile(path.join(app.env.QR_DATA_DIR, qr.logoPath)).catch(() => null)
  if (!buffer) return null
  const mime = qr.logoPath.endsWith('.jpg') ? 'image/jpeg' : qr.logoPath.endsWith('.webp') ? 'image/webp' : 'image/png'
  return { buffer, mime }
}

/** Large library images are scaled down before they are embedded in an exported QR code. */
async function embeddableLogo(buffer: Buffer, mime: string): Promise<string> {
  const meta = await sharp(buffer).metadata().catch(() => null)
  if (meta && ((meta.width ?? 0) > 1024 || (meta.height ?? 0) > 1024)) {
    const resized = await sharp(buffer).rotate().resize(1024, 1024, { fit: 'inside' }).webp({ quality: 85 }).toBuffer()
    return `data:image/webp;base64,${resized.toString('base64')}`
  }
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function sendDownload(reply: FastifyReply, body: Buffer, type: string, filename: string) {
  return reply
    .header('content-disposition', `attachment; filename="${filename}"`)
    .type(type)
    .send(body)
}
