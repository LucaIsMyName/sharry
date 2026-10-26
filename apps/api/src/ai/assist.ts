import { randomUUID } from 'node:crypto'
import {
  canonicalRoutingValue,
  cleanUtm,
  destinationSchema,
  isRoutingField,
  isRoutingOperator,
  MAX_ROUTING_CONDITIONS,
  MAX_ROUTING_VALUES,
  routingRulesSchema,
  type RoutingRule,
  type UtmParams,
} from '@sharry/shared'
import type { Database } from '@sharry/database'
import type { Actor } from '../auth.ts'
import { findBySlug } from '../links.ts'
import type { AppSettings } from '../settings-store.ts'
import { AppError } from '../support.ts'
import { clipPageTitle, pageIo, readPublicPage, slugify, suggestFreeSlug, type PageIo } from './page-slug.ts'
import { streamCompletion, type ProviderConfig } from './provider.ts'
import { queryAnalyticsForActor } from './tools.ts'

const draftLimit = 10
const titleLimit = 80

export type TextComplete = (system: string, user: string) => Promise<string>

export type ModelUsage = { promptTokens: number | null; completionTokens: number | null }

export type ModelUse = (usage: ModelUsage) => Promise<void>

export type SuggestedLinkRow = {
  destinationUrl: string
  title: string
  slug: string
  error?: string
}

export type VariantDraft = {
  name: string
  utm: UtmParams
}

type NamedClicks = { name?: string; clicks?: number }

export type AnalyticsReport = {
  error?: string
  from?: string
  to?: string
  totalClicks?: number
  uniqueVisitors?: number
  series?: { date: string; clicks: number }[]
  referrers?: NamedClicks[]
  countries?: NamedClicks[]
  utmSources?: NamedClicks[]
  utmMediums?: NamedClicks[]
  utmCampaigns?: NamedClicks[]
}

export async function collectCompletion(
  config: ProviderConfig,
  system: string,
  user: string,
  fetchImpl: typeof fetch = fetch,
  onModelUse?: ModelUse,
): Promise<string> {
  let text = ''
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  for await (const event of streamCompletion(
    config,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    [],
    fetchImpl,
  )) {
    if (event.type === 'text') text += event.text
    if (event.type === 'usage') {
      if (event.promptTokens != null) promptTokens = event.promptTokens
      if (event.completionTokens != null) completionTokens = event.completionTokens
    }
  }
  if (onModelUse) await onModelUse({ promptTokens, completionTokens })
  return text.trim()
}

export function extractJson(text: string): unknown {
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1)) as unknown
    } catch {
      return null
    }
  }
  const listStart = text.indexOf('[')
  const listEnd = text.lastIndexOf(']')
  if (listStart < 0 || listEnd <= listStart) return null
  try {
    return JSON.parse(text.slice(listStart, listEnd + 1)) as unknown
  } catch {
    return null
  }
}

export function utmFromModel(value: unknown): UtmParams | null {
  const record = asRecord(value)
  const source = record && 'utm' in record ? record.utm : record
  const fields = asRecord(source)
  if (!fields) return null
  const utm = cleanUtm({
    utm_source: textField(fields.utm_source),
    utm_medium: textField(fields.utm_medium),
    utm_campaign: textField(fields.utm_campaign),
  })
  return utm.utm_source || utm.utm_medium || utm.utm_campaign ? utm : null
}

export function rulesFromModel(value: unknown): RoutingRule[] | null {
  const record = asRecord(value)
  const list = Array.isArray(value) ? value : record?.rules
  if (!Array.isArray(list)) return null
  const rules: RoutingRule[] = []
  for (const item of list) {
    if (rules.length >= draftLimit) break
    const rule = ruleFromModel(item)
    if (rule) rules.push(rule)
  }
  const parsed = routingRulesSchema.safeParse(rules)
  return parsed.success && parsed.data.length > 0 ? parsed.data : null
}

