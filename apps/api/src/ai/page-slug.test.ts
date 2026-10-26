import { describe, expect, it, vi } from 'vitest'
import { isPrivateAddress, readPublicPage, slugCandidates, slugify, titleFromHtml, type PageIo } from './page-slug.ts'

const html = '<html><head><meta property="og:title" content="Pricing | ipstack"><title>Ignored</title></head></html>'

function io(fetchImpl: PageIo['fetch'], records: { address: string; family: number }[] = [{ address: '93.184.216.34', family: 4 }]): PageIo {
  return { fetch: fetchImpl, lookup: async () => records }
}

describe('page slug', () => {
  it('turns a page title into a slug and falls back to the address', () => {
    expect(slugify('Pricing | ipstack')).toBe('pricing-ipstack')
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
    expect(isPrivateAddress('93.184.216.34')).toBe(false)
  })

  it('reads the title from a public page', async () => {
    const fetchImpl = vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }))
    const page = await readPublicPage('https://ipstack.com/pricing/', io(fetchImpl))
    expect(page?.title).toBe('Pricing | ipstack')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
