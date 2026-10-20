import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { qrCodes, trackingConfigs, trackingVariants, type LinkRecord } from '@sharry/database'
import { applyUtm, cleanUtm, mergeUtm, validatePrefix, type UtmParams } from '@sharry/shared'
import { recordClick, type ClickDraft } from './analytics.ts'
import { lookupGeo } from './geo.ts'
import { findBySlug } from './links.ts'
import { verifyPassword } from './passwords.ts'
import { getSettings } from './settings-store.ts'
import { anonymousVisitorId, escapeHtml, parseUserAgent, referrerHost } from './support.ts'
import { variantUtm } from './tracking.ts'

const UNLOCK_COOKIE = 'sharry_unlock'

export async function tryShortLink(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const url = new URL(request.url, 'http://localhost')
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 2) return false
  const prefix = `/${segments[0]}`
  const slug = decodeURIComponent(segments[1] ?? '')
  if (validatePrefix(prefix)) return false
  const settings = await getSettings(app.db, app.env)
  const active = prefix === settings.shortUrlPrefix
  const legacy = settings.legacyPrefixEnabled && settings.legacyPrefixes.includes(prefix)
  if (!active && !legacy) return false
  const link = await findBySlug(app.db, slug)
  if (!link || link.status !== 'active') {
    reply.code(404).type('text/plain').send('Not found')
    return true
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    reply.code(410).type('text/plain').send('This link has expired')
    return true
  }
  let justUnlocked = false
  if (link.passwordHash && !unlockValid(request.cookies[UNLOCK_COOKIE], link.id, app.env.SESSION_SECRET)) {
    if (request.method === 'POST') {
      if (!allowLinkPasswordAttempt(request.ip)) {
        reply.code(429).header('cache-control', 'no-store').type('text/html').send(passwordPage(slug, prefix, 'limited'))
        return true
      }
      const password = typeof request.body === 'object' && request.body && 'password' in request.body
        ? String((request.body as { password?: string }).password ?? '')
        : ''
      const ok = password ? await verifyPassword(link.passwordHash, password) : false
      if (!ok) {
        reply.code(401).header('cache-control', 'no-store').type('text/html').send(passwordPage(slug, prefix, 'failed'))
        return true
      }
      reply.setCookie(UNLOCK_COOKIE, signUnlock(link.id, app.env.SESSION_SECRET), {
        httpOnly: true,
        secure: app.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 15 * 60,
      })
      justUnlocked = true
    } else {
      reply.code(200).header('cache-control', 'no-store').type('text/html').send(passwordPage(slug, prefix, 'prompt'))
      return true
    }
  }
  if (request.method === 'POST' && !link.passwordHash) {
    reply.code(404).type('text/plain').send('Not found')
    return true
  }
  const destination = await buildDestination(app, link, url.searchParams)
  if (request.method === 'GET' || justUnlocked) {
    const draft = await clickDraft(app, request, link, destination)
    reply.recordClick = draft
    rememberClick(reply, draft)
  }
  reply.code(redirectStatus(link.redirectType, request.method === 'POST'))
  reply.header('cache-control', 'no-store')
  reply.header('location', destination.url).send()
  return true
}

type ResolvedDestination = {
  url: string
  utm: UtmParams
  qrCodeId: string | null
  trackingVariantId: string | null
}

async function buildDestination(app: FastifyInstance, link: LinkRecord, query: URLSearchParams): Promise<ResolvedDestination> {
  const configs = await app.db.select().from(trackingConfigs).where(eq(trackingConfigs.linkId, link.id)).limit(1)
  const base = cleanUtm({
    utm_source: configs[0]?.utmSource,
    utm_medium: configs[0]?.utmMedium,
    utm_campaign: configs[0]?.utmCampaign,
    utm_id: configs[0]?.utmId,
    utm_term: configs[0]?.utmTerm,
    utm_content: configs[0]?.utmContent,
  })
  const tracking = await resolveTracking(app, link.id, query)
  const utm = mergeUtm(base, tracking.variant ? variantUtm(tracking.variant) : {})
  return {
    url: applyUtm(link.destinationUrl, utm),
    utm,
    qrCodeId: tracking.qrCodeId,
    trackingVariantId: tracking.variant?.id ?? null,
  }
}

async function resolveTracking(app: FastifyInstance, linkId: string, query: URLSearchParams) {
  const qrId = query.get('qr')
  if (qrId && isUuid(qrId)) {
    const found = await app.db.select().from(qrCodes).where(eq(qrCodes.id, qrId)).limit(1)
    const qr = found[0]
    if (qr && qr.linkId === linkId) {
      return { qrCodeId: qr.id, variant: await variantOwnedByLink(app, linkId, qr.trackingVariantId) }
    }
  }
  return { qrCodeId: null, variant: await variantOwnedByLink(app, linkId, query.get('v')) }
}

async function variantOwnedByLink(app: FastifyInstance, linkId: string, variantId: string | null) {
  if (!variantId || !isUuid(variantId)) return null
  const found = await app.db
    .select()
    .from(trackingVariants)
    .where(and(eq(trackingVariants.id, variantId), eq(trackingVariants.linkId, linkId)))
    .limit(1)
  return found[0] ?? null
}

