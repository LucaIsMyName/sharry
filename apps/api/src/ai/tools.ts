import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { qrCodes, trackingCampaigns, trackingVariants, type Database } from '@sharry/database'
import {
  analyticsFormPrefillSchema,
  campaignFormPrefillSchema,
  cleanUtm,
  destinationSchema,
  docSlugs,
  linkFormPrefillSchema,
  lookupSchema,
  proposeCampaignSchema,
  proposeLinkSchema,
  queryAnalyticsSchema,
  readDocSchema,
  submitAnalyticsFormSchema,
  submitCampaignFormSchema,
  submitLinkFormSchema,
  type AiProposal,
  type ChatBlock,
  type ChatFormResult,
  type DocSlug,
} from '@sharry/shared'
import { loadAnalytics, parseAnalyticsRange } from '../analytics.ts'
import { writeAudit } from '../audit.ts'
import type { Actor } from '../auth.ts'
import { createLink, findBySlug, getLinkForActor, loadVerifiedHosts, serializeLink, visibleLinksWhere } from '../links.ts'
import { searchForActor, searchPhrases, textMatches, type SearchResults } from '../search.ts'
import { rowsOf, type AppSettings } from '../settings-store.ts'
import { AppError } from '../support.ts'
import { suggestFreeSlug } from './page-slug.ts'
import type { AiToolCall, AiToolDef } from './provider.ts'

const readTools = new Set(['query_analytics', 'lookup', 'read_doc'])
const writeTools = new Set(['propose_link', 'propose_campaign'])
const formTools = new Set(['show_link_form', 'show_analytics_form', 'show_campaign_form'])

const stringParam = { type: 'string' }
const utmParam = {
  type: 'object',
  additionalProperties: false,
  properties: {
    utm_source: stringParam,
    utm_medium: stringParam,
    utm_campaign: stringParam,
    utm_id: stringParam,
    utm_term: stringParam,
    utm_content: stringParam,
  },
}

export const aiToolDefs: AiToolDef[] = [
  {
    name: 'show_link_form',
    description:
      'Show the short-link form. Call this as soon as the person wants a short link. Pass destinationUrl when they already gave one. Leave slug empty unless they typed a slug. The form also asks for an optional title and UTM source, medium, and campaign. This does not create the link.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        destinationUrl: { type: 'string', description: 'http or https URL, only if already given' },
        slug: stringParam,
      },
    },
  },
  {
    name: 'show_analytics_form',
    description:
      'Show the analytics form so the person can choose all links or one link and slide the date range. Call this as soon as they want a report. Prefill from and to as YYYY-MM-DD only when they already named dates. Pass linkId when one link is already identified. This does not run the report.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        linkId: stringParam,
      },
    },
  },
  {
    name: 'show_campaign_form',
    description:
      'Show the campaign form. Call this as soon as the person wants a campaign. Prefill name or description only when they already gave them. This does not create the campaign.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { name: stringParam, description: stringParam },
    },
  },
  {
    name: 'propose_link',
    description:
      'Prepare a short link for the person to confirm. Call this only after they gave a destination URL and answered or skipped the optional title and slug. This does not create the link.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        destinationUrl: { type: 'string', description: 'http or https URL' },
        title: stringParam,
        description: stringParam,
        slug: stringParam,
        redirectType: { type: 'string', enum: ['301', '302', '307', '308'] },
        expiresAt: { type: 'string', description: 'ISO datetime, or omit' },
        utm: utmParam,
      },
      required: ['destinationUrl'],
    },
  },
  {
    name: 'propose_campaign',
    description:
      'Prepare a campaign for the person to confirm. Call this only after they named the campaign and said which link to attach, or that they do not want a variant yet. This does not create the campaign.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: stringParam,
        description: stringParam,
        variants: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              linkId: stringParam,
              slug: stringParam,
              name: stringParam,
              utm: utmParam,
            },
            required: ['name'],
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'query_analytics',
    description:
      'Read click totals for the links this person can see. Use after they say which link, or all links, and what they want to know. Omit from and to for the last 30 days.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        linkId: stringParam,
        slug: stringParam,
      },
    },
  },
  {
    name: 'lookup',
    description: 'Find a Sharry page, doc, link, or campaign from a short query. Use this when the person cannot find something.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { query: stringParam },
      required: ['query'],
    },
  },
  {
    name: 'read_doc',
    description: 'Read one Sharry user guide so you can explain a screen. slug is one of the allowlisted guide names.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { slug: { type: 'string', enum: [...docSlugs] } },
      required: ['slug'],
    },
  },
]

