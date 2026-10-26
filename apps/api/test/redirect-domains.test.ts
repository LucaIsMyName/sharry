import type os from 'node:os'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultQrStyle } from '@sharry/shared'
import { appSlug, redirectChallengeName } from '@sharry/shared'
import { publicIpv4Addresses, recheckVerifiedDomains, resetDnsLookup, resetNetworkInterfaces, setDnsLookup, setNetworkInterfaces, type DnsLookup } from '../src/redirect-domains.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

function ipv4(address: string, internal = false): os.NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: `${address}/24` }
}

describe('redirect domains', () => {
  useTestApp()
  const txt = new Map<string, string[][]>()

  beforeEach(() => {
    txt.clear()
    setDnsLookup(lookup())
    setNetworkInterfaces({ eth0: [ipv4('203.0.113.10'), ipv4('10.0.0.5'), ipv4('127.0.0.1', true)] })
  })

  afterEach(() => {
    resetDnsLookup()
    resetNetworkInterfaces()
  })

  function lookup(): DnsLookup {
    return {
      async resolveTxt(hostname) {
        if (!txt.has(hostname)) {
          const error = new Error('not found') as NodeJS.ErrnoException
          error.code = 'ENOTFOUND'
          throw error
        }
        return txt.get(hostname) ?? []
      },
    }
  }

  it('lets an admin verify a domain and keeps it off the list until then', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const denied = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: user.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    expect(denied.statusCode).toBe(404)

    const invalid = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'https://go.brand.com/path' },
    })
    expect(invalid.statusCode).toBe(400)

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'Go.Brand.com' },
    })
    expect(created.statusCode).toBe(200)
    const domain = created.json().domain as { id: string; hostname: string; txtName: string; txtValue: string; status: string }
    expect(domain.hostname).toBe('go.brand.com')
    expect(domain.status).toBe('pending')
    expect(domain.txtName).toBe(redirectChallengeName('go.brand.com', appSlug(ctx.env.APP_NAME)))
    expect(domain.txtValue.length).toBeGreaterThan(10)
    expect(created.json().serverAddresses).toEqual(['203.0.113.10'])

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    expect(duplicate.statusCode).toBe(409)

    const hidden = await ctx.app.inject({ method: 'GET', url: '/api/redirect-domains', headers: { cookie: user.cookie } })
    expect(hidden.statusCode).toBe(200)
    expect(hidden.json().domains).toEqual([])

    const missing = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })
    expect(missing.statusCode).toBe(400)
    expect(missing.json().error).toMatch(/TXT record/)

    txt.set(domain.txtName, [['not-the-token']])
    const mismatch = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })
    expect(mismatch.statusCode).toBe(400)

    txt.set(domain.txtName, [[domain.txtValue.slice(0, 4), domain.txtValue.slice(4)]])
    const verified = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })
    expect(verified.statusCode).toBe(200)
    expect(verified.json().status).toBe('verified')

    const listed = await ctx.app.inject({ method: 'GET', url: '/api/redirect-domains', headers: { cookie: user.cookie } })
    expect(listed.json().domains).toEqual([{ id: domain.id, hostname: 'go.brand.com' }])
  })

  it('stores the chosen domain on a link and falls back after it is deleted', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    const domain = created.json().domain as { id: string; txtName: string; txtValue: string }
    const pendingLink = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/one', slug: 'pending-link', redirectDomainId: domain.id },
    })
    expect(pendingLink.statusCode).toBe(400)

    txt.set(domain.txtName, [[domain.txtValue]])
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })

    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/one', slug: 'summer', redirectDomainId: domain.id },
    })
    expect(link.statusCode).toBe(200)
    expect(link.json().shortUrl).toBe('https://go.brand.com/s/summer')
    expect(link.json().redirectDomainId).toBe(domain.id)

    const qr = await ctx.app.inject({
      method: 'POST',
      url: '/api/qr',
      headers: { cookie: user.cookie },
      payload: { linkId: link.json().id, name: 'Poster', style: defaultQrStyle },
    })
    expect(qr.statusCode).toBe(200)
    expect(String(qr.json().url)).toContain('https://go.brand.com/s/summer')

    const csv = await ctx.app.inject({ method: 'GET', url: '/api/admin/export/links.csv', headers: { cookie: admin.cookie } })
    expect(csv.body).toContain('https://go.brand.com/s/summer')

    const cleared = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${link.json().id}`,
      headers: { cookie: user.cookie },
      payload: { redirectDomainId: null },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json().shortUrl).toBe('http://127.0.0.1:3000/s/summer')
    expect(cleared.json().redirectDomainId).toBeNull()

    const restored = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/links/${link.json().id}`,
      headers: { cookie: user.cookie },
      payload: { redirectDomainId: domain.id },
    })
    expect(restored.json().shortUrl).toBe('https://go.brand.com/s/summer')

    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/admin/redirect-domains/${domain.id}`,
      headers: { cookie: admin.cookie },
    })
    expect(removed.statusCode).toBe(204)
    const fallback = await ctx.app.inject({
      method: 'GET',
      url: `/api/links/${link.json().id}`,
      headers: { cookie: user.cookie },
    })
    expect(fallback.json().shortUrl).toBe('http://127.0.0.1:3000/s/summer')
    expect(fallback.json().redirectDomainId).toBeNull()
  })

  it('keeps only this server’s public IPv4 addresses', () => {
    expect(publicIpv4Addresses({
      eth0: [
        ipv4('203.0.113.10'),
        ipv4('10.0.0.1'),
        ipv4('172.16.0.1'),
        ipv4('192.168.0.1'),
        ipv4('100.64.0.1'),
        ipv4('169.254.1.1'),
        ipv4('127.0.0.1', true),
        { address: '2001:db8::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:00:00:00:00:00', internal: false, cidr: '2001:db8::1/64', scopeid: 0 },
      ],
    })).toEqual(['203.0.113.10'])
  })

  it('returns an empty address list when the server has only private addresses', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    setNetworkInterfaces({ eth0: [ipv4('10.1.2.3'), ipv4('192.168.1.20'), ipv4('172.16.0.4')] })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    expect(created.statusCode).toBe(200)
    expect(created.json().domain.status).toBe('pending')
    expect(created.json().serverAddresses).toEqual([])
  })

  it('keeps a verified domain through a lookup timeout and drops it after repeated TXT mismatches', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    const domain = created.json().domain as { id: string; txtName: string; txtValue: string }
    txt.set(domain.txtName, [[domain.txtValue]])
    const verified = await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })
    expect(verified.statusCode).toBe(200)

    setDnsLookup({
      async resolveTxt() {
        const error = new Error('timeout') as NodeJS.ErrnoException
        error.code = 'ETIMEOUT'
        throw error
      },
    })
    await recheckVerifiedDomains(ctx.db, ctx.env.APP_NAME)
    expect(await domainRow(ctx.app, admin.cookie)).toMatchObject({
      status: 'verified',
      lastError: 'Could not look up the TXT record. Try again.',
    })
    expect((await ctx.app.inject({ method: 'GET', url: '/internal/caddy/ask?domain=go.brand.com' })).statusCode).toBe(200)

    setDnsLookup({
      async resolveTxt() {
        const error = new Error('not found') as NodeJS.ErrnoException
        error.code = 'ENOTFOUND'
        throw error
      },
    })
    await recheckVerifiedDomains(ctx.db, ctx.env.APP_NAME)
    expect((await domainRow(ctx.app, admin.cookie)).status).toBe('verified')
    txt.set(domain.txtName, [[domain.txtValue]])
    setDnsLookup(lookup())
    await recheckVerifiedDomains(ctx.db, ctx.env.APP_NAME)
    expect(await domainRow(ctx.app, admin.cookie)).toMatchObject({ status: 'verified', lastError: null })

    setDnsLookup({
      async resolveTxt() {
        const error = new Error('not found') as NodeJS.ErrnoException
        error.code = 'ENOTFOUND'
        throw error
      },
    })
    await recheckVerifiedDomains(ctx.db, ctx.env.APP_NAME)
    expect((await domainRow(ctx.app, admin.cookie)).status).toBe('verified')
    await recheckVerifiedDomains(ctx.db, ctx.env.APP_NAME)
    expect((await domainRow(ctx.app, admin.cookie)).status).toBe('pending')
    expect((await ctx.app.inject({ method: 'GET', url: '/internal/caddy/ask?domain=go.brand.com' })).statusCode).toBe(404)
  })

  it('answers the certificate ask from loopback for verified domains only', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    const domain = created.json().domain as { id: string; txtName: string; txtValue: string }
    const early = await ctx.app.inject({ method: 'GET', url: '/internal/caddy/ask?domain=go.brand.com' })
    expect(early.statusCode).toBe(404)

    txt.set(domain.txtName, [[domain.txtValue]])
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })

    const allowed = await ctx.app.inject({ method: 'GET', url: '/internal/caddy/ask?domain=Go.Brand.com' })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json()).toEqual({ ok: true })
    const remote = await ctx.app.inject({
      method: 'GET',
      url: '/internal/caddy/ask?domain=go.brand.com',
      remoteAddress: '198.51.100.8',
    })
    expect(remote.statusCode).toBe(404)
    const proxied = await ctx.app.inject({
      method: 'GET',
      url: '/internal/caddy/ask?domain=go.brand.com',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.8' },
    })
    expect(proxied.statusCode).toBe(404)
    const unknown = await ctx.app.inject({ method: 'GET', url: '/internal/caddy/ask?domain=other.example' })
    expect(unknown.statusCode).toBe(404)
  })

  it('serves short links on a custom host and keeps the dashboard on the deployment host', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/redirect-domains',
      headers: { cookie: admin.cookie },
      payload: { hostname: 'go.brand.com' },
    })
    const domain = created.json().domain as { id: string; txtName: string; txtValue: string }
    txt.set(domain.txtName, [[domain.txtValue]])
    await ctx.app.inject({
      method: 'POST',
      url: `/api/admin/redirect-domains/${domain.id}/verify`,
      headers: { cookie: admin.cookie },
    })
    await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/one', slug: 'summer', redirectDomainId: domain.id },
    })

    const customLink = await ctx.app.inject({ method: 'GET', url: '/s/summer', headers: { host: 'go.brand.com' } })
    expect(customLink.statusCode).toBe(302)
    expect(customLink.headers.location).toBe('https://example.com/one')
    const deploymentLink = await ctx.app.inject({ method: 'GET', url: '/s/summer', headers: { host: '127.0.0.1:3000' } })
    expect(deploymentLink.statusCode).toBe(302)

    const customRoot = await ctx.app.inject({ method: 'GET', url: '/', headers: { host: 'go.brand.com' } })
    const customLogin = await ctx.app.inject({ method: 'GET', url: '/login', headers: { host: 'go.brand.com' } })
    expect(customRoot.statusCode).toBe(404)
    expect(customRoot.headers['content-type']).toContain('text/plain')
    expect(customLogin.statusCode).toBe(404)
    expect(customLogin.headers['content-type']).toContain('text/plain')

    const dashboard = await ctx.app.inject({ method: 'GET', url: '/', headers: { host: '127.0.0.1:3000' } })
    expect(dashboard.headers['content-type']).toContain('application/json')
    const health = await ctx.app.inject({ method: 'GET', url: '/health', headers: { host: '127.0.0.1:3000' } })
    expect(health.statusCode).toBe(200)
    const customHealth = await ctx.app.inject({ method: 'GET', url: '/health', headers: { host: 'go.brand.com' } })
    expect(customHealth.statusCode).toBe(404)
    expect(customHealth.headers['content-type']).toContain('text/plain')
  })
})

async function domainRow(app: FastifyInstance, cookie: string): Promise<{ hostname: string; status: string; lastError: string | null }> {
  const listed = await app.inject({ method: 'GET', url: '/api/admin/redirect-domains', headers: { cookie } })
  const domains = listed.json().domains as { hostname: string; status: string; lastError: string | null }[]
  const row = domains.find((domain) => domain.hostname === 'go.brand.com')
  if (!row) throw new Error('domain missing')
  return row
}
