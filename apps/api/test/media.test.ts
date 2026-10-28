import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { defaultQrStyle } from '@sharry/shared'
import { parseRange } from '../src/media.ts'
import { createSessionUser, getContext, useTestApp, type TestContext } from './helpers.ts'

describe('media library', () => {
  useTestApp()

  it('uploads an image with its size and a preview, and serves it publicly', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const png = await image(40, 20)
    const uploaded = await upload(ctx, user.cookie, png, 'Summer Poster.png')
    expect(uploaded.statusCode).toBe(200)
    const media = uploaded.json()
    expect(media).toMatchObject({ name: 'Summer Poster.png', kind: 'image', mime: 'image/png', width: 40, height: 20 })
    expect(media.size).toBeLessThanOrEqual(png.length)
    expect(media.path).toBe(`/files/${media.id}/Summer%20Poster.png`)
    expect(media.thumbnailUrl).toBe(`/api/media/${media.id}/thumbnail`)

    const thumbnail = await ctx.app.inject({ method: 'GET', url: media.thumbnailUrl, headers: { cookie: user.cookie } })
    expect(thumbnail.statusCode).toBe(200)
    expect(thumbnail.headers['content-type']).toContain('image/webp')

    const file = await ctx.app.inject({ method: 'GET', url: media.path })
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('image/png')
    expect(file.headers['x-content-type-options']).toBe('nosniff')
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(file.rawPayload.length).toBe(media.size)
    expect(await sharp(file.rawPayload).metadata()).toMatchObject({ format: 'png', width: 40, height: 20 })

    const partial = await ctx.app.inject({ method: 'GET', url: media.path, headers: { range: 'bytes=0-7' } })
    expect(partial.statusCode).toBe(206)
    expect(partial.headers['content-range']).toBe(`bytes 0-7/${media.size}`)
    expect(partial.rawPayload.toString('hex')).toBe('89504e470d0a1a0a')

    const missing = await ctx.app.inject({ method: 'GET', url: '/files/00000000-0000-4000-8000-000000000000/x.png' })
    expect(missing.statusCode).toBe(404)
  })

  it('rejects unknown types, unsafe SVG files, and files over the limit', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const text = await upload(ctx, user.cookie, Buffer.from('just text'), 'notes.png')
    expect(text.statusCode).toBe(400)
    expect(text.json().error).toContain('Use a JPEG, PNG')

    const unsafe = await upload(ctx, user.cookie, Buffer.from('<svg onload="alert(1)"></svg>'), 'bad.svg')
    expect(unsafe.statusCode).toBe(400)
    expect(unsafe.json().code).toBe('media_unsafe')

    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3 * 1024 * 1024)])
    const tooLarge = await upload(ctx, user.cookie, big, 'big.pdf')
    expect(tooLarge.statusCode).toBe(413)
    expect(tooLarge.json().error).toBe('Files must be 2 MB or smaller')

    const listed = await ctx.app.inject({ method: 'GET', url: '/api/media', headers: { cookie: user.cookie } })
    expect(listed.json().total).toBe(0)
  })

  it('serves a safe SVG with a sandbox policy and stores a PDF without a preview', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const svg = await upload(ctx, user.cookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), 'logo.svg')
    expect(svg.statusCode).toBe(200)
    const served = await ctx.app.inject({ method: 'GET', url: svg.json().path })
    expect(served.headers['content-type']).toBe('image/svg+xml')
    expect(served.headers['content-security-policy']).toContain('sandbox')

    const pdf = await upload(ctx, user.cookie, Buffer.from('%PDF-1.7\n%%EOF'), 'Price list.pdf')
    expect(pdf.json()).toMatchObject({ kind: 'document', mime: 'application/pdf', thumbnailUrl: null, width: null })
  })

  it('numbers duplicate names in a folder, filters by folder, and moves files', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const folder = await ctx.app.inject({ method: 'POST', url: '/api/folders', headers, payload: { kind: 'media', name: 'Posters' } })
    expect(folder.statusCode).toBe(200)
    const folderId = folder.json().id as string

    const first = await upload(ctx, user.cookie, await image(), 'photo.png', folderId)
    const second = await upload(ctx, user.cookie, await image(), 'photo.png', folderId)
    expect(first.json().name).toBe('photo.png')
    expect(second.json().name).toBe('photo (2).png')
    expect(second.json().folderId).toBe(folderId)

    const root = await upload(ctx, user.cookie, await image(), 'photo.png')
    expect(root.json().name).toBe('photo.png')

    const inFolder = await ctx.app.inject({ method: 'GET', url: `/api/media?folder=${folderId}`, headers })
    expect(inFolder.json().total).toBe(2)
    const atRoot = await ctx.app.inject({ method: 'GET', url: '/api/media?folder=root', headers })
    expect(atRoot.json().total).toBe(1)

    const level = await ctx.app.inject({ method: 'GET', url: '/api/folders?kind=media&parent=root', headers })
    expect(level.json().folders[0]).toMatchObject({ id: folderId, childCount: 2 })

    const moved = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/media/${root.json().id}`,
      headers,
      payload: { folderId, alt: 'A red poster', title: 'Poster' },
    })
    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ folderId, name: 'photo (3).png', alt: 'A red poster', title: 'Poster' })

    const renamed = await ctx.app.inject({ method: 'PATCH', url: `/api/media/${first.json().id}`, headers, payload: { name: 'cover.jpg' } })
    expect(renamed.json().name).toBe('cover.png')

    const wrongKind = await ctx.app.inject({ method: 'POST', url: '/api/folders', headers, payload: { kind: 'link', name: 'Links' } })
    const refused = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/media/${first.json().id}`,
      headers,
      payload: { folderId: wrongKind.json().id },
    })
    expect(refused.statusCode).toBe(400)

    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/folders/${folderId}`, headers })
    expect(removed.statusCode).toBe(204)
    const after = await ctx.app.inject({ method: 'GET', url: '/api/media?folder=root', headers })
    expect(after.json().total).toBe(3)

    const search = await ctx.app.inject({ method: 'GET', url: '/api/search?q=red%20poster', headers })
    expect(search.json().media).toEqual([expect.objectContaining({ id: root.json().id })])
  })

  it('keeps files private to their owner while link sharing is off', async () => {
    const ctx = await getContext()
    const ada = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const bob = await createSessionUser(ctx, { username: 'bob', email: 'bob@example.com' })
    const uploaded = await upload(ctx, ada.cookie, await image(), 'private.png')
    const id = uploaded.json().id as string
    const listed = await ctx.app.inject({ method: 'GET', url: '/api/media', headers: { cookie: bob.cookie } })
    expect(listed.json().total).toBe(0)
    const read = await ctx.app.inject({ method: 'GET', url: `/api/media/${id}`, headers: { cookie: bob.cookie } })
    expect(read.statusCode).toBe(404)
    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/media/${id}`, headers: { cookie: bob.cookie } })
    expect(removed.statusCode).toBe(404)
    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/media' })
    expect(anonymous.statusCode).toBe(401)
  })

  it('refuses to delete a file that a QR code uses, then deletes it once it is free', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const media = (await upload(ctx, user.cookie, await image(), 'logo.png')).json()
    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers,
      payload: { destinationUrl: 'https://example.com/qr', slug: 'poster' },
    })
    const qr = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers,
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle, logoMediaId: media.id },
    })
    expect(qr.statusCode).toBe(200)
    expect(qr.json()).toMatchObject({ hasLogo: true, logoMediaId: media.id, logoUrl: media.path })
    expect(qr.json().style.errorCorrectionLevel).toBe('H')

    const usage = await ctx.app.inject({ method: 'GET', url: `/api/media/${media.id}/usage`, headers })
    expect(usage.json().qrCodes).toEqual([expect.objectContaining({ id: qr.json().id, linkSlug: 'poster' })])

    const blocked = await ctx.app.inject({ method: 'DELETE', url: `/api/media/${media.id}`, headers })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json()).toMatchObject({ code: 'media_in_use', error: 'This file is used by 1 QR code. Remove it there first.' })

    const cleared = await ctx.app.inject({ method: 'PATCH', url: `/api/qr/${qr.json().id}`, headers, payload: { logoMediaId: null } })
    expect(cleared.json().hasLogo).toBe(false)
    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/media/${media.id}`, headers })
    expect(removed.statusCode).toBe(204)
    const file = await ctx.app.inject({ method: 'GET', url: media.path })
    expect(file.statusCode).toBe(404)
  })
})

describe('image optimization', () => {
  useTestApp()

  it('scales large photos into 1920 by 1080, upright, without camera metadata', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })

    const landscape = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#3a7' } }).jpeg({ quality: 100 }).toBuffer()
    const wide = (await upload(ctx, user.cookie, landscape, 'wide.jpg')).json()
    expect(wide).toMatchObject({ mime: 'image/jpeg', width: 1440, height: 1080 })
    const wideFile = await ctx.app.inject({ method: 'GET', url: wide.path })
    expect(await sharp(wideFile.rawPayload).metadata()).toMatchObject({ format: 'jpeg', width: 1440, height: 1080 })
    expect(wideFile.rawPayload.length).toBe(wide.size)

    const sideways = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#a37' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const turned = (await upload(ctx, user.cookie, sideways, 'phone.jpg')).json()
    expect(turned).toMatchObject({ width: 1080, height: 1440 })
    const turnedMeta = await sharp((await ctx.app.inject({ method: 'GET', url: turned.path })).rawPayload).metadata()
    expect(turnedMeta).toMatchObject({ width: 1080, height: 1440 })
    expect(turnedMeta.orientation).toBeUndefined()
    expect(turnedMeta.exif).toBeUndefined()

    const portrait = await sharp({ create: { width: 4000, height: 5000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()
    const tall = (await upload(ctx, user.cookie, portrait, 'tall.png')).json()
    expect(tall).toMatchObject({ mime: 'image/png', width: 1080, height: 1350 })
    const tallMeta = await sharp((await ctx.app.inject({ method: 'GET', url: tall.path })).rawPayload).metadata()
    expect(tallMeta).toMatchObject({ format: 'png', width: 1080, height: 1350, hasAlpha: true })

    const webp = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: '#37a' } }).webp().toBuffer()
    expect((await upload(ctx, user.cookie, webp, 'square.webp')).json()).toMatchObject({ mime: 'image/webp', width: 1080, height: 1080 })
  })

  it('keeps a small image that is already compressed as uploaded', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const small = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#777' } }).jpeg({ quality: 40, mozjpeg: true }).toBuffer()
    const kept = (await upload(ctx, user.cookie, small, 'small.jpg')).json()
    expect(kept).toMatchObject({ width: 64, height: 48 })
    expect(kept.size).toBeLessThanOrEqual(small.length)
  })
})

describe('parseRange', () => {
  it('reads byte ranges and rejects ranges outside the file', () => {
    expect(parseRange(undefined, 100)).toBeNull()
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 })
    expect(parseRange('bytes=100-', 100)).toBe('invalid')
    expect(parseRange('bytes=-', 100)).toBe('invalid')
    expect(parseRange('items=1-2', 100)).toBeNull()
  })
})

async function image(width = 8, height = 8): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } } })
    .png()
    .toBuffer()
}

async function upload(ctx: TestContext, cookie: string, file: Buffer, filename: string, folder?: string) {
  const boundary = '----sharry-media'
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return ctx.app.inject({
    method: 'POST',
    url: folder ? `/api/media?folder=${folder}` : '/api/media',
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  })
}
