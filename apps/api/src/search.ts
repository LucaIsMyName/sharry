import type { FastifyInstance } from 'fastify'
import { sql, type SQL } from 'drizzle-orm'
import type { Database } from '@sharry/database'
import { requireUser, type Actor } from './auth.ts'
import { visibleLinksWhere, visibleOwnedWhere } from './links.ts'
import { getSettings, rowsOf, type AppSettings } from './settings-store.ts'

const groupLimit = 8

const stopwords = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'and', 'or', 'me', 'my', 'please', 'show', 'get', 'give', 'want', 'with', 'on', 'in', 'about',
  'der', 'die', 'das', 'für', 'fuer', 'bitte', 'zeig', 'zeige', 'mir', 'und', 'oder', 'ein', 'eine', 'den', 'dem', 'mit', 'von', 'ich',
])

export type SearchLink = {
  id: string
  title: string | null
  slug: string
  destinationUrl: string
  description: string | null
  icon: string | null
}

export type SearchCampaign = {
  id: string
  name: string
  description: string | null
  icon: string | null
}

export type SearchChat = {
  id: string
  title: string
  snippet: string | null
}

export type SearchMedia = { id: string; name: string; kind: string; folderId: string | null }

export type SearchUser = { id: string; username: string; email: string }
export type SearchDomain = { id: string; hostname: string }
export type SearchApiKey = { id: string; name: string; tokenPrefix: string }
export type SearchAudit = {
  id: string
  action: string
  actorUsername: string | null
  entityType: string
  entityId: string | null
  createdAt: string
}

export type SearchResults = {
  links: SearchLink[]
  campaigns: SearchCampaign[]
  chats: SearchChat[]
  media: SearchMedia[]
  users?: SearchUser[]
  domains?: SearchDomain[]
  apiKeys?: SearchApiKey[]
  audit?: SearchAudit[]
}

export function registerSearchRoutes(app: FastifyInstance): void {
  /**
   * Search records the caller is allowed to see.
   * @route GET /api/search
   * @tag Search
   * @auth api-key or session
   * @query q string Text to match. A blank value returns empty groups.
   * @response 200 Links, campaigns, chats, and media. Administrators also receive users, domains, API keys, and audit rows. Secrets are omitted.
   */
  app.get('/api/search', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { q?: string }
    const settings = await getSettings(app.db, app.env)
    return searchForActor(app.db, actor, settings, query.q ?? '')
  })
}

export async function searchForActor(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  query: string | string[],
): Promise<SearchResults> {
  const phrases = (Array.isArray(query) ? query : [query]).map((item) => item.trim()).filter(Boolean).slice(0, 6)
  const admin = actor.role === 'admin'
  const usable = phrases.filter((phrase) => queryWords(phrase).length > 0 || fold(phrase).length > 0)
  if (usable.length === 0) return emptySearch(admin)
  const found = await Promise.all(usable.map((phrase) => searchPhrase(db, actor, settings, phrase)))
  const ranked = usable
    .map((phrase, index) => ({ words: queryWords(phrase).length, result: found[index] }))
    .sort((left, right) => right.words - left.words)
  return mergeResults(
    ranked.map((item) => item.result).filter((item): item is SearchResults => Boolean(item)),
    admin,
  )
}

export function searchPhrases(message: string): string[] {
  const words = message.trim().split(/\s+/).filter(Boolean).slice(0, 24)
  const phrases: string[] = []
  const add = (value: string[]) => {
    const phrase = trimStopwords(value).join(' ')
    if (!phrase || phrases.includes(phrase)) return
    phrases.push(phrase)
  }
  if (words.length > 0 && words.length <= 6) add(words)
  for (const size of [2, 3]) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const window = words.slice(index, index + size)
      if (window.every((word) => isStopword(word))) continue
      add(window)
    }
  }
  return phrases.slice(0, 6)
}

export function textMatches(query: string, field: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return false
  const foldedQuery = fold(trimmed)
  if (foldedQuery && fold(field).includes(foldedQuery)) return true
  const words = queryWords(trimmed)
  if (words.length === 0) return false
  const haystack = field.toLowerCase()
  const tokens = haystack.split(/[^a-z0-9]+/).filter((token) => token.length > 0)
  return words.every((word) => wordMatches(word, haystack, tokens))
}