export function isReadTool(name: string): boolean {
  return readTools.has(name)
}

export function isWriteTool(name: string): boolean {
  return writeTools.has(name)
}

export function isFormTool(name: string): boolean {
  return formTools.has(name)
}

export async function runReadTool(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  locale: string,
  call: AiToolCall,
): Promise<string> {
  const args = parseArguments(call.arguments)
  if (!args.ok) return args.error
  try {
    if (call.name === 'query_analytics') return JSON.stringify(await queryAnalyticsForActor(db, actor, settings, args.value))
    if (call.name === 'lookup') return JSON.stringify(await lookupForActor(db, actor, settings, args.value))
    if (call.name === 'read_doc') return JSON.stringify(readGuide(locale, args.value))
    return 'That tool is not available.'
  } catch (error) {
    if (error instanceof AppError) return JSON.stringify({ error: error.message })
    throw error
  }
}

export function proposalFromWrite(call: AiToolCall): { ok: true; proposal: AiProposal } | { ok: false; error: string } {
  const args = parseArguments(call.arguments)
  if (!args.ok) return args
  const schema = call.name === 'propose_link' ? proposeLinkSchema : proposeCampaignSchema
  const parsed = schema.safeParse(args.value)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')
    return { ok: false, error: `Missing or invalid detail. Ask one question about it. ${detail}` }
  }
  return {
    ok: true,
    proposal: {
      id: randomUUID(),
      tool: call.name === 'propose_link' ? 'propose_link' : 'propose_campaign',
      args: parsed.data as Record<string, unknown>,
      status: 'pending',
    },
  }
}

export async function formBlockFromCall(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  call: AiToolCall,
): Promise<{ ok: true; block: ChatBlock } | { ok: false; error: string }> {
  const args = parseArguments(call.arguments)
  const value = args.ok ? args.value : {}
  const id = randomUUID()
  if (call.name === 'show_link_form') {
    const parsed = linkFormPrefillSchema.safeParse(value)
    const prefill: { destinationUrl?: string; slug?: string; suggested?: boolean; fromTitle?: boolean } = {}
    if (parsed.success && parsed.data.destinationUrl && destinationSchema.safeParse(parsed.data.destinationUrl).success) {
      prefill.destinationUrl = parsed.data.destinationUrl
    }
    if (parsed.success && parsed.data.slug?.trim()) prefill.slug = parsed.data.slug.trim()
    if (prefill.destinationUrl && !prefill.slug) {
      const suggested = await suggestFreeSlug(db, prefill.destinationUrl).catch(() => null)
      if (suggested?.slug) {
        prefill.slug = suggested.slug
        prefill.suggested = true
        prefill.fromTitle = suggested.fromTitle
      }
    }
    return { ok: true, block: { type: 'form', id, form: 'link', status: 'pending', prefill } }
  }
  if (call.name === 'show_analytics_form') {
    const parsed = analyticsFormPrefillSchema.safeParse(value)
    const choices = await visibleLinkChoices(db, actor, settings)
    return {
      ok: true,
      block: {
        type: 'form',
        id,
        form: 'analytics',
        status: 'pending',
        prefill: parsed.success ? parsed.data : {},
        links: choices.links,
        ...(choices.earliestCreatedAt ? { earliestCreatedAt: choices.earliestCreatedAt } : {}),
      },
    }
  }
  if (call.name === 'show_campaign_form') {
    const parsed = campaignFormPrefillSchema.safeParse(value)
    const choices = await visibleLinkChoices(db, actor, settings)
    return {
      ok: true,
      block: {
        type: 'form',
        id,
        form: 'campaign',
        status: 'pending',
        prefill: parsed.success ? parsed.data : {},
        links: choices.links,
      },
    }
  }
  return { ok: false, error: 'That tool is not available.' }
}

