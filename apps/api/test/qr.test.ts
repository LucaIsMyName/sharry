import { describe, expect, it } from 'vitest'
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
})
