import { afterEach, describe, expect, it, vi } from 'vitest'
import * as linkStore from '../links.ts'
import { clipPageTitle, isPrivateAddress, pinnedLookup, readPublicPage, slugCandidates, slugify, suggestFreeSlug, titleFromHtml, type PageIo, type PageLookup, type PageRequestInit } from './page-slug.ts'

const html = '<html><head><meta property="og:title" content="Pricing | ipstack"><title>Ignored</title></head></html>'

function io(fetchImpl: PageIo['fetch'], records: { address: string; family: number }[] = [{ address: '93.184.216.34', family: 4 }]): PageIo {
  return { fetch: fetchImpl, lookup: async () => records }
}

describe('page slug', () => {
  it('turns a page title into a slug and falls back to the address', () => {
    expect(slugify('Pricing | ipstack')).toBe('pricing-ipstack')
    expect(slugify('Niederlage für Vucic Serbien nach Wahl')).toBe('niederlage-fur-vucic')
    expect(slugify('Docs')).toBe('')
    expect(slugCandidates('https://ipstack.com/pricing/', 'Docs')).toEqual(['ipstack-pricing'])
    expect(titleFromHtml(html)).toBe('Pricing | ipstack')
  })

  it('refuses a private address without fetching it', async () => {
    const fetchImpl = vi.fn()
    const page = await readPublicPage('http://127.0.0.1/secret', io(fetchImpl, [{ address: '127.0.0.1', family: 4 }]))
    expect(page).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(isPrivateAddress('10.1.1.1')).toBe(true)
    expect(isPrivateAddress('100.100.100.200')).toBe(true)
    expect(isPrivateAddress('100.63.0.1')).toBe(false)
    expect(isPrivateAddress('192.0.0.8')).toBe(true)
    expect(isPrivateAddress('192.0.2.1')).toBe(false)
    expect(isPrivateAddress('198.18.0.1')).toBe(true)
    expect(isPrivateAddress('198.19.255.1')).toBe(true)
    expect(isPrivateAddress('224.0.0.1')).toBe(true)
    expect(isPrivateAddress('240.0.0.1')).toBe(true)
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true)
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateAddress('0:0:0:0:0:ffff:7f00:1')).toBe(true)
    expect(isPrivateAddress('::ffff:a9fe:a9fe')).toBe(true)
    expect(isPrivateAddress('::ffff:5db8:d822')).toBe(false)
    expect(isPrivateAddress('ff02::1')).toBe(true)
    expect(isPrivateAddress('93.184.216.34')).toBe(false)
  })

  it('pins the fetch to the addresses that were checked', async () => {
    const checked: PageLookup[] = [{ address: '93.184.216.34', family: 4 }]
    const pinned = await new Promise<PageLookup[] | string>((resolve, reject) => {
      pinnedLookup(checked)('127.0.0.1', { all: true }, (error, addresses) => {
        if (error) reject(error)
        else resolve(addresses)
      })
    })
    expect(pinned).toEqual(checked)
    await expect(new Promise((_resolve, reject) => {
      pinnedLookup([{ address: '127.0.0.1', family: 4 }])('public.example', { all: true }, (error) => {
        reject(error ?? new Error('missing error'))
      })
    })).rejects.toThrow('Address is not public')

    const fetchImpl = vi.fn(async (_input: Parameters<PageIo['fetch']>[0], _init?: PageRequestInit) => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
    const page = await readPublicPage('https://ipstack.com/pricing/', io(fetchImpl, checked))
    expect(page?.title).toBe('Pricing | ipstack')
    expect(fetchImpl.mock.calls[0]?.[1]?.dispatcher).toBeTruthy()
  })

  it('reads the title from a public page', async () => {
    const fetchImpl = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
    const page = await readPublicPage('https://ipstack.com/pricing/', io(fetchImpl))
    expect(page?.title).toBe('Pricing | ipstack')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns a clipped title and keeps the slug of the link being edited', async () => {
    const long = `${'Pricing '.repeat(40)}ipstack`
    expect(clipPageTitle(long)).toHaveLength(200)
    const taken = vi.spyOn(linkStore, 'findBySlug').mockImplementation(async (_db, slug) => {
      if (slug === 'pricing-ipstack') return { id: 'link-1' } as Awaited<ReturnType<typeof linkStore.findBySlug>>
      if (slug === 'ipstack-pricing') return { id: 'other' } as Awaited<ReturnType<typeof linkStore.findBySlug>>
      return undefined
    })
    const fetchImpl = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
    const own = await suggestFreeSlug({} as never, 'https://ipstack.com/pricing/', { io: io(fetchImpl), exceptLinkId: 'link-1' })
    expect(own).toEqual({ slug: 'pricing-ipstack', title: 'Pricing | ipstack', fromTitle: true })
    const blocked = await suggestFreeSlug({} as never, 'https://ipstack.com/pricing/', { io: io(fetchImpl) })
    expect(blocked).toEqual({ slug: null, title: 'Pricing | ipstack', fromTitle: false })
    const wide = await suggestFreeSlug({} as never, 'https://ipstack.com/pricing/', {
      io: io(vi.fn(async () => new Response(`<title>${long}</title>`, { status: 200, headers: { 'content-type': 'text/html' } }))),
    })
    expect(wide?.title).toBe(clipPageTitle(long))
    expect(wide?.slug).toBe('pricing-pricing-pricing')
    taken.mockRestore()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