export function variantsFromModel(value: unknown): { description: string; variants: VariantDraft[] } | null {
  const record = asRecord(value)
  const list = Array.isArray(value) ? value : record?.variants
  if (!Array.isArray(list)) return null
  const variants: VariantDraft[] = []
  for (const item of list) {
    if (variants.length >= 20) break
    const draft = variantFromModel(item)
    if (draft) variants.push(draft)
  }
  if (variants.length === 0) return null
  const description = clipPageTitle(textField(record?.description)).slice(0, 2000)
  return { description, variants }
}

export function titleLooksLikeSite(title: string, destinationUrl: string): boolean {
  const trimmed = title.trim()
  if (!trimmed) return true
  let host = ''
  try {
    host = new URL(destinationUrl).hostname.replace(/^www\./i, '')
  } catch {
    return false
  }
  const label = host.split('.')[0] ?? ''
  const normalized = normalizeName(trimmed)
  return normalized === normalizeName(host) || (label.length > 0 && normalized === normalizeName(label))
}

export function analyticsSummarySentences(
  locale: string,
  report: AnalyticsReport,
  requested?: { from?: string; to?: string },
): string | null {
  if (report.error || report.totalClicks == null || report.uniqueVisitors == null) return null
  const from = requested?.from || report.from || ''
  const to = requested?.to || report.series?.at(-1)?.date || report.to || from
  const clicks = report.totalClicks
  const visitors = report.uniqueVisitors
  const movement = seriesMovement(report.series ?? [])
  const top = topDimension(report)
  const partial = (report.series?.length ?? 0) > 0 && rangeDays(from, to) > (report.series?.length ?? 0)
  if (locale === 'de') {
    return [
      `Von ${from} bis ${to}: ${clicks} Klicks und ${visitors} eindeutige Besucher.`,
      movementSentence('de', movement, partial),
      topSentence('de', top),
    ].join(' ')
  }
  return [
    `From ${from} to ${to}: ${clicks} clicks and ${visitors} unique visitors.`,
    movementSentence('en', movement, partial),
    topSentence('en', top),
  ].join(' ')
}

export async function suggestUtmValues(
  config: ProviderConfig,
  input: { destinationUrl: string; placement?: string },
  options: { io?: PageIo; complete?: TextComplete; fetchImpl?: typeof fetch; onModelUse?: ModelUse } = {},
): Promise<{ utm: UtmParams }> {
  const page = await readPublicPage(input.destinationUrl, options.io ?? pageIo).catch(() => null)
  const placement = input.placement?.trim() ?? ''
  const user = [
    `Destination: ${input.destinationUrl}`,
    `Page title: ${page?.title?.trim() || '(none)'}`,
    `Placement: ${placement || '(none)'}`,
  ].join('\n')
  const text = await runComplete(config, utmSystem, user, options)
  const utm = utmFromModel(extractJson(text))
  if (!utm) throw new AppError(422, 'Could not suggest UTM values for that page.')
  return { utm }
}

export async function suggestRouteRules(
  config: ProviderConfig,
  instruction: string,
  options: { complete?: TextComplete; fetchImpl?: typeof fetch; onModelUse?: ModelUse } = {},
): Promise<{ rules: RoutingRule[] }> {
  const text = await runComplete(config, routeSystem, instruction.trim(), options)
  const rules = rulesFromModel(extractJson(text))
  if (!rules) throw new AppError(422, 'Could not draft routes from that sentence.')
  return { rules }
}

export async function summarizeAnalyticsForActor(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  locale: string,
  config: ProviderConfig,
  input: { from?: string; to?: string; linkId?: string; slug?: string },
  options: { complete?: TextComplete; fetchImpl?: typeof fetch; onModelUse?: ModelUse } = {},
): Promise<{ summary: string; from: string; to: string }> {
  const report = (await queryAnalyticsForActor(db, actor, settings, input)) as AnalyticsReport
  if (!report || typeof report !== 'object') throw new AppError(422, 'Could not read analytics.')
  if (report.error) throw new AppError(422, report.error)
  const fallback = analyticsSummarySentences(locale, report, { from: input.from, to: input.to })
  if (!fallback) throw new AppError(422, 'Could not read analytics.')
  const clicks = String(report.totalClicks ?? '')
  let summary = fallback
  try {
    const text = await runComplete(
      config,
      summarySystem(locale),
      `Facts:\n${fallback}\nClick count: ${clicks}`,
      options,
    )
    if (text.includes(clicks) && text.length <= 800) summary = text
  } catch {
    summary = fallback
  }
  const from = input.from || report.from || ''
  const to = input.to || report.series?.at(-1)?.date || report.to || from
  return { summary, from, to }
}

