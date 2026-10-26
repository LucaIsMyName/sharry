import { sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { clickEvents, type Database } from '@sharry/database'
import { requireUser } from './auth.ts'
import { getLinkForActor, visibleLinksWhere } from './links.ts'
import { getSettings, rowsOf } from './settings-store.ts'
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
  /**
   * Summarize clicks for the links the caller can see.
   * @route GET /api/analytics
   * @tag Analytics
   * @auth api-key or session
   * @query from string Start day, YYYY-MM-DD, inclusive. Defaults to 30 days before to
   * @query to string End day, YYYY-MM-DD, inclusive. Defaults to now. A date-only value includes that whole UTC day
   * @response 200 totals, daily series, referrer, country, browser, device, and utm breakdowns, plus links
   */
  app.get('/api/analytics', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const range = parseRange(request.query)
    const settings = await getSettings(app.db, app.env)
    const filter = { visibility: visibleLinksWhere(actor, settings, 'links') }
    const analytics = await loadAnalytics(app.db, filter, range)
    return { ...analytics, links: await loadLinkStats(app.db, visibleLinksWhere(actor, settings, 'l'), range) }
  })

  /**
   * Summarize clicks for one short link.
   * @route GET /api/links/:id/analytics
   * @tag Analytics
   * @auth api-key or session
   * @param id string Link id
   * @query from string Start day, YYYY-MM-DD, inclusive
   * @query to string End day, YYYY-MM-DD, inclusive. A date-only value includes that whole UTC day
   * @response 200 totals, daily series, referrer, country, browser, device, and utm breakdowns
   */
  app.get('/api/links/:id/analytics', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const { id } = request.params as { id: string }
    const settings = await getSettings(app.db, app.env)
    await getLinkForActor(app.db, actor, id, settings, 'view')
    return loadAnalytics(app.db, { linkId: id, visibility: null }, parseRange(request.query))
  })
}

type ClickFilter = { linkId?: string; visibility: SQL | null }

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

export async function loadAnalytics(db: Database, filter: ClickFilter, range: { from: Date; to: Date }) {
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
    utmSources: await grouped(db, 'utm_source', where, 'Not set'),
    utmMediums: await grouped(db, 'utm_medium', where, 'Not set'),
    utmCampaigns: await grouped(db, 'utm_campaign', where, 'Not set'),
    utmIds: await grouped(db, 'utm_id', where, 'Not set'),
    utmTerms: await grouped(db, 'utm_term', where, 'Not set'),
    utmContents: await grouped(db, 'utm_content', where, 'Not set'),
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

async function loadLinkStats(db: Database, visibility: SQL | null, range: { from: Date; to: Date }) {
  const owner = visibility ?? sql`true`
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

function filterSql(filter: ClickFilter, range: { from: Date; to: Date }) {
  const parts = [sql`occurred_at >= ${range.from}`, sql`occurred_at < ${range.to}`]
  if (filter.linkId) parts.push(sql`link_id = ${filter.linkId}`)
  if (filter.visibility) parts.push(sql`link_id in (select id from links where ${filter.visibility})`)
  return sql.join(parts, sql` and `)
}

function whereAlias(filter: ClickFilter, range: { from: Date; to: Date }) {
  const parts = [sql`e.occurred_at >= ${range.from}`, sql`e.occurred_at < ${range.to}`]
  if (filter.linkId) parts.push(sql`e.link_id = ${filter.linkId}`)
  if (filter.visibility) parts.push(sql`e.link_id in (select id from links where ${filter.visibility})`)
  return sql.join(parts, sql` and `)
}

async function grouped(db: Database, column: string, where: ReturnType<typeof filterSql>, emptyLabel = 'Direct') {
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
  return rows.map((row) => ({ name: row.name || emptyLabel, clicks: row.clicks }))
}

const maxSeriesDays = 400

function fillSeries(rows: { date: string; clicks: number }[], range: { from: Date; to: Date }) {
  const map = new Map(rows.map((row) => [row.date, row.clicks]))
  const series: { date: string; clicks: number }[] = []
  const cursor = startOfUtcDay(range.from)
  const end = lastIncludedUtcDay(range.to)
  while (cursor.getTime() <= end.getTime()) {
    if (series.length >= maxSeriesDays) throw new AppError(400, 'Choose a range of 400 days or fewer')
    const date = cursor.toISOString().slice(0, 10)
    series.push({ date, clicks: map.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return series
}

export function parseAnalyticsRange(query: unknown): { from: Date; to: Date } {
  return parseRange(query)
}

function parseRange(query: unknown): { from: Date; to: Date } {
  const record = typeof query === 'object' && query ? (query as { from?: string; to?: string }) : {}
  const to = parseTo(record.to, new Date())
  const from = parseFrom(record.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000))
  if (from >= to) throw new AppError(400, 'The start date must be before the end date')
  if (seriesDayCount(from, to) > maxSeriesDays) throw new AppError(400, 'Choose a range of 400 days or fewer')
  return { from, to }
}

function parseFrom(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return utcCalendarDate(value)
  return parseInstant(value)
}

function parseTo(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = utcCalendarDate(value)
    start.setUTCDate(start.getUTCDate() + 1)
    return start
  }
  return parseInstant(value)
}

function utcCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new AppError(400, 'Invalid date')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(400, 'Invalid date')
  }
  return date
}

function parseInstant(value: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new AppError(400, 'Invalid date')
  return date
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function lastIncludedUtcDay(to: Date): Date {
  const midnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  if (to.getTime() === midnight) return new Date(midnight - 24 * 60 * 60 * 1000)
  return new Date(midnight)
}

function seriesDayCount(from: Date, to: Date): number {
  const start = startOfUtcDay(from).getTime()
  const end = lastIncludedUtcDay(to).getTime()
  if (end < start) return 0
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1
}

function rowCount(result: unknown): number {
  if (typeof result === 'object' && result && 'rowCount' in result && typeof result.rowCount === 'number') {
    return result.rowCount
  }
  return 0
}
