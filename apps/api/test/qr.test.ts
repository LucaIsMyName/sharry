import fs from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { qrCodes } from '@sharry/database'
import { defaultQrStyle } from '@sharry/shared'
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
})