function emptySearch(admin: boolean): SearchResults {
  const base = { links: [], campaigns: [], chats: [], media: [] }
  if (!admin) return base
  return { ...base, users: [], domains: [], apiKeys: [], audit: [] }
}

function mergeResults(results: SearchResults[], admin: boolean): SearchResults {
  const merged = emptySearch(admin)
  for (const result of results) {
    merged.links = mergeById(merged.links, result.links)
    merged.campaigns = mergeById(merged.campaigns, result.campaigns)
    merged.chats = mergeById(merged.chats, result.chats)
    merged.media = mergeById(merged.media, result.media)
    if (!admin) continue
    merged.users = mergeById(merged.users ?? [], result.users ?? [])
    merged.domains = mergeById(merged.domains ?? [], result.domains ?? [])
    merged.apiKeys = mergeById(merged.apiKeys ?? [], result.apiKeys ?? [])
    merged.audit = mergeById(merged.audit ?? [], result.audit ?? [])
  }
  return merged
}

function mergeById<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((item) => item.id))
  const merged = [...current]
  for (const item of next) {
    if (seen.has(item.id) || merged.length >= groupLimit) continue
    seen.add(item.id)
    merged.push(item)
  }
  return merged
}

async function searchPhrase(db: Database, actor: Actor, settings: AppSettings, phrase: string): Promise<SearchResults> {
  const admin = actor.role === 'admin'
  const visibility = visibleLinksWhere(actor, settings, 'links')
  const owner = actor.role === 'admin' ? sql`true` : sql`tracking_campaigns.user_id = ${actor.id}`
  const mediaVisibility = visibleOwnedWhere(actor, settings, sql`media_assets.user_id`)
  const [links, campaigns, chats, media, users, domains, apiKeys, audit] = await Promise.all([
    searchLinks(db, phrase, visibility),
    searchCampaigns(db, phrase, owner),
    searchChats(db, actor.id, phrase),
    searchMedia(db, phrase, mediaVisibility),
    admin ? searchUsers(db, phrase) : Promise.resolve([]),
    admin ? searchDomains(db, phrase) : Promise.resolve([]),
    admin ? searchApiKeys(db, phrase) : Promise.resolve([]),
    admin ? searchAudit(db, phrase) : Promise.resolve([]),
  ])
  return { links, campaigns, chats, media, ...(admin ? { users, domains, apiKeys, audit } : {}) }
}