export async function suggestVariantDrafts(
  config: ProviderConfig,
  instruction: string,
  options: { complete?: TextComplete; fetchImpl?: typeof fetch; onModelUse?: ModelUse } = {},
): Promise<{ description: string; variants: VariantDraft[] }> {
  const text = await runComplete(config, variantSystem, instruction.trim(), options)
  const parsed = variantsFromModel(extractJson(text))
  if (!parsed) throw new AppError(422, 'Could not draft variants from that sentence.')
  return parsed
}

export async function suggestLinkRows(
  db: Database,
  urls: string[],
  options: { io?: PageIo; complete?: TextComplete; config?: ProviderConfig; fetchImpl?: typeof fetch; onModelUse?: ModelUse } = {},
): Promise<{ rows: SuggestedLinkRow[] }> {
  const rows: SuggestedLinkRow[] = []
  const seen = new Set<string>()
  const weak: number[] = []
  for (const raw of urls) {
    const destinationUrl = raw.trim()
    if (!destinationUrl || seen.has(destinationUrl)) continue
    seen.add(destinationUrl)
    if (!destinationSchema.safeParse(destinationUrl).success) {
      rows.push({ destinationUrl, title: '', slug: '', error: 'Enter a valid http or https URL' })
      continue
    }
    const suggested = await suggestFreeSlug(db, destinationUrl, { io: options.io }).catch(() => null)
    const title = suggested?.title ?? ''
    const slug = suggested?.slug ?? ''
    rows.push({
      destinationUrl,
      title,
      slug,
      ...(suggested ? {} : { error: 'Could not read that page.' }),
    })
    if (!suggested || titleLooksLikeSite(title, destinationUrl)) weak.push(rows.length - 1)
  }
  if (weak.length === 0) return { rows }
  let titles: string[] = []
  try {
    const complete = options.complete ?? (options.config ? completionFor(options.config, options.fetchImpl, options.onModelUse) : null)
    if (!complete) return { rows }
    const listed = weak
      .map((index, order) => `${order + 1}. ${rows[index]?.destinationUrl ?? ''} current: ${rows[index]?.title || '(none)'}`)
      .join('\n')
    const text = await complete(titleSystem, listed)
    titles = titlesFromModel(extractJson(text))
  } catch {
    return { rows }
  }
  for (let order = 0; order < weak.length; order += 1) {
    const index = weak[order]
    const row = index == null ? undefined : rows[index]
    const nextTitle = clipPageTitle(titles[order] ?? '').slice(0, titleLimit)
    if (!row || !nextTitle || titleLooksLikeSite(nextTitle, row.destinationUrl)) continue
    const previous = row.title
    row.title = nextTitle
    if (!row.slug || titleLooksLikeSite(previous, row.destinationUrl)) {
      const candidate = slugify(nextTitle)
      if (candidate) {
        const taken = await findBySlug(db, candidate)
        if (!taken) row.slug = candidate
      }
    }
  }
  return { rows }
}

const utmSystem = `You suggest UTM parameters for a Sharry short link. Reply with JSON only: {"utm_source":"","utm_medium":"","utm_campaign":""}. Use lowercase words and hyphens instead of spaces. Leave a field as an empty string when you are unsure. A newsletter is source newsletter and medium email. An Instagram bio is source instagram and medium social. Use the placement line when it is present. Otherwise infer from the page title.`

const routeSystem = `You draft Sharry routing rules. Reply with JSON only: {"rules":[{"name":"","destinationUrl":"https://example.com/de","conditions":[{"field":"country","operator":"is","values":["DE"]}]}]}. Fields: browser (chrome, safari, firefox, edge, opera, other), device (desktop, mobile, tablet, bot), operating_system (windows, macos, ios, android, linux, other), country (ISO code such as DE or US), referrer (google, facebook, instagram, none, or a hostname), utm_source, utm_medium, utm_campaign, utm_id, utm_term, utm_content. Operators are is and is_not. Use only http or https destinations written in the sentence. Omit a rule when the destination is not a full URL. iPhone means operating_system ios. Germany means country DE. At most 10 rules.`

