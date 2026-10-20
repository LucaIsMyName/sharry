import fs from 'node:fs/promises'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import sharp from 'sharp'
import { qrCodes, trackingVariants, type Database } from '@sharry/database'
import {
  buildShortUrl,
  createQrSchema,
  parseQrStyle,
  qrWarnings,
  renderQrSvg,
  updateQrSchema,
  type QrStyle,
} from '@sharry/shared'
import { requireUser, type Actor } from './auth.ts'
import { writeAudit } from './audit.ts'
import { getLinkForActor, removeLogo } from './links.ts'
import { getSettings } from './settings-store.ts'
import { AppError, parseBody } from './support.ts'

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
    const link = await getLinkForActor(app.db, actor, id)
    const settings = await getSettings(app.db, app.env)
    const rows = await app.db.select().from(qrCodes).where(eq(qrCodes.linkId, link.id))
    return { qrCodes: rows.map((row) => serializeQr(row, settings.shortUrlBase, settings.shortUrlPrefix, link.slug)) }
  })

  /**
   * Save a QR code for a short link. The image encodes the short URL plus a qr id.
   * @route POST /api/qr
   * @tag QR codes
   * @auth api-key or session
   * @body JSON { linkId, name, style, trackingVariantId? }
   * @response 200 QrCode with warnings
   */
  app.post('/api/qr', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(createQrSchema, request.body)
    const link = await getLinkForActor(app.db, actor, body.linkId)
    await assertVariantOnLink(app.db, link.id, body.trackingVariantId)
    const [created] = await app.db
      .insert(qrCodes)
      .values({
        linkId: link.id,
        name: body.name,
        styleConfig: parseQrStyle(body.style),
        trackingVariantId: body.trackingVariantId ?? null,
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
    const settings = await getSettings(app.db, app.env)
    return {
      ...serializeQr(created, settings.shortUrlBase, settings.shortUrlPrefix, link.slug),
      warnings: qrWarnings(parseQrStyle(body.style), false),
    }
  })

  /**
   * Update a QR code name, style, or campaign variant.
   * @route PATCH /api/qr/:id
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @body JSON { name?, style?, trackingVariantId? }
   * @response 200 QrCode with warnings
   */
  app.patch('/api/qr/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    const body = parseBody(updateQrSchema, request.body)
    if (body.trackingVariantId) await assertVariantOnLink(app.db, current.link.id, body.trackingVariantId)
    const [updated] = await app.db
      .update(qrCodes)
      .set({
        name: body.name ?? current.qr.name,
        styleConfig: body.style ? parseQrStyle(body.style) : current.qr.styleConfig,
        trackingVariantId: body.trackingVariantId === undefined ? current.qr.trackingVariantId : body.trackingVariantId,
      })
      .where(eq(qrCodes.id, current.qr.id))
      .returning()
    if (!updated) throw new AppError(404, 'QR code not found')
    return {
      ...serializeQr(updated, current.base, current.prefix, current.link.slug),
      warnings: qrWarnings(updated.styleConfig, Boolean(updated.logoPath)),
    }
  })

  /**
   * Delete a QR code and its center image.
   * @route DELETE /api/qr/:id
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @response 204 Empty
   */
  app.delete('/api/qr/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    await app.db.delete(qrCodes).where(eq(qrCodes.id, current.qr.id))
    await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    return reply.code(204).send()
  })

  /**
   * Upload a center image. PNG, JPEG, or WebP, up to 512 KB and 1024 pixels on each side.
   * @route POST /api/qr/:id/logo
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @body multipart file
   * @response 200 { logoPath, warnings }
   */
  app.post('/api/qr/:id/logo', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    const file = await request.file()
    if (!file) throw new AppError(400, 'Choose a PNG, JPEG, or WebP image')
    const buffer = await file.toBuffer()
    if (buffer.length > 512 * 1024) throw new AppError(400, 'Images must be 512 KB or smaller')
    const meta = await sharp(buffer).metadata().catch(() => null)
    if (!meta?.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
      throw new AppError(400, 'Use a PNG, JPEG, or WebP image')
    }
    if ((meta.width ?? 0) > 1024 || (meta.height ?? 0) > 1024) {
      throw new AppError(400, 'Images must be 1024 pixels or smaller on each side')
    }
    const extension = meta.format === 'jpeg' ? 'jpg' : meta.format
    const filename = `${current.qr.id}.${extension}`
    await fs.mkdir(app.env.QR_DATA_DIR, { recursive: true })
    if (current.qr.logoPath && current.qr.logoPath !== filename) await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    await fs.writeFile(path.join(app.env.QR_DATA_DIR, filename), buffer)
    await app.db.update(qrCodes).set({ logoPath: filename }).where(eq(qrCodes.id, current.qr.id))
    const style = { ...current.qr.styleConfig, errorCorrectionLevel: 'H' as const }
    await app.db.update(qrCodes).set({ styleConfig: style }).where(eq(qrCodes.id, current.qr.id))
    return { logoPath: filename, warnings: qrWarnings(style, true) }
  })

  /**
   * Remove the center image from a QR code.
   * @route DELETE /api/qr/:id/logo
   * @tag QR codes
   * @auth api-key or session
   * @param id string QR code id
   * @response 204 Empty
   */
  app.delete('/api/qr/:id/logo', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    await removeLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    await app.db.update(qrCodes).set({ logoPath: null }).where(eq(qrCodes.id, current.qr.id))
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
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    if (!current.qr.logoPath) throw new AppError(404, 'This QR code has no center image')
    const file = await readLogo(app.env.QR_DATA_DIR, current.qr.logoPath)
    return reply.type(file.mime).send(file.buffer)
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
    const current = await getQrForActor(app, actor, (request.params as { id: string }).id)
    const format = (request.query as { format?: string }).format ?? 'svg'
    if (format !== 'svg' && format !== 'png' && format !== 'jpeg') {
      throw new AppError(400, 'Choose svg, png, or jpeg')
    }
    const href = current.qr.logoPath ? (await readLogo(app.env.QR_DATA_DIR, current.qr.logoPath)).dataUrl : null
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

async function getQrForActor(app: FastifyInstance, actor: Actor, id: string) {
  const found = await app.db.select().from(qrCodes).where(eq(qrCodes.id, id)).limit(1)
  const qr = found[0]
  if (!qr) throw new AppError(404, 'QR code not found')
  const link = await getLinkForActor(app.db, actor, qr.linkId)
  const settings = await getSettings(app.db, app.env)
  const url = buildShortUrl(settings.shortUrlBase, settings.shortUrlPrefix, link.slug, {
    qr: qr.id,
    v: qr.trackingVariantId ?? undefined,
  })
  return { qr, link, url, base: settings.shortUrlBase, prefix: settings.shortUrlPrefix }
}

function serializeQr(
  qr: typeof qrCodes.$inferSelect,
  base: string,
  prefix: string,
  slug: string,
) {
  return {
    id: qr.id,
    linkId: qr.linkId,
    trackingVariantId: qr.trackingVariantId,
    name: qr.name,
    style: qr.styleConfig,
    hasLogo: Boolean(qr.logoPath),
    createdAt: qr.createdAt.toISOString(),
    url: buildShortUrl(base, prefix, slug, { qr: qr.id, v: qr.trackingVariantId ?? undefined }),
    warnings: qrWarnings(qr.styleConfig as QrStyle, Boolean(qr.logoPath)),
  }
}

async function readLogo(directory: string, filename: string): Promise<{ buffer: Buffer; mime: string; dataUrl: string }> {
  if (filename.includes('/') || filename.includes('..')) throw new AppError(400, 'Invalid image')
  const buffer = await fs.readFile(path.join(directory, filename))
  const mime = filename.endsWith('.jpg') ? 'image/jpeg' : filename.endsWith('.webp') ? 'image/webp' : 'image/png'
  return { buffer, mime, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
}

function sendDownload(reply: FastifyReply, body: Buffer, type: string, filename: string) {
  return reply
    .header('content-disposition', `attachment; filename="${filename}"`)
    .type(type)
    .send(body)
}