async function searchLinks(db: Database, phrase: string, visibility: SQL | null): Promise<SearchLink[]> {
  const haystack = sql`lower(concat_ws(' ',
    links.slug,
    coalesce(links.title, ''),
    coalesce(links.description, ''),
    links.destination_url,
    coalesce(links.routing_rules::text, ''),
    coalesce((
      select string_agg(concat_ws(' ', utm_source, utm_medium, utm_campaign, utm_id, utm_term, utm_content), ' ')
      from tracking_configs
      where tracking_configs.link_id = links.id
    ), ''),
    coalesce((
      select string_agg(qr_codes.name, ' ')
      from qr_codes
      where qr_codes.link_id = links.id
    ), '')
  ))`
  const rows = rowsOf<{
    id: string
    title: string | null
    slug: string
    destination_url: string
    description: string | null
    icon: string | null
  }>(
    await db.execute(sql`
      select id::text as id, title, slug, destination_url, description, icon
      from (
        select links.id, links.title, links.slug, links.destination_url, links.description, links.icon, links.updated_at,
               ${haystack} as haystack
        from links
        where (${visibility ?? sql`true`})
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by updated_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    destinationUrl: row.destination_url,
    description: row.description,
    icon: row.icon,
  }))
}

async function searchCampaigns(db: Database, phrase: string, owner: SQL): Promise<SearchCampaign[]> {
  const haystack = sql`lower(concat_ws(' ',
    tracking_campaigns.name,
    coalesce(tracking_campaigns.description, ''),
    coalesce((
      select string_agg(tracking_variants.name, ' ')
      from tracking_variants
      where tracking_variants.campaign_id = tracking_campaigns.id
    ), '')
  ))`
  return rowsOf<SearchCampaign>(
    await db.execute(sql`
      select id::text as id, name, description, icon
      from (
        select tracking_campaigns.id, tracking_campaigns.name, tracking_campaigns.description, tracking_campaigns.icon, tracking_campaigns.updated_at,
               ${haystack} as haystack
        from tracking_campaigns
        where (${owner})
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by updated_at desc
      limit ${groupLimit}
    `),
  )
}

async function searchChats(db: Database, userId: string, phrase: string): Promise<SearchChat[]> {
  const haystack = sql`lower(concat_ws(' ',
    ai_chats.title,
    coalesce((
      select string_agg(ai_messages.content, ' ')
      from ai_messages
      where ai_messages.chat_id = ai_chats.id
    ), '')
  ))`
  const rows = rowsOf<{ id: string; title: string; snippet: string | null }>(
    await db.execute(sql`
      select id::text as id, title, (
        select left(ai_messages.content, 140)
        from ai_messages
        where ai_messages.chat_id = candidate.id
          and ${phraseSql(sql`lower(ai_messages.content)`, phrase)}
        order by ai_messages.created_at desc
        limit 1
      ) as snippet
      from (
        select ai_chats.id, ai_chats.title, ai_chats.updated_at, ${haystack} as haystack
        from ai_chats
        where ai_chats.user_id = ${userId}
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by updated_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: row.snippet?.replace(/\s+/g, ' ').trim() || null,
  }))
}

async function searchMedia(db: Database, phrase: string, visibility: SQL | null): Promise<SearchMedia[]> {
  const rows = rowsOf<{ id: string; name: string; kind: string; folder_id: string | null }>(
    await db.execute(sql`
      select id::text as id, name, kind, folder_id::text as folder_id
      from (
        select media_assets.id, media_assets.name, media_assets.kind, media_assets.folder_id, media_assets.updated_at,
               lower(concat_ws(' ', media_assets.name, coalesce(media_assets.alt, ''), coalesce(media_assets.title, ''))) as haystack
        from media_assets
        where (${visibility ?? sql`true`})
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by updated_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, folderId: row.folder_id }))
}

async function searchUsers(db: Database, phrase: string): Promise<SearchUser[]> {
  return rowsOf<SearchUser>(
    await db.execute(sql`
      select id::text as id, username, email
      from (
        select id, username, email, lower(concat_ws(' ', username, email)) as haystack
        from users
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by username
      limit ${groupLimit}
    `),
  )
}

async function searchDomains(db: Database, phrase: string): Promise<SearchDomain[]> {
  return rowsOf<SearchDomain>(
    await db.execute(sql`
      select id::text as id, hostname
      from (
        select id, hostname, lower(hostname) as haystack
        from redirect_domains
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by hostname
      limit ${groupLimit}
    `),
  )
}

async function searchApiKeys(db: Database, phrase: string): Promise<SearchApiKey[]> {
  const rows = rowsOf<{ id: string; name: string; token_prefix: string }>(
    await db.execute(sql`
      select id::text as id, name, token_prefix
      from (
        select id, name, token_prefix, created_at, lower(concat_ws(' ', name, token_prefix)) as haystack
        from api_keys
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by created_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({ id: row.id, name: row.name, tokenPrefix: row.token_prefix }))
}

async function searchAudit(db: Database, phrase: string): Promise<SearchAudit[]> {
  const rows = rowsOf<{
    id: string
    action: string
    actor_username: string | null
    entity_type: string
    entity_id: string | null
    created_at: Date | string
  }>(
    await db.execute(sql`
      select id::text as id, action, actor_username, entity_type, entity_id, created_at
      from (
        select audit_logs.id, audit_logs.action, users.username as actor_username, audit_logs.entity_type,
               audit_logs.entity_id, audit_logs.created_at,
               lower(concat_ws(' ',
                 audit_logs.action,
                 audit_logs.entity_type,
                 coalesce(audit_logs.entity_id, ''),
                 coalesce(users.username, ''),
                 coalesce(audit_logs.metadata::text, '')
               )) as haystack
        from audit_logs
        left join users on users.id = audit_logs.actor_user_id
      ) as candidate
      where ${phraseSql(sql`candidate.haystack`, phrase)}
      order by created_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorUsername: row.actor_username,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

function phraseSql(column: SQL, query: string): SQL {
  const words = queryWords(query)
  const folded = fold(query)
  const parts: SQL[] = []
  if (folded) {
    parts.push(sql`regexp_replace(${column}, '[-_[:space:]]+', '', 'g') like ${likeContains(folded)} escape '\\'`)
  }
  if (words.length > 0) parts.push(sql`(${sql.join(words.map((word) => wordSql(column, word)), sql` and `)})`)
  if (parts.length === 0) return sql`false`
  return sql`(${sql.join(parts, sql` or `)})`
}

function wordSql(column: SQL, word: string): SQL {
  const contains = sql`${column} ilike ${likeContains(word)} escape '\\'`
  if (word.length < 4) return contains
  const swaps = transpositions(word)
  const deletions = deletionsOf(word)
  return sql`(
    ${contains}
    or exists (
      select 1
      from regexp_split_to_table(${column}, '[^a-z0-9]+') as token
      where token <> ''
        and char_length(token) between ${word.length - 1} and ${word.length + 1}
        and (
          token in (${sql.join(swaps.map((value) => sql`${value}`), sql`, `)})
          or token in (${sql.join(deletions.map((value) => sql`${value}`), sql`, `)})
          or (
            char_length(token) = ${word.length}
            and (
              select count(*)::int
              from generate_series(1, ${word.length}) as pos
              where substring(token from pos for 1) <> substring(${word} from pos for 1)
            ) = 1
          )
          or (
            char_length(token) = ${word.length + 1}
            and exists (
              select 1
              from generate_series(1, char_length(token)) as pos
              where overlay(token placing '' from pos for 1) = ${word}
            )
          )
        )
    )
  )`
}

function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9@._-]+|[^a-z0-9@._-]+$/g, ''))
    .filter((word) => word.length > 0)
}

function wordMatches(word: string, haystack: string, tokens: string[]): boolean {
  if (haystack.includes(word)) return true
  if (word.length < 4) return false
  return tokens.some((token) => withinOneEdit(word, token))
}

function withinOneEdit(left: string, right: string): boolean {
  if (left === right) return true
  const a = left.length
  const b = right.length
  if (Math.abs(a - b) > 1) return false
  if (a === b) {
    let differences = 0
    let swapped = false
    for (let index = 0; index < a; index += 1) {
      if (left[index] === right[index]) continue
      differences += 1
      if (differences > 2) return false
      if (index + 1 < a && left[index] === right[index + 1] && left[index + 1] === right[index]) swapped = true
    }
    return differences === 1 || (differences === 2 && swapped)
  }
  const [shorter, longer] = a < b ? [left, right] : [right, left]
  let shortIndex = 0
  let longIndex = 0
  let skipped = false
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
      longIndex += 1
      continue
    }
    if (skipped) return false
    skipped = true
    longIndex += 1
  }
  return true
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, '')
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

function transpositions(word: string): string[] {
  const variants = new Set<string>([word])
  for (let index = 0; index < word.length - 1; index += 1) {
    const chars = [...word]
    const current = chars[index]
    const next = chars[index + 1]
    if (current === undefined || next === undefined) continue
    chars[index] = next
    chars[index + 1] = current
    variants.add(chars.join(''))
  }
  return [...variants]
}

function deletionsOf(word: string): string[] {
  const variants = new Set<string>()
  for (let index = 0; index < word.length; index += 1) variants.add(word.slice(0, index) + word.slice(index + 1))
  return [...variants]
}

function trimStopwords(words: string[]): string[] {
  let start = 0
  let end = words.length
  while (start < end && isStopword(words[start] ?? '')) start += 1
  while (end > start && isStopword(words[end - 1] ?? '')) end -= 1
  return words.slice(start, end)
}

function isStopword(word: string): boolean {
  const bare = word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  return stopwords.has(bare)
}
