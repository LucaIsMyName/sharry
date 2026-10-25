import dns from 'node:dns/promises'
import os from 'node:os'
import { and, desc, eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { redirectDomains, type Database, type RedirectDomainRecord } from '@sharry/database'
import {
  appSlug,
  createRedirectDomainSchema,
  deploymentHostname,
  normalizeHostname,
  redirectChallengeName,
  redirectHostnameError,
  txtRecordMatches,
} from '@sharry/shared'
import { requireAdmin, requireUser } from './auth.ts'
import { writeAudit } from './audit.ts'
import { AppError, isUniqueViolation, parseBody, randomToken } from './support.ts'

const TXT_MISSING = 'The TXT record was not found. Publish the record from the setup dialog, then try again.'
const TXT_LOOKUP_FAILED = 'Could not look up the TXT record. Try again.'

export type DnsLookup = {
  resolveTxt(hostname: string): Promise<string[][]>
}

export type NetworkInterfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>

let dnsLookup: DnsLookup = dns
let readInterfaces = (): NetworkInterfaces => os.networkInterfaces()

export function setDnsLookup(next: DnsLookup): void {
  dnsLookup = next
}

export function resetDnsLookup(): void {
  dnsLookup = dns
}

export function setNetworkInterfaces(next: NetworkInterfaces): void {
  readInterfaces = () => next
}

export function resetNetworkInterfaces(): void {
  readInterfaces = () => os.networkInterfaces()
}

let verifiedHostCache: Set<string> | null = null

export function invalidateRedirectHosts(): void {
  verifiedHostCache = null
}

export async function isVerifiedRedirectHost(db: Database, hostname: string): Promise<boolean> {
  const hosts = await verifiedHostSet(db)
  return hosts.has(normalizeHostname(hostname))
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

export function registerRedirectDomainRoutes(app: FastifyInstance): void {
  /**
   * List verified redirect domains for the link form.
   * @route GET /api/redirect-domains
   * @tag Domains
   * @auth api-key or session
   * @response 200 { domains: RedirectDomain[] }
   */
  app.get('/api/redirect-domains', async (request) => {
    await requireUser(app, request, ['full'])
    const rows = await app.db
      .select({ id: redirectDomains.id, hostname: redirectDomains.hostname })
      .from(redirectDomains)
      .where(eq(redirectDomains.status, 'verified'))
      .orderBy(desc(redirectDomains.verifiedAt))
    return { domains: rows }
  })

  /**
   * List redirect domains and the IPv4 addresses for their A records.
   * @route GET /api/admin/redirect-domains
   * @tag Domains
   * @auth admin api-key or admin session
   * @response 200 { domains: RedirectDomain[], serverAddresses: string[] }
   */
  app.get('/api/admin/redirect-domains', async (request) => {
    await requireAdmin(app, request)
    const rows = await app.db.select().from(redirectDomains).orderBy(desc(redirectDomains.createdAt))
    return { domains: rows.map((domain) => publicDomain(domain, app.env.APP_NAME)), serverAddresses: lookupServerAddresses() }
  })

  /**
   * Add a redirect domain and return the TXT record plus the server IPv4 addresses.
   * @route POST /api/admin/redirect-domains
   * @tag Domains
   * @auth admin api-key or admin session
   * @body JSON { hostname }
   * @response 200 { domain: RedirectDomain, serverAddresses: string[] }
   * @response 409 That domain is already added
   */
  app.post('/api/admin/redirect-domains', async (request) => {
    const actor = await requireAdmin(app, request)
    const body = parseBody(createRedirectDomainSchema, request.body)
    const hostname = normalizeHostname(body.hostname)
    const error = redirectHostnameError(hostname, deploymentHosts(app))
    if (error) throw new AppError(400, error, 'validation')
    try {
      const [created] = await app.db
        .insert(redirectDomains)
        .values({ hostname, txtToken: randomToken(24), status: 'pending' })
        .returning()
      if (!created) throw new AppError(500, 'Could not add the domain')
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'redirect_domain.created',
        entityType: 'redirect_domain',
        entityId: created.id,
        metadata: { hostname: created.hostname },
      })
      return { domain: publicDomain(created, app.env.APP_NAME), serverAddresses: lookupServerAddresses() }
    } catch (caught) {
      if (isUniqueViolation(caught)) throw new AppError(409, 'That domain is already added')
      throw caught
    }
  })

  /**
   * Check the TXT record and mark the domain verified when it matches.
   * @route POST /api/admin/redirect-domains/:id/verify
   * @tag Domains
   * @auth admin api-key or admin session
   * @param id string Domain id
   * @response 200 RedirectDomain
   * @response 400 The TXT record was not found
   */
  app.post('/api/admin/redirect-domains/:id/verify', async (request) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const current = await findDomain(app.db, id)
    const checkedAt = new Date()
    try {
      const records = await dnsLookup.resolveTxt(redirectChallengeName(current.hostname, appSlug(app.env.APP_NAME)))
      if (!txtRecordMatches(records, current.txtToken)) {
        await markCheck(app.db, current.id, { status: 'pending', lastError: TXT_MISSING, verifiedAt: null, lastCheckedAt: checkedAt })
        invalidateRedirectHosts()
        throw new AppError(400, TXT_MISSING, 'txt_missing')
      }
    } catch (caught) {
      if (caught instanceof AppError) throw caught
      const message = txtLookupMessage(caught)
      await markCheck(app.db, current.id, { status: 'pending', lastError: message, verifiedAt: null, lastCheckedAt: checkedAt })
      invalidateRedirectHosts()
      throw new AppError(400, message, 'txt_lookup')
    }
    const [updated] = await markCheck(app.db, current.id, {
      status: 'verified',
      lastError: null,
      verifiedAt: current.verifiedAt ?? checkedAt,
      lastCheckedAt: checkedAt,
    })
    invalidateRedirectHosts()
    if (!current.verifiedAt) {
      await writeAudit(app.db, {
        actorUserId: actor.id,
        action: 'redirect_domain.verified',
        entityType: 'redirect_domain',
        entityId: current.id,
        metadata: { hostname: current.hostname },
      })
    }
    return publicDomain(updated ?? current, app.env.APP_NAME)
  })

  /**
   * Remove a redirect domain. Links that used it fall back to the deployment domain.
   * @route DELETE /api/admin/redirect-domains/:id
   * @tag Domains
   * @auth admin api-key or admin session
   * @param id string Domain id
   * @response 204 Empty
   */
  app.delete('/api/admin/redirect-domains/:id', async (request, reply) => {
    const actor = await requireAdmin(app, request)
    const { id } = request.params as { id: string }
    const current = await findDomain(app.db, id)
    await app.db.delete(redirectDomains).where(eq(redirectDomains.id, current.id))
    invalidateRedirectHosts()
    await writeAudit(app.db, {
      actorUserId: actor.id,
      action: 'redirect_domain.deleted',
      entityType: 'redirect_domain',
      entityId: current.id,
      metadata: { hostname: current.hostname },
    })
    return reply.code(204).send()
  })

  /**
   * Allow Caddy to issue a certificate for a verified redirect domain.
   * @route GET /internal/caddy/ask
   * @tag Domains
   * @auth loopback
   * @query domain string Hostname requesting a certificate
   * @response 200 { ok: true }
   * @response 404 Not found
   */
  app.get('/internal/caddy/ask', async (request, reply) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) return reply.code(404).send({ ok: false })
    const domain = typeof (request.query as { domain?: unknown }).domain === 'string' ? (request.query as { domain: string }).domain : ''
    const hostname = normalizeHostname(domain)
    if (!hostname || !(await isVerifiedRedirectHost(app.db, hostname))) return reply.code(404).send({ ok: false })
    return { ok: true }
  })
}