export async function applyFormSubmission(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  locale: string,
  block: Extract<ChatBlock, { type: 'form' }>,
  body: unknown,
): Promise<{ block: ChatBlock; report?: { content: string; blocks: ChatBlock[]; brief: string } }> {
  if (block.form === 'link') return { block: await submitLinkForm(db, actor, settings, block, body) }
  if (block.form === 'campaign') return { block: await submitCampaignForm(db, actor, settings, block, body) }
  return submitAnalyticsForm(db, actor, settings, locale, block, body)
}

function namedRows(value: unknown): { name: string; clicks: number }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const name = (row as { name?: unknown }).name
    const clicks = (row as { clicks?: unknown }).clicks
    if (typeof name !== 'string' || typeof clicks !== 'number') return []
    return [{ name, clicks }]
  })
}

export function blocksFromAnalyticsResult(value: unknown): ChatBlock[] {
  if (!value || typeof value !== 'object') return []
  const record = value as {
    path?: unknown
    series?: { date: string; clicks: number }[]
    links?: { title: string | null; slug: string; clicks: number; uniqueVisitors?: number }[]
    referrers?: unknown
    countries?: unknown
    browsers?: unknown
    devices?: unknown
    operatingSystems?: unknown
    bots?: unknown
    utmSources?: unknown
    utmMediums?: unknown
    utmCampaigns?: unknown
    utmIds?: unknown
    utmTerms?: unknown
    utmContents?: unknown
  }
  if (typeof record.path !== 'string' || !Array.isArray(record.series)) return []
  const chart: ChatBlock = { type: 'chart', title: 'Clicks', series: record.series, path: record.path }
  const groups: [string, unknown][] = [
    ['Referrers', record.referrers],
    ['Countries', record.countries],
    ['Browsers', record.browsers],
    ['Devices', record.devices],
    ['Operating systems', record.operatingSystems],
    ['Bots', record.bots],
    ['utm_source', record.utmSources],
    ['utm_medium', record.utmMediums],
    ['utm_campaign', record.utmCampaigns],
    ['utm_id', record.utmIds],
    ['utm_term', record.utmTerms],
    ['utm_content', record.utmContents],
  ]
  const bars: ChatBlock[] = groups.flatMap(([title, rows]) => {
    const named = namedRows(rows)
    if (named.length === 0) return []
    return [{ type: 'bars', title, rows: named, path: record.path as string }]
  })
  const table: ChatBlock[] = record.links
    ? [
        {
          type: 'table',
          title: 'Links',
          columns: ['Name', 'Clicks', 'Unique visitors'],
          rows: record.links.map((link) => [link.title || link.slug, String(link.clicks), String(link.uniqueVisitors ?? 0)]),
          path: record.path,
        },
      ]
    : []
  return [chart, ...bars, ...table]
}

async function submitLinkForm(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  block: Extract<ChatBlock, { type: 'form' }>,
  body: unknown,
): Promise<ChatBlock> {
  const parsed = submitLinkFormSchema.safeParse(body)
  if (!parsed.success) return pendingError(block, parsed.error.issues.map((issue) => issue.message).join(' '))
  let created: Awaited<ReturnType<typeof createLink>>
  try {
    const utm = cleanUtm({
      utm_source: parsed.data.utmSource,
      utm_medium: parsed.data.utmMedium,
      utm_campaign: parsed.data.utmCampaign,
    })
    created = await createLink(
      db,
      actor,
      {
        destinationUrl: parsed.data.destinationUrl,
        title: parsed.data.title?.trim() || undefined,
        slug: parsed.data.slug?.trim() || undefined,
        utm: Object.keys(utm).length > 0 ? utm : undefined,
      },
      settings,
    )
  } catch (error) {
    return pendingError(block, error instanceof AppError ? error.message : 'Could not create the link.')
  }
  const hosts = await loadVerifiedHosts(db, [created.redirectDomainId])
  const link = serializeLink(created, settings, undefined, hosts)
  let qrCreated = false
  let error: string | undefined
  if (parsed.data.createQr) {
    try {
      const [qr] = await db
        .insert(qrCodes)
        .values({ linkId: created.id, name: 'QR', styleConfig: settings.defaultQrStyle })
        .returning()
      if (!qr) error = 'Could not create the QR code'
      else {
        qrCreated = true
        await writeAudit(db, {
          actorUserId: actor.id,
          action: 'qr.created',
          entityType: 'qr_code',
          entityId: qr.id,
          metadata: { linkId: created.id, name: qr.name },
        })
      }
    } catch (caught) {
      error = caught instanceof AppError ? caught.message : 'Could not create the QR code'
    }
  }
  return {
    ...block,
    status: 'submitted',
    result: { path: `/links/${created.id}`, shortUrl: link.shortUrl, qrCreated, error },
  }
}

