import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { clickEvents, type Database } from '@sharry/database'
import { requireUser } from './auth.ts'
import { getLinkForActor } from './links.ts'
import { rowsOf } from './settings-store.ts'
import { AppError } from './support.ts'

export type ClickDraft = {
  linkId: string
  trackingVariantId: string | null
  qrCodeId: string | null
  referrer: string | null
  countryCode: string | null
  region: string | null
  browser: string
  operatingSystem: string
  deviceType: string
  isBot: boolean
  anonymousVisitorId: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmId: string | null
  utmTerm: string | null
  utmContent: string | null
}

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  app.get('/api/analytics', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const range = parseRange(request.query)
    const filter = { userId: actor.role === 'admin' ? undefined : actor.id }
    const analytics = await loadAnalytics(app.db, filter, range)
    return { ...analytics, links: await loadLinkStats(app.db, filter, range) }
  })

  app.get('/api/links/:id/analytics', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    await getLinkForActor(app.db, actor, id)
    return loadAnalytics(app.db, { linkId: id }, parseRange(request.query))
  })
}

export async function recordClick(db: Database, draft: ClickDraft): Promise<void> {
  await db.insert(clickEvents).values({
    linkId: draft.linkId,
    trackingVariantId: draft.trackingVariantId,
    qrCodeId: draft.qrCodeId,
    referrer: draft.referrer,
    countryCode: draft.countryCode,
    region: draft.region,
    browser: draft.browser,
    operatingSystem: draft.operatingSystem,
    deviceType: draft.deviceType,
    isBot: draft.isBot,
    anonymousVisitorId: draft.anonymousVisitorId,
    utmSource: draft.utmSource,
    utmMedium: draft.utmMedium,
    utmCampaign: draft.utmCampaign,
    utmId: draft.utmId,
    utmTerm: draft.utmTerm,
    utmContent: draft.utmContent,
  })
}

export async function purgeOldClicks(db: Database, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const result = await db.execute(sql`
    delete from click_events
    where occurred_at < now() - make_interval(days => ${retentionDays})
  `)
  return rowCount(result)
}

export async function loadAnalytics(
  db: Database,
  filter: { linkId?: string; userId?: string },
  range: { from: Date; to: Date },
) {
  const where = filterSql(filter, range)
  const totals = rowsOf<{ total: number; unique_visitors: number; bots: number }>(
    await db.execute(sql`
      select count(*)::int as total,
             count(distinct anonymous_visitor_id)::int as unique_visitors,
             count(*) filter (where is_bot)::int as bots
      from click_events
      where ${where}
    `),
  )[0]
  const seriesRows = rowsOf<{ date: string; clicks: number }>(
    await db.execute(sql`
      select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as date,
             count(*)::int as clicks
      from click_events
      where ${where}
      group by 1
      order by 1
    `),
  )
  return {
    totalClicks: totals?.total ?? 0,
    uniqueVisitors: totals?.unique_visitors ?? 0,
    botClicks: totals?.bots ?? 0,
    series: fillSeries(seriesRows, range),
    referrers: await grouped(db, 'referrer', where),
    countries: await grouped(db, 'country_code', where),
    browsers: await grouped(db, 'browser', where),
    operatingSystems: await grouped(db, 'operating_system', where),
    devices: await grouped(db, 'device_type', where),
    campaigns: rowsOf<{ name: string; clicks: number }>(
      await db.execute(sql`
        select coalesce(c.name, 'Direct') as name, count(*)::int as clicks
        from click_events e
        left join tracking_variants v on v.id = e.tracking_variant_id
        left join tracking_campaigns c on c.id = v.campaign_id
        where ${whereAlias(filter, range)}
        group by 1
        order by clicks desc
        limit 12
      `),
    ),
    qrCodes: rowsOf<{ id: string; name: string; clicks: number }>(
      await db.execute(sql`
        select q.id::text as id, q.name, count(*)::int as clicks
        from click_events e
        join qr_codes q on q.id = e.qr_code_id
        where ${whereAlias(filter, range)}
        group by q.id, q.name
        order by clicks desc
        limit 12
      `),
    ),
  }
}

async function loadLinkStats(
  db: Database,
  filter: { userId?: string },
  range: { from: Date; to: Date },
) {
  const owner = filter.userId ? sql`l.user_id = ${filter.userId}` : sql`true`
  const rows = rowsOf<{ id: string; slug: string; title: string | null; clicks: number; unique_visitors: number }>(
    await db.execute(sql`
      select l.id::text as id, l.slug, l.title,
             count(e.id)::int as clicks,
             count(distinct e.anonymous_visitor_id)::int as unique_visitors
      from links l
      left join click_events e
        on e.link_id = l.id
       and e.occurred_at >= ${range.from}
       and e.occurred_at < ${range.to}
      where ${owner}
      group by l.id
      order by clicks desc, l.created_at desc
      limit 200
    `),
  )
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    clicks: row.clicks,
    uniqueVisitors: row.unique_visitors,
  }))
}

function filterSql(filter: { linkId?: string; userId?: string }, range: { from: Date; to: Date }) {
  const parts = [sql`occurred_at >= ${range.from}`, sql`occurred_at < ${range.to}`]
  if (filter.linkId) parts.push(sql`link_id = ${filter.linkId}`)
  if (filter.userId) parts.push(sql`link_id in (select id from links where user_id = ${filter.userId})`)
  return sql.join(parts, sql` and `)
}

function whereAlias(filter: { linkId?: string; userId?: string }, range: { from: Date; to: Date }) {
  const parts = [sql`e.occurred_at >= ${range.from}`, sql`e.occurred_at < ${range.to}`]
  if (filter.linkId) parts.push(sql`e.link_id = ${filter.linkId}`)
  if (filter.userId) parts.push(sql`e.link_id in (select id from links where user_id = ${filter.userId})`)
  return sql.join(parts, sql` and `)
}

async function grouped(db: Database, column: string, where: ReturnType<typeof filterSql>) {
  const rows = rowsOf<{ name: string | null; clicks: number }>(
    await db.execute(sql`
      select ${sql.raw(column)} as name, count(*)::int as clicks
      from click_events
      where ${where}
      group by 1
      order by clicks desc
      limit 8
    `),
  )
  return rows.map((row) => ({ name: row.name || 'Direct', clicks: row.clicks }))
}

function fillSeries(rows: { date: string; clicks: number }[], range: { from: Date; to: Date }) {
  const map = new Map(rows.map((row) => [row.date, row.clicks]))
  const series: { date: string; clicks: number }[] = []
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()))
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()))
  while (cursor <= end && series.length < 400) {
    const date = cursor.toISOString().slice(0, 10)
    series.push({ date, clicks: map.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return series
}

function parseRange(query: unknown): { from: Date; to: Date } {
  const record = typeof query === 'object' && query ? (query as { from?: string; to?: string }) : {}
  const to = parseDay(record.to, new Date())
  const from = parseDay(record.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000))
  if (from >= to) throw new AppError(400, 'The start date must be before the end date')
  return { from, to }
}

function parseDay(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00.000Z`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new AppError(400, 'Invalid date')
  return date
}

function rowCount(result: unknown): number {
  if (typeof result === 'object' && result && 'rowCount' in result && typeof result.rowCount === 'number') {
    return result.rowCount
  }
  return 0
}
