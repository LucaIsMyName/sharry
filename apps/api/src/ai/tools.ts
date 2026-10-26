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
import { rowsOf, type AppSettings } from '../settings-store.ts'
import { AppError } from '../support.ts'
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
      'Show the short-link form. Call this as soon as the person wants a short link. Prefill destinationUrl or slug only when they already gave them. This does not create the link.',
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
      'Show the analytics form so the person can choose all links or one link. Call this as soon as they want a report. Prefill from and to as YYYY-MM-DD only when they already named dates. This does not run the report.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
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
    const prefill = parsed.success ? parsed.data : {}
    if (prefill.destinationUrl && !destinationSchema.safeParse(prefill.destinationUrl).success) delete prefill.destinationUrl
    return { ok: true, block: { type: 'form', id, form: 'link', status: 'pending', prefill } }
  }
  if (call.name === 'show_analytics_form') {
    const parsed = analyticsFormPrefillSchema.safeParse(value)
    return {
      ok: true,
      block: {
        type: 'form',
        id,
        form: 'analytics',
        status: 'pending',
        prefill: parsed.success ? parsed.data : {},
        links: await visibleLinkChoices(db, actor, settings),
      },
    }
  }
  if (call.name === 'show_campaign_form') {
    const parsed = campaignFormPrefillSchema.safeParse(value)
    return {
      ok: true,
      block: {
        type: 'form',
        id,
        form: 'campaign',
        status: 'pending',
        prefill: parsed.success ? parsed.data : {},
        links: await visibleLinkChoices(db, actor, settings),
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

export function blocksFromAnalyticsResult(value: unknown): ChatBlock[] {
  if (!value || typeof value !== 'object') return []
  const record = value as {
    path?: unknown
    series?: { date: string; clicks: number }[]
    links?: { title: string | null; slug: string; clicks: number; uniqueVisitors?: number }[]
    referrers?: { name: string; clicks: number }[]
  }
  if (typeof record.path !== 'string' || !Array.isArray(record.series)) return []
  const chart: ChatBlock = { type: 'chart', title: 'Clicks', series: record.series, path: record.path }
  const table: ChatBlock = record.links
    ? {
        type: 'table',
        title: 'Links',
        columns: ['Name', 'Clicks', 'Unique visitors'],
        rows: record.links.map((link) => [link.title || link.slug, String(link.clicks), String(link.uniqueVisitors ?? 0)]),
        path: record.path,
      }
    : {
        type: 'table',
        title: 'Referrers',
        columns: ['Referrer', 'Clicks'],
        rows: (record.referrers ?? []).map((row) => [row.name, String(row.clicks)]),
        path: record.path,
      }
  return [chart, table]
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
    created = await createLink(
      db,
      actor,
      { destinationUrl: parsed.data.destinationUrl, slug: parsed.data.slug?.trim() || undefined },
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
  try {
    const report = await queryAnalyticsForActor(db, actor, settings, {
      from: dates.from,
      to: dates.to,
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
      to: labelTo(dates.to, data.to),
      totalClicks: data.totalClicks,
      uniqueVisitors: data.uniqueVisitors,
    }
    const content = analyticsSentence(locale, result, !dates.from && !dates.to, parsed.data.scope)
    const chosen = block.links?.find((link) => link.id === parsed.data.linkId)
    const scopeText = parsed.data.scope === 'all' ? 'all links' : `the link ${chosen?.title || chosen?.slug || parsed.data.linkId}`
    const tableText =
      parsed.data.scope === 'all'
        ? 'a table of links with name, clicks, and unique visitors'
        : 'a table of referrers and their clicks'
    const brief = `The person submitted the analytics form for ${scopeText}. Range ${result.from} to ${result.to}: ${result.totalClicks} clicks, ${result.uniqueVisitors} unique visitors. The chat will draw a clicks-by-day chart and ${tableText} below your text. Write a short opening section in ${locale === 'de' ? 'German' : 'English'} with one markdown heading. Explain the date range, these totals, what the chart shows, and what the table lists. Use only these numbers. Do not draw a table or a chart. Do not call tools.`
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
  if (locale === 'de') {
    const range = last30 ? `Letzte 30 Tage (${from} bis ${to})` : `Von ${from} bis ${to}`
    const table =
      scope === 'all'
        ? 'Die Tabelle listet jeden Link mit Klicks und eindeutigen Besuchern.'
        : 'Die Tabelle listet die Verweise.'
    return `${range}: ${clicks} Klicks, ${visitors} eindeutige Besucher. Das Diagramm zeigt die Klicks pro Tag. ${table}`
  }
  const range = last30 ? `Last 30 days (${from} to ${to})` : `From ${from} to ${to}`
  const table =
    scope === 'all'
      ? 'The table lists each link with its clicks and unique visitors.'
      : 'The table lists referrers.'
  return `${range}: ${clicks} clicks, ${visitors} unique visitors. The chart shows clicks by day. ${table}`
}

async function visibleLinkChoices(db: Database, actor: Actor, settings: AppSettings) {
  const visibility = visibleLinksWhere(actor, settings, 'links')
  return rowsOf<{ id: string; slug: string; title: string | null }>(
    await db.execute(sql`
      select id::text as id, slug, title
      from links
      where ${visibility ?? sql`true`}
      order by updated_at desc
      limit 100
    `),
  )
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
    const link = await resolveVariantLink(db, actor, settings, undefined, parsed.data.slug)
    linkId = link.id
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
    utmSources: analytics.utmSources,
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
  const query = parsed.data.query
  const matches: { kind: string; label: string; path: string; score: number }[] = []
  for (const page of pageCatalog) {
    if (page.admin && actor.role !== 'admin') continue
    const score = scoreText(query, `${page.label} ${page.keywords} ${page.path}`)
    if (score > 0) matches.push({ kind: 'page', label: page.label, path: page.path, score })
  }
  const needle = `%${query.replace(/[%_\\]/g, '')}%`
  const visibility = visibleLinksWhere(actor, settings, 'links')
  const linkRows = rowsOf<{ id: string; slug: string; title: string | null }>(
    await db.execute(sql`
      select id::text as id, slug, title
      from links
      where ${visibility ?? sql`true`}
        and (slug ilike ${needle} or coalesce(title, '') ilike ${needle})
      order by updated_at desc
      limit 5
    `),
  )
  for (const link of linkRows) {
    matches.push({
      kind: 'link',
      label: link.title?.trim() || link.slug,
      path: `/links/${link.id}`,
      score: 3,
    })
  }
  const campaignRows = rowsOf<{ id: string; name: string }>(
    await db.execute(sql`
      select id::text as id, name
      from tracking_campaigns
      where ${actor.role === 'admin' ? sql`true` : sql`user_id = ${actor.id}`}
        and name ilike ${needle}
      order by updated_at desc
      limit 5
    `),
  )
  for (const campaign of campaignRows) {
    matches.push({ kind: 'campaign', label: campaign.name, path: `/campaigns/${campaign.id}`, score: 3 })
  }
  matches.sort((left, right) => right.score - left.score)
  return { matches: matches.slice(0, 8).map(({ kind, label, path }) => ({ kind, label, path })) }
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
  { path: '/analytics', label: 'Analytics', admin: false, keywords: 'clicks report stats' },
  { path: '/chat', label: 'Chat', admin: false, keywords: 'assistant ai' },
  { path: '/account', label: 'Account', admin: false, keywords: 'password profile locale photo two-factor mfa' },
  { path: '/docs/user/signing-in', label: 'Signing in', admin: false, keywords: 'docs login' },
  { path: '/docs/user/links', label: 'Link guide', admin: false, keywords: 'docs links' },
  { path: '/docs/user/campaigns', label: 'Campaign guide', admin: false, keywords: 'docs campaigns' },
  { path: '/docs/user/analytics', label: 'Analytics guide', admin: false, keywords: 'docs analytics' },
  { path: '/docs/user/qr-codes', label: 'QR codes', admin: false, keywords: 'docs qr code' },
  { path: '/docs/user/domains', label: 'Domains guide', admin: false, keywords: 'docs domains' },
  { path: '/docs/user/api-keys', label: 'API keys guide', admin: false, keywords: 'docs api keys' },
  { path: '/docs/user/users', label: 'Users guide', admin: false, keywords: 'docs users' },
  { path: '/docs/user/settings', label: 'Settings guide', admin: false, keywords: 'docs settings' },
  { path: '/docs/user/chat', label: 'Chat guide', admin: false, keywords: 'docs assistant chat' },
  { path: '/admin/users', label: 'Users', admin: true, keywords: 'admin accounts create user' },
  { path: '/admin/api-keys', label: 'API keys', admin: true, keywords: 'admin tokens' },
  { path: '/admin/settings', label: 'Settings', admin: true, keywords: 'admin mail prefix ai provider' },
  { path: '/admin/domains', label: 'Domains', admin: true, keywords: 'admin redirect dns' },
  { path: '/admin/server', label: 'Server', admin: true, keywords: 'admin host memory' },
  { path: '/admin/audit', label: 'Audit', admin: true, keywords: 'admin log' },
]

function scoreText(query: string, haystack: string): number {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 1)
  if (words.length === 0) return 0
  const text = haystack.toLowerCase()
  return words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0)
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