async function submitCampaignForm(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  block: Extract<ChatBlock, { type: 'form' }>,
  body: unknown,
): Promise<ChatBlock> {
  const parsed = submitCampaignFormSchema.safeParse(body)
  if (!parsed.success) return pendingError(block, parsed.error.issues.map((issue) => issue.message).join(' '))
  if (parsed.data.variantName?.trim() && !parsed.data.linkId) return pendingError(block, 'Choose a link for this variant.')
  const proposal = await confirmCampaign(db, actor, settings, {
    id: block.id,
    tool: 'propose_campaign',
    status: 'pending',
    args: {
      name: parsed.data.name,
      description: parsed.data.description,
      variants:
        parsed.data.linkId
          ? [{ linkId: parsed.data.linkId, name: parsed.data.variantName?.trim() || parsed.data.name }]
          : undefined,
    },
  })
  if (proposal.status === 'failed') return pendingError(block, proposal.result?.error ?? 'Could not create the campaign.')
  return { ...block, status: 'submitted', result: proposal.result }
}

async function submitAnalyticsForm(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  locale: string,
  block: Extract<ChatBlock, { type: 'form' }>,
  body: unknown,
): Promise<{ block: ChatBlock; report?: { content: string; blocks: ChatBlock[]; brief: string } }> {
  const parsed = submitAnalyticsFormSchema.safeParse(body)
  if (!parsed.success) return { block: pendingError(block, parsed.error.issues.map((issue) => issue.message).join(' ')) }
  const prefill = analyticsFormPrefillSchema.safeParse(block.prefill ?? {})
  const dates = prefill.success ? prefill.data : {}
  const from = parsed.data.from ?? dates.from
  const to = parsed.data.to ?? dates.to
  try {
    const report = await queryAnalyticsForActor(db, actor, settings, {
      from,
      to,
      linkId: parsed.data.scope === 'link' ? parsed.data.linkId : undefined,
    })
    if (!report || typeof report !== 'object' || !('path' in report)) {
      return { block: pendingError(block, 'Could not read analytics.') }
    }
    const data = report as {
      path: string
      from: string
      to: string
      totalClicks: number
      uniqueVisitors: number
      error?: string
    }
    if (data.error) return { block: pendingError(block, data.error) }
    const result: ChatFormResult = {
      scope: parsed.data.scope,
      linkId: parsed.data.linkId,
      path: data.path,
      from: data.from,
      to: labelTo(to, data.to),
      totalClicks: data.totalClicks,
      uniqueVisitors: data.uniqueVisitors,
    }
    const content = analyticsSentence(locale, result, !from && !to, parsed.data.scope)
    const chosen = block.links?.find((link) => link.id === parsed.data.linkId)
    const scopeText = parsed.data.scope === 'all' ? 'all links' : `the link ${chosen?.title || chosen?.slug || parsed.data.linkId}`
    const tableText =
      parsed.data.scope === 'all' ? ' The chat will also draw a table of links with name, clicks, and unique visitors.' : ''
    const brief = `The person submitted the analytics form for ${scopeText}. Range ${result.from} to ${result.to}: ${result.totalClicks} clicks, ${result.uniqueVisitors} unique visitors. The chat will draw a clicks-by-day chart and bar charts for referrers, countries, browsers, devices, operating systems, bots, and UTM fields below your text.${tableText} Write a short opening section in ${locale === 'de' ? 'German' : 'English'} with one markdown heading. Explain the date range, these totals, what the chart shows, and what the bars compare. Use only these numbers. Do not draw a table or a chart. Do not call tools.`
    return {
      block: { ...block, status: 'submitted', result },
      report: { content, blocks: blocksFromAnalyticsResult(report), brief },
    }
  } catch (error) {
    return { block: pendingError(block, error instanceof AppError ? error.message : 'Could not read analytics.') }
  }
}

