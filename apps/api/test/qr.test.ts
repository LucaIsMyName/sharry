import fs from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { qrCodes } from '@sharry/database'
import { defaultQrStyle } from '@sharry/shared'
import { moveQrLogosToMedia } from '../src/media-backfill.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

describe('qr export', () => {
  useTestApp()

  it('downloads a non-empty svg, png, and jpeg', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle },
    })
    expect(created.statusCode).toBe(200)
    const id = created.json().id as string
    const svg = await ctx.app.inject({ method: 'GET', url: `/api/qr/${id}/export?format=svg`, headers: { cookie: user.cookie } })
    const png = await ctx.app.inject({ method: 'GET', url: `/api/qr/${id}/export?format=png`, headers: { cookie: user.cookie } })
    const jpeg = await ctx.app.inject({ method: 'GET', url: `/api/qr/${id}/export?format=jpeg`, headers: { cookie: user.cookie } })
    expect(svg.statusCode).toBe(200)
    expect(svg.body).toContain('<path')
    expect(png.rawPayload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(jpeg.rawPayload.subarray(0, 2).toString('hex')).toBe('ffd8')
  })

  it('lists saved QR codes newest first', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const older = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Older', style: defaultQrStyle },
    })
    const newer = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Newer', style: defaultQrStyle },
    })
    await ctx.db.update(qrCodes).set({ createdAt: new Date('2026-01-01T00:00:00.000Z') }).where(eq(qrCodes.id, older.json().id as string))
    await ctx.db.update(qrCodes).set({ createdAt: new Date('2026-06-01T00:00:00.000Z') }).where(eq(qrCodes.id, newer.json().id as string))
    const listed = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${link.json().id}/qr`,
      headers: { cookie: user.cookie },
    })
    expect(listed.statusCode).toBe(200)
    expect((listed.json().qrCodes as { name: string }[]).map((code) => code.name)).toEqual(['Newer', 'Older'])
  })

  it('deletes a center image', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle },
    })
    const id = created.json().id as string
    const filename = `${id}.png`
    await fs.mkdir(ctx.env.QR_DATA_DIR, { recursive: true })
    await fs.writeFile(path.join(ctx.env.QR_DATA_DIR, filename), Buffer.from('png'))
    await ctx.db.update(qrCodes).set({ logoPath: filename }).where(eq(qrCodes.id, id))
    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/qr/${id}/logo`, headers: { cookie: user.cookie } })
    expect(removed.statusCode).toBe(204)
    const missing = await ctx.app.inject({ method: 'GET', url: `/api/qr/${id}/logo`, headers: { cookie: user.cookie } })
    expect(missing.statusCode).toBe(404)
    await expect(fs.access(path.join(ctx.env.QR_DATA_DIR, filename))).rejects.toThrow()
  })

  it('stores an uploaded center image in the media library', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle },
    })
    const id = created.json().id as string
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 40, b: 60 } },
    }).png().toBuffer()
    const body = multipart(png)
    const uploaded = await ctx.app.inject({
      method: 'POST',
      url: `/api/qr/${id}/logo`,
      headers: { cookie: user.cookie, ...body.headers },
      payload: body.payload,
    })
    expect(uploaded.statusCode).toBe(200)
    const mediaId = uploaded.json().logoMediaId as string
    expect(uploaded.json().logoUrl).toBe(`/files/${mediaId}/logo.png`)
    const library = await ctx.app.inject({ method: 'GET', url: '/api/media', headers: { cookie: user.cookie } })
    expect(library.json().media).toEqual([expect.objectContaining({ id: mediaId, usageCount: 1 })])
    const logo = await ctx.app.inject({ method: 'GET', url: `/api/qr/${id}/logo`, headers: { cookie: user.cookie } })
    expect(logo.headers['content-type']).toContain('image/png')
    const svg = await ctx.app.inject({
      method: 'GET',
      url: `/api/qr/${id}/export?format=svg`,
      headers: { cookie: user.cookie },
    })
    expect(svg.body).toContain('data:image/png;base64,')
  })

  it('refuses a center image that is not a raster image or belongs to someone else', async () => {
    const ctx = await getContext()
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const bob = await createSessionUser(ctx, { username: 'bob', email: 'bob@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: ada.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const pdf = await uploadMedia(ctx, ada.cookie, Buffer.from('%PDF-1.7\n%%EOF'), 'flyer.pdf')
    const asPdf = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: ada.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle, logoMediaId: pdf.json().id },
    })
    expect(asPdf.statusCode).toBe(400)
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer()
    const foreign = await uploadMedia(ctx, bob.cookie, png, 'bob.png')
    const asForeign = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: ada.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle, logoMediaId: foreign.json().id },
    })
    expect(asForeign.statusCode).toBe(404)
  })

  it('moves stored center images into the media library on startup', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle },
    })
    const id = created.json().id as string
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Lost', style: defaultQrStyle },
    })
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } } }).webp().toBuffer()
    await fs.mkdir(ctx.env.QR_DATA_DIR, { recursive: true })
    await fs.writeFile(path.join(ctx.env.QR_DATA_DIR, `${id}.webp`), webp)
    await ctx.db.update(qrCodes).set({ logoPath: `${id}.webp` }).where(eq(qrCodes.id, id))
    await ctx.db.update(qrCodes).set({ logoPath: 'gone.webp' }).where(eq(qrCodes.id, missing.json().id as string))

    expect(await moveQrLogosToMedia(ctx.db, ctx.env)).toBe(1)
    expect(await moveQrLogosToMedia(ctx.db, ctx.env)).toBe(0)

    const [moved] = await ctx.db.select().from(qrCodes).where(eq(qrCodes.id, id))
    expect(moved?.logoPath).toBeNull()
    expect(moved?.logoMediaId).toBeTruthy()
    const [lost] = await ctx.db.select().from(qrCodes).where(eq(qrCodes.id, missing.json().id as string))
    expect(lost).toMatchObject({ logoPath: null, logoMediaId: null })
    await expect(fs.access(path.join(ctx.env.QR_DATA_DIR, `${id}.webp`))).rejects.toThrow()
    const library = await ctx.app.inject({ method: 'GET', url: '/api/media', headers: { cookie: user.cookie } })
    expect(library.json().media).toEqual([
      expect.objectContaining({ name: 'poster Poster QR center image.webp', usageCount: 1, userId: user.id }),
    ])
  })
})

async function uploadMedia(ctx: Awaited<ReturnType<typeof getContext>>, cookie: string, file: Buffer, filename: string) {
  const body = multipart(file, filename)
  return ctx.app.inject({ method: 'POST', url: '/api/media', headers: { cookie, ...body.headers }, payload: body.payload })
}

function multipart(file: Buffer, filename = 'logo.png'): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----sharry-logo'
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}