const variantSystem = `You draft Sharry campaign variants. Reply with JSON only: {"description":"","variants":[{"name":"","utm_source":"","utm_medium":"","utm_campaign":""}]}. Split the sentence into separate variants. A newsletter is source newsletter and medium email. Instagram is source instagram and medium social. A poster is source poster and medium qr. description is one short sentence about those variants. At most 20 variants. Leave a UTM field empty when you are unsure.`

const titleSystem = `You name Sharry short links. Reply with JSON only: {"titles":["Summer sale"]}. One title per item, in the same order, at most 80 characters. Do not answer with only the site name.`

function summarySystem(locale: string): string {
  const language = locale === 'de' ? 'German' : 'English'
  return `You summarize Sharry analytics in ${language}. Reply with two or three sentences. Use only the facts. Include the click count exactly as given. Do not invent a cause, a chart, or a number that is not in the facts.`
}

function completionFor(config: ProviderConfig, fetchImpl?: typeof fetch, onModelUse?: ModelUse): TextComplete {
  return (system, user) => collectCompletion(config, system, user, fetchImpl, onModelUse)
}

async function runComplete(
  config: ProviderConfig,
  system: string,
  user: string,
  options: { complete?: TextComplete; fetchImpl?: typeof fetch; onModelUse?: ModelUse },
): Promise<string> {
  const complete = options.complete ?? completionFor(config, options.fetchImpl, options.onModelUse)
  const text = await complete(system, user)
  if (!text.trim()) throw new AppError(422, 'Could not read a suggestion.')
  return text
}

function ruleFromModel(value: unknown): RoutingRule | null {
  const record = asRecord(value)
  if (!record) return null
  const destinationUrl = textField(record.destinationUrl)
  if (!destinationSchema.safeParse(destinationUrl).success) return null
  const rawConditions = Array.isArray(record.conditions) ? record.conditions : []
  const conditions: RoutingRule['conditions'] = []
  for (const item of rawConditions) {
    if (conditions.length >= MAX_ROUTING_CONDITIONS) break
    const condition = asRecord(item)
    if (!condition) continue
    const field = textField(condition.field)
    if (!isRoutingField(field)) continue
    const operator = textField(condition.operator).toLowerCase().replace(/\s+/g, '_')
    if (!isRoutingOperator(operator)) continue
    const values: string[] = []
    const rawValues = Array.isArray(condition.values) ? condition.values : []
    for (const raw of rawValues) {
      if (values.length >= MAX_ROUTING_VALUES) break
      const canonical = canonicalRoutingValue(field, textField(raw))
      if (canonical && !values.includes(canonical)) values.push(canonical)
    }
    if (values.length === 0) continue
    conditions.push({ field, operator, values })
  }
  if (conditions.length === 0) return null
  const name = textField(record.name).slice(0, 80)
  return {
    id: randomUUID(),
    ...(name ? { name } : {}),
    destinationUrl,
    conditions,
  }
}

function variantFromModel(value: unknown): VariantDraft | null {
  const record = asRecord(value)
  if (!record) return null
  const name = textField(record.name).slice(0, 120)
  if (!name) return null
  return {
    name,
    utm: cleanUtm({
      utm_source: textField(record.utm_source),
      utm_medium: textField(record.utm_medium),
      utm_campaign: textField(record.utm_campaign),
    }),
  }
}

function titlesFromModel(value: unknown): string[] {
  const record = asRecord(value)
  const list = Array.isArray(value) ? value : record?.titles
  if (!Array.isArray(list)) return []
  return list.map((item) => textField(item))
}