function pendingError(block: Extract<ChatBlock, { type: 'form' }>, error: string): ChatBlock {
  return { ...block, status: 'pending', result: { ...(block.result ?? {}), error } }
}

function labelTo(requested: string | undefined, rangeEnd: string): string {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested
  return rangeEnd
}

export function analyticsSentence(
  locale: string,
  result: ChatFormResult,
  last30: boolean,
  scope: 'all' | 'link',
): string {
  const from = result.from ?? ''
  const to = result.to ?? ''
  const clicks = result.totalClicks ?? 0
  const visitors = result.uniqueVisitors ?? 0
  const bars =
    locale === 'de'
      ? 'Die Balken zeigen Verweise, Länder, Browser, Geräte, Betriebssysteme, Bots und UTM-Felder.'
      : 'The bars show referrers, countries, browsers, devices, operating systems, bots, and UTM fields.'
  const table =
    scope === 'all'
      ? locale === 'de'
        ? ' Die Tabelle listet jeden Link mit Klicks und eindeutigen Besuchern.'
        : ' The table lists each link with its clicks and unique visitors.'
      : ''
  if (locale === 'de') {
    const range = last30 ? `Letzte 30 Tage (${from} bis ${to})` : `Von ${from} bis ${to}`
    return `${range}: ${clicks} Klicks, ${visitors} eindeutige Besucher. Das Diagramm zeigt die Klicks pro Tag. ${bars}${table}`
  }
  const range = last30 ? `Last 30 days (${from} to ${to})` : `From ${from} to ${to}`
  return `${range}: ${clicks} clicks, ${visitors} unique visitors. The chart shows clicks by day. ${bars}${table}`
}

async function visibleLinkChoices(db: Database, actor: Actor, settings: AppSettings) {
  const where = () => visibleLinksWhere(actor, settings, 'links') ?? sql`true`
  const [linkRows, earliestRows] = await Promise.all([
    db.execute(sql`
      select id::text as id, slug, title,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as created_at
      from links
      where ${where()}
      order by updated_at desc
      limit 100
    `),
    db.execute(sql`
      select to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD') as created_at
      from links
      where ${where()}
    `),
  ])
  const links = rowsOf<{ id: string; slug: string; title: string | null; created_at: string | null }>(linkRows).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
  }))
  const earliestCreatedAt = rowsOf<{ created_at: string | null }>(earliestRows)[0]?.created_at ?? undefined
  return { links, earliestCreatedAt: earliestCreatedAt || undefined }
}

export async function confirmProposal(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  proposal: AiProposal,
): Promise<AiProposal> {
  return proposal.tool === 'propose_link'
    ? confirmLink(db, actor, settings, proposal)
    : confirmCampaign(db, actor, settings, proposal)
}

async function confirmLink(db: Database, actor: Actor, settings: AppSettings, proposal: AiProposal): Promise<AiProposal> {
  const parsed = proposeLinkSchema.safeParse(proposal.args)
  if (!parsed.success) return failed(proposal, 'This link is missing a destination URL.')
  try {
    const created = await createLink(db, actor, parsed.data, settings)
    const hosts = await loadVerifiedHosts(db, [created.redirectDomainId])
    const link = serializeLink(created, settings, parsed.data.utm, hosts)
    return { ...proposal, status: 'confirmed', result: { path: `/links/${created.id}`, shortUrl: link.shortUrl } }
  } catch (error) {
    return failed(proposal, error instanceof AppError ? error.message : 'Could not create the link.')
  }
}

