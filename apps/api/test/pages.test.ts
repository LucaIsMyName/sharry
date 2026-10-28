import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { redirectDomains } from '@sharry/database'
import { createBlock, cssUrl, type PageContent } from '@sharry/shared'
import { invalidateRedirectHosts } from '../src/redirect-domains.ts'
import { PAGE_CSP } from '../src/pages.ts'
import { createSessionUser, getContext, useTestApp, type TestContext } from './helpers.ts'

describe('landing pages', () => {
  useTestApp()

  it('creates a hidden draft from a starter layout and lists it as a draft', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await createPage(ctx, user.cookie, { title: 'Spring sale', slug: 'spring' })
    expect(created.statusCode).toBe(200)
    const page = created.json()
    expect(page).toMatchObject({
      title: 'Spring sale',
      slug: 'spring',
      status: 'draft',
      hidden: true,
      publishedAt: null,
      url: 'http://127.0.0.1:3000/l/spring',
      canEdit: true,
      owner: { username: 'ada' },
    })
    expect(page.content.blocks[0].type).toBe('container')
    expect(page.settings).toMatchObject({ noindex: false, font: 'sans' })

    const listed = await ctx.app.inject({ method: 'GET', url: '/api/pages', headers: { cookie: user.cookie } })
    expect(listed.json()).toMatchObject({ total: 1, pages: [{ id: page.id, status: 'draft' }] })
    expect(listed.json().pages[0].content).toBeUndefined()

    const random = await createPage(ctx, user.cookie, { title: 'No slug' })
    expect(random.json().slug).toMatch(/^[A-Za-z0-9]{5,}$/)
  })

  it('rejects taken, reserved, and malformed slugs and suggests a free one', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    await createPage(ctx, user.cookie, { title: 'Spring', slug: 'spring-sale' })

    const taken = await createPage(ctx, user.cookie, { title: 'Again', slug: 'Spring-Sale' })
    expect(taken.statusCode).toBe(409)
    expect(taken.json()).toMatchObject({ code: 'slug_taken', error: 'This page address is already in use. Please choose a different slug.' })
    expect((await createPage(ctx, user.cookie, { title: 'Bad', slug: 'no spaces' })).statusCode).toBe(400)
    expect((await createPage(ctx, user.cookie, { title: 'Reserved', slug: 'pages' })).statusCode).toBe(400)

    const availability = await ctx.app.inject({ method: 'GET', url: '/api/pages/availability?slug=spring-sale', headers })
    expect(availability.json()).toEqual({ available: false, error: 'This page address is already in use. Please choose a different slug.' })
    const free = await ctx.app.inject({ method: 'GET', url: '/api/pages/availability?slug=autumn', headers })
    expect(free.json()).toEqual({ available: true, error: null })

    const suggested = await ctx.app.inject({ method: 'GET', url: '/api/pages/suggest-slug?title=Spring%20Sale!', headers })
    expect(suggested.json()).toEqual({ slug: 'spring-sale-2' })
    const empty = await ctx.app.inject({ method: 'GET', url: '/api/pages/suggest-slug?title=%20!!', headers })
    expect(empty.json()).toEqual({ slug: null })
  })

  it('keeps saved changes private until they are published', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const page = (await createPage(ctx, user.cookie, { title: 'Launch', slug: 'launch' })).json()
    expect((await ctx.app.inject({ method: 'GET', url: '/l/launch' })).statusCode).toBe(404)

    const first = headingContent('Version one')
    const published = await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers, payload: { content: first } })
    expect(published.statusCode).toBe(200)
    expect(published.json()).toMatchObject({ status: 'published', hidden: false })
    expect(published.json().publishedAt).toEqual(expect.any(String))

    const live = await ctx.app.inject({ method: 'GET', url: '/l/launch' })
    expect(live.statusCode).toBe(200)
    expect(live.headers['content-type']).toContain('text/html')
    expect(live.headers['content-security-policy']).toBe(PAGE_CSP)
    expect(live.headers['cache-control']).toBe('public, max-age=60')
    expect(live.headers['x-robots-tag']).toBeUndefined()
    expect(live.body).toContain('Version one')
    expect(live.body).not.toContain('<script')

    const saved = await ctx.app.inject({ method: 'PATCH', url: `/api/pages/${page.id}`, headers, payload: { content: headingContent('Version two') } })
    expect(saved.json().status).toBe('changed')
    const stillOld = await ctx.app.inject({ method: 'GET', url: '/l/launch' })
    expect(stillOld.body).toContain('Version one')
    expect(stillOld.body).not.toContain('Version two')

    const changed = await ctx.app.inject({ method: 'GET', url: '/api/pages?status=changed', headers })
    expect(changed.json().total).toBe(1)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages?status=published', headers })).json().total).toBe(0)

    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })
    expect((await ctx.app.inject({ method: 'GET', url: '/l/launch' })).body).toContain('Version two')
  })

  it('hides a published page and brings it back on the next publish', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const page = (await createPage(ctx, user.cookie, { title: 'Promo', slug: 'promo' })).json()
    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })

    const hidden = await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/hide`, headers })
    expect(hidden.json()).toMatchObject({ status: 'hidden', hidden: true })
    expect((await ctx.app.inject({ method: 'GET', url: '/l/promo' })).statusCode).toBe(404)

    const signedIn = await ctx.app.inject({ method: 'GET', url: '/l/promo', headers })
    expect(signedIn.statusCode).toBe(200)
    expect(signedIn.body).toContain('Preview, not public')
    expect(signedIn.headers['cache-control']).toBe('no-store')
    expect(signedIn.headers['x-robots-tag']).toBe('noindex, nofollow')

    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })
    const back = await ctx.app.inject({ method: 'GET', url: '/l/promo' })
    expect(back.statusCode).toBe(200)
    expect(back.body).not.toContain('Preview, not public')
  })

  it('previews drafts only for people who may see the page', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'bob', email: 'bob@example.com' })
    const page = (await createPage(ctx, owner.cookie, { title: 'Secret', slug: 'secret' })).json()

    const preview = await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}/preview`, headers: { cookie: owner.cookie } })
    expect(preview.statusCode).toBe(200)
    expect(preview.body).toContain('Preview, not public')
    expect(preview.headers['content-security-policy']).toBe(PAGE_CSP)

    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}/preview` })).statusCode).toBe(401)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}/preview`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: '/l/secret', headers: { cookie: other.cookie } })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages', headers: { cookie: other.cookie } })).json().total).toBe(0)
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/pages/${page.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404)
  })

  it('validates content, settings, and the media a page uses', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const page = (await createPage(ctx, user.cookie, { title: 'Gallery', slug: 'gallery' })).json()

    const unknown = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/pages/${page.id}`,
      headers,
      payload: { content: { blocks: [{ id: 'x1', type: 'marquee', props: {} }] } },
    })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().error).toContain('Unknown block type')

    const badColor = await ctx.app.inject({ method: 'PATCH', url: `/api/pages/${page.id}`, headers, payload: { settings: { background: 'red' } } })
    expect(badColor.statusCode).toBe(400)

    const missingFile = imageContent('00000000-0000-4000-8000-000000000000')
    const missing = await ctx.app.inject({ method: 'PATCH', url: `/api/pages/${page.id}`, headers, payload: { content: missingFile } })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error).toBe('A block uses a file that is missing from the media library')

    const media = (await uploadImage(ctx, user.cookie)).json()
    const withImage = await ctx.app.inject({ method: 'PATCH', url: `/api/pages/${page.id}`, headers, payload: { content: imageContent(media.id) } })
    expect(withImage.statusCode).toBe(200)
    expect(withImage.json().media[media.id]).toMatchObject({ path: media.path, width: 8, height: 8 })

    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })
    const live = await ctx.app.inject({ method: 'GET', url: '/l/gallery' })
    expect(live.body).toContain(`src="${media.path}"`)

    const usage = await ctx.app.inject({ method: 'GET', url: `/api/media/${media.id}/usage`, headers })
    expect(usage.json().pages).toEqual([{ id: page.id, title: 'Gallery', slug: 'gallery' }])
    const blocked = await ctx.app.inject({ method: 'DELETE', url: `/api/media/${media.id}`, headers })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe('media_in_use')

    const listed = await ctx.app.inject({ method: 'GET', url: '/api/media', headers })
    expect(listed.json().media[0].usageCount).toBe(1)
  })

  it('counts gallery images and container backgrounds as media uses', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const page = (await createPage(ctx, user.cookie, { title: 'Photos', slug: 'photos' })).json()
    const photo = (await uploadImage(ctx, user.cookie)).json()
    const backdrop = (await uploadImage(ctx, user.cookie)).json()

    const gallery = createBlock('gallery', () => 'g1')
    gallery.props = { ...gallery.props, items: [{ mediaId: photo.id, alt: '', caption: 'Harbor' }] }
    const section = createBlock('container', () => 'c1')
    section.props = { ...section.props, backgroundImageId: backdrop.id, anchor: 'photos' }
    section.slots = { children: [gallery] }
    const saved = await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers, payload: { content: { blocks: [section] } } })
    expect(saved.statusCode).toBe(200)

    const live = await ctx.app.inject({ method: 'GET', url: '/l/photos' })
    expect(live.body).toContain(`<figure><img src="${photo.path}"`)
    expect(live.body).toContain('id="photos"')
    const backgroundUrl = cssUrl(backdrop.path)
    expect(live.body).toContain(backgroundUrl.replace(/"/g, '&quot;'))
    const served = await ctx.app.inject({ method: 'GET', url: backgroundUrl.slice('url("'.length, -'")'.length) })
    expect(served.statusCode).toBe(200)

    for (const file of [photo, backdrop]) {
      const usage = await ctx.app.inject({ method: 'GET', url: `/api/media/${file.id}/usage`, headers })
      expect(usage.json().pages).toEqual([{ id: page.id, title: 'Photos', slug: 'photos' }])
      const blocked = await ctx.app.inject({ method: 'DELETE', url: `/api/media/${file.id}`, headers })
      expect(blocked.statusCode).toBe(409)
    }
  })

  it('marks noindex pages for search engines and writes social tags', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const page = (await createPage(ctx, user.cookie, { title: 'Quiet', slug: 'quiet' })).json()
    await ctx.app.inject({
      method: 'POST',
      url: `/api/pages/${page.id}/publish`,
      headers: { cookie: user.cookie },
      payload: { settings: { noindex: true, ogTitle: 'Shared title', description: 'About us' } },
    })
    const live = await ctx.app.inject({ method: 'GET', url: '/l/quiet' })
    expect(live.headers['x-robots-tag']).toBe('noindex, nofollow')
    expect(live.body).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(live.body).toContain('<meta property="og:title" content="Shared title">')
    expect(live.body).toContain('<meta name="description" content="About us">')
  })

  it('duplicates a page as a hidden draft and deletes pages', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const page = (await createPage(ctx, user.cookie, { title: 'Original', slug: 'original' })).json()
    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })

    const copy = await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/duplicate`, headers })
    expect(copy.json()).toMatchObject({ title: 'Original (copy)', slug: 'original-copy', status: 'draft', hidden: true })
    expect(copy.json().content).toEqual(page.content)

    const removed = await ctx.app.inject({ method: 'DELETE', url: `/api/pages/${page.id}`, headers })
    expect(removed.statusCode).toBe(204)
    expect((await ctx.app.inject({ method: 'GET', url: '/l/original' })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}`, headers })).statusCode).toBe(404)
  })

  it('files pages into page folders and keeps them when a folder is deleted', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const folder = (await ctx.app.inject({ method: 'POST', url: '/api/folders', headers, payload: { kind: 'page', name: 'Events' } })).json()
    const linkFolder = (await ctx.app.inject({ method: 'POST', url: '/api/folders', headers, payload: { kind: 'link', name: 'Links' } })).json()

    expect((await createPage(ctx, user.cookie, { title: 'Wrong', folderId: linkFolder.id })).statusCode).toBe(400)
    const page = (await createPage(ctx, user.cookie, { title: 'Meetup', folderId: folder.id })).json()
    expect(page.folderId).toBe(folder.id)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages?folder=${folder.id}`, headers })).json().total).toBe(1)
    expect((await ctx.app.inject({ method: 'GET', url: '/api/pages?folder=root', headers })).json().total).toBe(0)

    await ctx.app.inject({ method: 'DELETE', url: `/api/folders/${folder.id}`, headers })
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}`, headers })).json().folderId).toBeNull()
  })

  it('serves a page on its own redirect domain only', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }
    const [brand, other] = await ctx.db
      .insert(redirectDomains)
      .values([
        { hostname: 'go.brand.com', status: 'verified', txtToken: 'a', verifiedAt: new Date() },
        { hostname: 'go.other.com', status: 'verified', txtToken: 'b', verifiedAt: new Date() },
      ])
      .returning()
    invalidateRedirectHosts()
    const page = (await createPage(ctx, user.cookie, { title: 'Brand', slug: 'brand', redirectDomainId: brand?.id })).json()
    expect(page.url).toBe('https://go.brand.com/l/brand')
    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })

    expect((await ctx.app.inject({ method: 'GET', url: '/l/brand', headers: { host: 'go.brand.com' } })).statusCode).toBe(200)
    expect((await ctx.app.inject({ method: 'GET', url: '/l/brand', headers: { host: 'go.other.com' } })).statusCode).toBe(404)
    expect((await ctx.app.inject({ method: 'GET', url: '/l/brand', headers: { host: '127.0.0.1:3000' } })).statusCode).toBe(200)
    expect(other?.status).toBe('verified')

    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/hide`, headers })
    const previewOnDomain = await ctx.app.inject({ method: 'GET', url: '/l/brand', headers: { host: 'go.brand.com', cookie: user.cookie } })
    expect(previewOnDomain.statusCode).toBe(404)
  })

  it('moves pages to a new prefix and keeps the old one when asked', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const headers = { cookie: admin.cookie }
    const page = (await createPage(ctx, admin.cookie, { title: 'Moving', slug: 'moving' })).json()
    await ctx.app.inject({ method: 'POST', url: `/api/pages/${page.id}/publish`, headers })

    const unconfirmed = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/settings', headers, payload: { pagePrefix: '/p' } })
    expect(unconfirmed.statusCode).toBe(400)
    expect(unconfirmed.json().code).toBe('confirm_page_prefix')

    const clash = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/settings', headers, payload: { pagePrefix: '/s', confirmPagePrefixChange: true } })
    expect(clash.statusCode).toBe(400)
    expect(clash.json().error).toBe('Short links and landing pages need different prefixes')

    const moved = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers,
      payload: { pagePrefix: '/p', confirmPagePrefixChange: true, legacyPagePrefixEnabled: true },
    })
    expect(moved.statusCode).toBe(200)
    expect((await ctx.app.inject({ method: 'GET', url: '/p/moving' })).statusCode).toBe(200)
    expect((await ctx.app.inject({ method: 'GET', url: '/l/moving' })).statusCode).toBe(200)
    expect((await ctx.app.inject({ method: 'GET', url: `/api/pages/${page.id}`, headers })).json().url).toBe('http://127.0.0.1:3000/p/moving')

    await ctx.app.inject({ method: 'PATCH', url: '/api/admin/settings', headers, payload: { legacyPagePrefixEnabled: false } })
    expect((await ctx.app.inject({ method: 'GET', url: '/l/moving' })).statusCode).not.toBe(200)

    const shortClash = await ctx.app.inject({ method: 'PATCH', url: '/api/admin/settings', headers, payload: { shortUrlPrefix: '/p', confirmPrefixChange: true } })
    expect(shortClash.statusCode).toBe(400)
  })

  it('finds pages in global search', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const page = (await createPage(ctx, user.cookie, { title: 'Winter festival', slug: 'winter' })).json()
    const found = await ctx.app.inject({ method: 'GET', url: '/api/search?q=festival', headers: { cookie: user.cookie } })
    expect(found.json().pages).toEqual([{ id: page.id, title: 'Winter festival', slug: 'winter' }])
  })
})

function createPage(ctx: TestContext, cookie: string, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: '/api/pages', headers: { cookie }, payload })
}

function headingContent(text: string): PageContent {
  const heading = createBlock('heading', () => 'h1')
  return { blocks: [{ ...heading, props: { ...heading.props, text } }] }
}

function imageContent(mediaId: string): PageContent {
  const image = createBlock('image', () => 'i1')
  return { blocks: [{ ...image, props: { ...image.props, mediaId } }] }
}

async function uploadImage(ctx: TestContext, cookie: string) {
  const file = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c33' } }).png().toBuffer()
  const boundary = '----sharry-page'
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return ctx.app.inject({ method: 'POST', url: '/api/media', headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })
}