function seriesMovement(series: { clicks: number }[]): { kind: 'short' | 'flat' | 'up' | 'down' | 'started'; percent: number } {
  if (series.length < 2) return { kind: 'short', percent: 0 }
  const mid = Math.floor(series.length / 2)
  const earlier = series.slice(0, mid).reduce((sum, row) => sum + row.clicks, 0)
  const later = series.slice(mid).reduce((sum, row) => sum + row.clicks, 0)
  if (earlier === later) return { kind: 'flat', percent: 0 }
  if (earlier === 0) return { kind: 'started', percent: 0 }
  const percent = Math.round((Math.abs(later - earlier) / earlier) * 100)
  return { kind: later > earlier ? 'up' : 'down', percent }
}

function movementSentence(locale: 'en' | 'de', movement: { kind: string; percent: number }, partial: boolean): string {
  const scope = partial
    ? locale === 'de'
      ? 'der letzten Tage im Diagramm'
      : 'the latest days on the chart'
    : locale === 'de'
      ? 'dieses Zeitraums'
      : 'this range'
  if (locale === 'de') {
    if (movement.kind === 'short') return 'Der Zeitraum ist zu kurz, um eine frühere und eine spätere Hälfte zu vergleichen.'
    if (movement.kind === 'flat') return `Die Klicks in der späteren Hälfte entsprechen der früheren Hälfte ${scope}.`
    if (movement.kind === 'started') return `Die Klicks beginnen in der späteren Hälfte ${scope}.`
    if (movement.kind === 'up') return `Die Klicks liegen in der späteren Hälfte ${scope} um ${movement.percent}% höher.`
    return `Die Klicks liegen in der späteren Hälfte ${scope} um ${movement.percent}% niedriger.`
  }
  if (movement.kind === 'short') return 'This range is too short to compare an earlier and a later half.'
  if (movement.kind === 'flat') return `Clicks in the later half match the earlier half of ${scope}.`
  if (movement.kind === 'started') return `Clicks start in the later half of ${scope}.`
  if (movement.kind === 'up') return `Clicks are up ${movement.percent}% in the later half of ${scope}.`
  return `Clicks are down ${movement.percent}% in the later half of ${scope}.`
}

function rangeDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.round((end - start) / 86_400_000) + 1
}

function topDimension(report: AnalyticsReport): { kind: 'referrer' | 'country' | 'UTM source' | 'UTM medium' | 'UTM campaign'; name: string; clicks: number } | null {
  const groups: { kind: 'referrer' | 'country' | 'UTM source' | 'UTM medium' | 'UTM campaign'; rows?: NamedClicks[] }[] = [
    { kind: 'referrer', rows: report.referrers },
    { kind: 'country', rows: report.countries },
    { kind: 'UTM source', rows: report.utmSources },
    { kind: 'UTM medium', rows: report.utmMediums },
    { kind: 'UTM campaign', rows: report.utmCampaigns },
  ]
  let best: { kind: 'referrer' | 'country' | 'UTM source' | 'UTM medium' | 'UTM campaign'; name: string; clicks: number } | null = null
  for (const group of groups) {
    for (const row of group.rows ?? []) {
      const name = row.name?.trim() ?? ''
      const clicks = row.clicks ?? 0
      if (!name || name.toLowerCase() === 'not set' || clicks <= 0) continue
      if (!best || clicks > best.clicks) best = { kind: group.kind, name, clicks }
    }
  }
  return best
}

function topSentence(
  locale: 'en' | 'de',
  top: { kind: string; name: string; clicks: number } | null,
): string {
  if (!top) {
    return locale === 'de'
      ? 'Kein Verweis, Land oder UTM-Wert sticht heraus.'
      : 'No referrer, country, or UTM value stands out.'
  }
  if (locale === 'de') {
    const kind =
      top.kind === 'referrer'
        ? 'Verweis'
        : top.kind === 'country'
          ? 'Land'
          : top.kind === 'UTM source'
            ? 'UTM-Quelle'
            : top.kind === 'UTM medium'
              ? 'UTM-Medium'
              : 'UTM-Kampagne'
    return `Der stärkste ${kind} ist ${top.name} mit ${top.clicks} Klicks.`
  }
  return `The top ${top.kind} is ${top.name} with ${top.clicks} clicks.`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}