async function confirmCampaign(db: Database, actor: Actor, settings: AppSettings, proposal: AiProposal): Promise<AiProposal> {
  const parsed = proposeCampaignSchema.safeParse(proposal.args)
  if (!parsed.success) return failed(proposal, 'This campaign is missing a name.')
  const [created] = await db
    .insert(trackingCampaigns)
    .values({ userId: actor.id, name: parsed.data.name, description: parsed.data.description || null })
    .returning()
  if (!created) return failed(proposal, 'Could not create the campaign.')
  await writeAudit(db, {
    actorUserId: actor.id,
    action: 'campaign.created',
    entityType: 'campaign',
    entityId: created.id,
    metadata: { name: created.name },
  })
  const variants: { name: string; id?: string; error?: string }[] = []
  for (const variant of parsed.data.variants ?? []) {
    try {
      const link = await resolveVariantLink(db, actor, settings, variant.linkId, variant.slug)
      const utm = cleanUtm(variant.utm)
      const [row] = await db
        .insert(trackingVariants)
        .values({
          campaignId: created.id,
          linkId: link.id,
          name: variant.name,
          utmSource: utm.utm_source ?? null,
          utmMedium: utm.utm_medium ?? null,
          utmCampaign: utm.utm_campaign ?? null,
          utmId: utm.utm_id ?? null,
          utmTerm: utm.utm_term ?? null,
          utmContent: utm.utm_content ?? null,
        })
        .returning()
      variants.push(row ? { name: variant.name, id: row.id } : { name: variant.name, error: 'Could not add this variant.' })
    } catch (error) {
      variants.push({ name: variant.name, error: error instanceof AppError ? error.message : 'Could not add this variant.' })
    }
  }
  return {
    ...proposal,
    status: 'confirmed',
    result: { path: `/campaigns/${created.id}`, name: created.name, variants },
  }
}

export async function queryAnalyticsForActor(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  input: unknown,
): Promise<unknown> {
  const parsed = queryAnalyticsSchema.safeParse(input)
  if (!parsed.success) return { error: 'Use dates as YYYY-MM-DD.' }
  let linkId = parsed.data.linkId
  if (!linkId && parsed.data.slug) {
    const resolved = await resolveAnalyticsLink(db, actor, settings, parsed.data.slug)
    if ('matches' in resolved) return resolved
    linkId = resolved.id
  } else if (linkId) {
    await getLinkForActor(db, actor, linkId, settings, 'view')
  }
  const range = parseAnalyticsRange({ from: parsed.data.from, to: parsed.data.to })
  const filter = linkId
    ? { linkId, visibility: null as null }
    : { visibility: visibleLinksWhere(actor, settings, 'links') }
  const analytics = await loadAnalytics(db, filter, range)
  const path = linkId ? `/analytics?link=${linkId}` : '/analytics'
  return {
    path,
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
    totalClicks: analytics.totalClicks,
    uniqueVisitors: analytics.uniqueVisitors,
    botClicks: analytics.botClicks,
    series: analytics.series.slice(-45),
    referrers: analytics.referrers,
    countries: analytics.countries,
    browsers: analytics.browsers,
    devices: analytics.devices,
    operatingSystems: analytics.operatingSystems,
    utmSources: analytics.utmSources,
    utmMediums: analytics.utmMediums,
    utmCampaigns: analytics.utmCampaigns,
    utmIds: analytics.utmIds,
    utmTerms: analytics.utmTerms,
    utmContents: analytics.utmContents,
    bots:
      analytics.totalClicks > 0
        ? [
            { name: 'People', clicks: Math.max(0, analytics.totalClicks - analytics.botClicks) },
            { name: 'Bots', clicks: analytics.botClicks },
          ]
        : [],
    campaigns: analytics.campaigns,
    links: linkId ? undefined : await topLinks(db, actor, settings, range),
  }
}

export async function lookupForActor(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  input: unknown,
): Promise<{ matches: { kind: string; label: string; path: string }[] }> {
  const parsed = lookupSchema.safeParse(input)
  if (!parsed.success) return { matches: [] }
  const found = await searchForActor(db, actor, settings, parsed.data.query)
  const pages = pagesForPhrases([parsed.data.query], actor.role === 'admin')
  return { matches: matchList(found, pages).slice(0, 8).map(({ kind, label, path }) => ({ kind, label, path })) }
}

export async function searchContextForActor(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  message: string,
): Promise<string> {
  const phrases = searchPhrases(message)
  const found = phrases.length > 0 ? await searchForActor(db, actor, settings, phrases) : emptyActorSearch(actor.role === 'admin')
  const pages = pagesForPhrases(phrases, actor.role === 'admin')
  const lines = matchList(found, pages).map((match) =>
    match.detail ? `${match.kind}: ${match.label} — ${match.detail} — ${match.path}` : `${match.kind}: ${match.label} — ${match.path}`,
  )
  if (lines.length === 0) return 'Records matching this message: none.'
  return `Records matching this message:\n${lines.join('\n')}`
}