export function lookupServerAddresses(): string[] {
  return publicIpv4Addresses(readInterfaces())
}

export function publicIpv4Addresses(interfaces: NetworkInterfaces): string[] {
  const found: string[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      const family = entry.family as string | number
      if (family !== 'IPv4' && family !== 4) continue
      if (!isPublicIpv4(entry.address)) continue
      found.push(entry.address)
    }
  }
  return [...new Set(found)]
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false
  const numbers = parts.map((part) => Number(part))
  const a = numbers[0]
  const b = numbers[1]
  if (a === undefined || b === undefined || numbers.some((part) => part > 255)) return false
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 169 && b === 254) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  return true
}

function deploymentHosts(app: FastifyInstance): string[] {
  return [deploymentHostname(app.env.SHORT_URL_BASE), deploymentHostname(app.env.APP_URL)].filter(Boolean)
}

function publicDomain(domain: RedirectDomainRecord, appName: string) {
  return {
    id: domain.id,
    hostname: domain.hostname,
    status: domain.status,
    txtName: redirectChallengeName(domain.hostname, appSlug(appName)),
    txtValue: domain.txtToken,
    lastError: domain.lastError,
    verifiedAt: domain.verifiedAt?.toISOString() ?? null,
    createdAt: domain.createdAt.toISOString(),
  }
}

async function findDomain(db: Database, id: string): Promise<RedirectDomainRecord> {
  const found = await db.select().from(redirectDomains).where(eq(redirectDomains.id, id)).limit(1)
  const domain = found[0]
  if (!domain) throw new AppError(404, 'Domain not found')
  return domain
}

async function markCheck(
  db: Database,
  id: string,
  patch: { status: 'pending' | 'verified'; lastError: string | null; verifiedAt: Date | null; lastCheckedAt: Date },
): Promise<RedirectDomainRecord[]> {
  return db
    .update(redirectDomains)
    .set({ ...patch, updatedAt: patch.lastCheckedAt })
    .where(eq(redirectDomains.id, id))
    .returning()
}

function txtLookupMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''
  if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ENOTIMP') return TXT_MISSING
  return TXT_LOOKUP_FAILED
}

async function verifiedHostSet(db: Database): Promise<Set<string>> {
  if (verifiedHostCache) return verifiedHostCache
  const rows = await db
    .select({ hostname: redirectDomains.hostname })
    .from(redirectDomains)
    .where(eq(redirectDomains.status, 'verified'))
  verifiedHostCache = new Set(rows.map((row) => row.hostname))
  return verifiedHostCache
}

export async function requireVerifiedDomain(db: Database, id: string | null | undefined): Promise<string | null> {
  if (id == null) return null
  const found = await db
    .select({ id: redirectDomains.id })
    .from(redirectDomains)
    .where(and(eq(redirectDomains.id, id), eq(redirectDomains.status, 'verified')))
    .limit(1)
  if (!found[0]) throw new AppError(400, 'Choose a verified redirect domain', 'redirect_domain')
  return found[0].id
}

export function requestHostname(request: FastifyRequest): string {
  return normalizeHostname(request.hostname)
}