async function clickDraft(
  app: FastifyInstance,
  request: FastifyRequest,
  link: LinkRecord,
  destination: ResolvedDestination,
): Promise<ClickDraft> {
  const userAgent = request.headers['user-agent']
  const parsed = parseUserAgent(typeof userAgent === 'string' ? userAgent : undefined)
  const geo = await lookupGeo(request.ip, app.env.GEOIP_DB_PATH)
  const { utm } = destination
  return {
    linkId: link.id,
    trackingVariantId: destination.trackingVariantId,
    qrCodeId: destination.qrCodeId,
    referrer: referrerHost(typeof request.headers.referer === 'string' ? request.headers.referer : undefined),
    countryCode: geo.countryCode,
    region: geo.region,
    browser: parsed.browser,
    operatingSystem: parsed.operatingSystem,
    deviceType: parsed.deviceType,
    isBot: parsed.isBot,
    anonymousVisitorId: anonymousVisitorId(request.ip, typeof userAgent === 'string' ? userAgent : '', app.env.ENCRYPTION_KEY),
    utmSource: utm.utm_source ?? null,
    utmMedium: utm.utm_medium ?? null,
    utmCampaign: utm.utm_campaign ?? null,
    utmId: utm.utm_id ?? null,
    utmTerm: utm.utm_term ?? null,
    utmContent: utm.utm_content ?? null,
  }
}

export function sendSpa(reply: FastifyReply, nodeEnv: string): void {
  const indexPath = path.resolve(process.cwd(), 'apps/web/dist/index.html')
  if (nodeEnv === 'test' || !fs.existsSync(indexPath)) {
    reply.code(404).send({ error: 'Not found' })
    return
  }
  reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'))
}

function passwordPage(slug: string, prefix: string, state: 'prompt' | 'failed' | 'limited'): string {
  const action = `${prefix}/${encodeURIComponent(slug)}`
  const error =
    state === 'failed'
      ? 'That password is incorrect.'
      : state === 'limited'
        ? 'Too many attempts. Try again shortly.'
        : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Password required · Sharry</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top left, rgba(19, 17, 155, 0.14), transparent 32%), #f8f8f8; color: #131313; font-family: ui-sans-serif, system-ui, sans-serif; }
    form { width: min(28rem, 100%); display: grid; gap: 12px; background: #fff; border: 1px solid #e4e4e4; border-radius: 12px; padding: 16px; }
    .wordmark { margin: 0; font-size: 2.25rem; font-weight: 500; letter-spacing: -0.025em; }
    h1 { margin: 0; font-size: 1.5rem; font-weight: 500; }
    p { margin: 0; color: #5c5c5c; font-size: 0.875rem; line-height: 1.6; }
    .error { color: #9f2d2d; }
    label { font-size: 0.875rem; font-weight: 500; }
    input { width: 100%; box-sizing: border-box; height: 40px; border: 1px solid #d4d4d4; border-radius: 6px; padding: 0 12px; background: #fff; color: inherit; font: inherit; font-size: 0.875rem; }
    button { justify-self: start; height: 40px; border: 0; border-radius: 6px; padding: 0 16px; background: #13119b; color: #f4f4f4; font: inherit; font-size: 0.875rem; font-weight: 500; }
  </style>
</head>
<body>
  <form method="post" action="${escapeHtml(action)}">
    <p class="wordmark">sharry</p>
    <h1>Password</h1>
    <p>This short link is password protected.</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <label for="link-password">Password</label>
    <input id="link-password" type="password" name="password" autocomplete="current-password" required autofocus/>
    <button type="submit">Continue</button>
  </form>
</body>
</html>`
}

function signUnlock(linkId: string, secret: string): string {
  const exp = Date.now() + 15 * 60 * 1000
  const body = `${linkId}.${exp}`
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

function unlockValid(token: string | undefined, linkId: string, secret: string): boolean {
  if (!token) return false
  const [id, expRaw, sig] = token.split('.')
  if (!id || !expRaw || !sig || id !== linkId) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${expRaw}`).digest('base64url')
  const left = Buffer.from(sig)
  const right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

const PASSWORD_WINDOW_MS = 60_000
const PASSWORD_MAX_ATTEMPTS = 10
const passwordAttempts = new Map<string, number[]>()

export function clearLinkPasswordAttempts(): void {
  passwordAttempts.clear()
}

function allowLinkPasswordAttempt(ip: string): boolean {
  const now = Date.now()
  const recent = (passwordAttempts.get(ip) ?? []).filter((time) => now - time < PASSWORD_WINDOW_MS)
  if (recent.length >= PASSWORD_MAX_ATTEMPTS) {
    passwordAttempts.set(ip, recent)
    return false
  }
  recent.push(now)
  passwordAttempts.set(ip, recent)
  return true
}

function redirectStatus(redirectType: string, forceGet: boolean): number {
  if (forceGet) return 303
  const status = Number(redirectType)
  return status === 301 || status === 302 || status === 307 || status === 308 ? status : 302
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

const pendingClicks = new WeakMap<FastifyReply, ClickDraft>()

export function rememberClick(reply: FastifyReply, draft: ClickDraft): void {
  pendingClicks.set(reply, draft)
}

export async function recordPendingClick(app: FastifyInstance, reply: FastifyReply): Promise<void> {
  const draft = pendingClicks.get(reply) ?? reply.recordClick
  if (!draft) return
  pendingClicks.delete(reply)
  try {
    await recordClick(app.db, draft)
  } catch (error) {
    app.log.error({ err: error }, 'Failed to record click')
  }
}