export function readGuide(locale: string, input: unknown): { path: string; markdown: string } | { error: string } {
  const parsed = readDocSchema.safeParse(input)
  if (!parsed.success) return { error: 'Choose a guide from the allowlist.' }
  return readDocFile(locale, parsed.data.slug)
}

const pageCatalog: { path: string; label: string; admin: boolean; keywords: string }[] = [
  { path: '/', label: 'Overview', admin: false, keywords: 'dashboard home overview' },
  { path: '/links', label: 'Links', admin: false, keywords: 'short links list' },
  { path: '/links/new', label: 'New link', admin: false, keywords: 'create short link form' },
  { path: '/campaigns', label: 'Campaigns', admin: false, keywords: 'utm variants campaign' },
  { path: '/media', label: 'Media', admin: false, keywords: 'media library images files uploads folders' },
  { path: '/analytics', label: 'Analytics', admin: false, keywords: 'clicks report stats' },
  { path: '/chat', label: 'Chat', admin: false, keywords: 'assistant ai' },
  { path: '/account', label: 'Account', admin: false, keywords: 'password profile locale photo two-factor mfa' },
  { path: '/docs/user/signing-in', label: 'Signing in', admin: false, keywords: 'docs login' },
  { path: '/docs/user/links', label: 'Link guide', admin: false, keywords: 'docs links' },
  { path: '/docs/user/campaigns', label: 'Campaign guide', admin: false, keywords: 'docs campaigns' },
  { path: '/docs/user/analytics', label: 'Analytics guide', admin: false, keywords: 'docs analytics' },
  { path: '/docs/user/qr-codes', label: 'QR codes', admin: false, keywords: 'docs qr code' },
  { path: '/docs/user/media', label: 'Media guide', admin: false, keywords: 'docs media library images uploads' },
  { path: '/docs/user/domains', label: 'Domains guide', admin: false, keywords: 'docs domains' },
  { path: '/docs/user/api-keys', label: 'API keys guide', admin: false, keywords: 'docs api keys' },
  { path: '/docs/user/users', label: 'Users guide', admin: false, keywords: 'docs users' },
  { path: '/docs/user/settings', label: 'Settings guide', admin: false, keywords: 'docs settings' },
  { path: '/docs/user/chat', label: 'Chat guide', admin: false, keywords: 'docs assistant chat' },
  { path: '/docs/user/search', label: 'Search guide', admin: false, keywords: 'docs search command' },
  { path: '/admin/users', label: 'Users', admin: true, keywords: 'admin accounts create user' },
  { path: '/admin/api-keys', label: 'API keys', admin: true, keywords: 'admin tokens' },
  { path: '/admin/settings', label: 'Settings', admin: true, keywords: 'admin mail prefix ai provider' },
  { path: '/admin/domains', label: 'Domains', admin: true, keywords: 'admin redirect dns' },
  { path: '/admin/server', label: 'Server', admin: true, keywords: 'admin host memory' },
  { path: '/admin/audit', label: 'Audit', admin: true, keywords: 'admin log' },
]

async function resolveAnalyticsLink(db: Database, actor: Actor, settings: AppSettings, slug: string) {
  try {
    return await resolveVariantLink(db, actor, settings, undefined, slug)
  } catch (error) {
    if (!(error instanceof AppError) || error.statusCode !== 404) throw error
    const found = await searchForActor(db, actor, settings, slug)
    const first = found.links[0]
    if (found.links.length === 1 && first) return getLinkForActor(db, actor, first.id, settings, 'view')
    if (found.links.length > 1) {
      return {
        matches: found.links.map((link) => ({
          id: link.id,
          slug: link.slug,
          title: link.title,
          path: `/links/${link.id}`,
          analyticsPath: `/analytics?link=${link.id}`,
        })),
      }
    }
    throw error
  }
}

function pagesForPhrases(phrases: string[], admin: boolean) {
  const pages: { label: string; path: string }[] = []
  for (const page of pageCatalog) {
    if (page.admin && !admin) continue
    const haystack = `${page.label} ${page.keywords} ${page.path}`
    if (!phrases.some((phrase) => textMatches(phrase, haystack))) continue
    pages.push({ label: page.label, path: page.path })
    if (pages.length === 8) break
  }
  return pages
}

function matchList(found: SearchResults, pages: { label: string; path: string }[]) {
  const matches: { kind: string; label: string; path: string; detail?: string }[] = []
  for (const link of found.links) {
    const name = link.title?.trim() || link.slug
    matches.push({
      kind: 'Link',
      label: name,
      detail: `slug ${link.slug}, id ${link.id}, analytics /analytics?link=${link.id}`,
      path: `/links/${link.id}`,
    })
  }
  for (const campaign of found.campaigns) {
    matches.push({ kind: 'Campaign', label: campaign.name, path: `/campaigns/${campaign.id}` })
  }
  for (const chat of found.chats) {
    matches.push({ kind: 'Chat', label: chat.title, path: `/chat/${chat.id}` })
  }
  for (const file of found.media) {
    matches.push({ kind: 'Media', label: file.name, path: mediaPath(file) })
  }
  for (const page of pages) matches.push({ kind: 'Page', label: page.label, path: page.path })
  for (const user of found.users ?? []) {
    matches.push({ kind: 'User', label: user.username, detail: user.email, path: `/admin/users?focus=${user.id}` })
  }
  for (const domain of found.domains ?? []) {
    matches.push({ kind: 'Domain', label: domain.hostname, path: `/admin/domains?focus=${domain.id}` })
  }
  for (const key of found.apiKeys ?? []) {
    matches.push({ kind: 'API key', label: key.name, detail: key.tokenPrefix, path: `/admin/api-keys?focus=${key.id}` })
  }
  for (const entry of found.audit ?? []) {
    matches.push({
      kind: 'Audit',
      label: entry.action,
      detail: entry.actorUsername ?? undefined,
      path: `/admin/audit?entry=${entry.id}`,
    })
  }
  return matches
}

function mediaPath(file: { id: string; folderId: string | null }): string {
  return file.folderId ? `/media?folder=${file.folderId}&file=${file.id}` : `/media?file=${file.id}`
}

function emptyActorSearch(admin: boolean): SearchResults {
  const base = { links: [], campaigns: [], chats: [], media: [] }
  if (!admin) return base
  return { ...base, users: [], domains: [], apiKeys: [], audit: [] }
}

function readDocFile(locale: string, slug: DocSlug): { path: string; markdown: string } {
  const root = path.resolve(process.cwd(), 'apps/web/docs')
  const localized = path.join(root, locale, 'user', `${slug}.md`)
  const english = path.join(root, 'en', 'user', `${slug}.md`)
  const file = locale !== 'en' && fs.existsSync(localized) ? localized : english
  const markdown = fs.readFileSync(file, 'utf8').slice(0, 12000)
  return { path: `/docs/user/${slug}`, markdown }
}

async function topLinks(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  range: { from: Date; to: Date },
): Promise<{ slug: string; title: string | null; clicks: number; uniqueVisitors: number; path: string }[]> {
  const visibility = visibleLinksWhere(actor, settings, 'l')
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
      where ${visibility ?? sql`true`}
      group by l.id
      order by clicks desc, l.created_at desc
      limit 15
    `),
  )
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    clicks: row.clicks,
    uniqueVisitors: row.unique_visitors,
    path: `/links/${row.id}`,
  }))
}

async function resolveVariantLink(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  linkId: string | undefined,
  slug: string | undefined,
) {
  if (linkId) return getLinkForActor(db, actor, linkId, settings, 'view')
  if (!slug) throw new AppError(400, 'Name the link for this variant.')
  const found = await findBySlug(db, slug)
  if (!found) throw new AppError(404, 'Link not found')
  return getLinkForActor(db, actor, found.id, settings, 'view')
}

function parseArguments(value: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown }
  } catch {
    return { ok: false, error: 'The tool arguments were not valid JSON. Ask the user for the missing detail.' }
  }
}

function failed(proposal: AiProposal, error: string): AiProposal {
  return { ...proposal, status: 'failed', result: { error } }
}
