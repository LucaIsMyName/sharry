import type { FastifyInstance } from 'fastify'
import { sql, type SQL } from 'drizzle-orm'
import type { Database } from '@sharry/database'
import { requireUser, type Actor } from './auth.ts'
import { visibleLinksWhere } from './links.ts'
import { getSettings, rowsOf } from './settings-store.ts'

const groupLimit = 8

type SearchLink = {
  id: string
  title: string | null
  slug: string
  destinationUrl: string
  description: string | null
}

type SearchCampaign = {
  id: string
  name: string
  description: string | null
}

type SearchChat = {
  id: string
  title: string
  snippet: string | null
}

type SearchUser = { id: string; username: string; email: string }
type SearchDomain = { id: string; hostname: string }
type SearchApiKey = { id: string; name: string; tokenPrefix: string }
type SearchAudit = {
  id: string
  action: string
  actorUsername: string | null
  entityType: string
  entityId: string | null
  createdAt: string
}

export function registerSearchRoutes(app: FastifyInstance): void {
  /**
   * Search records the caller is allowed to see.
   * @route GET /api/search
   * @tag Search
   * @auth api-key or session
   * @query q string Text to match. A blank value returns empty groups.
   * @response 200 Links, campaigns, and chats. Administrators also receive users, domains, API keys, and audit rows. Secrets are omitted.
   */
  app.get('/api/search', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const query = request.query as { q?: string }
    const pattern = likePattern(query.q)
    const admin = actor.role === 'admin'
    if (!pattern) return emptySearch(admin)
    const settings = await getSettings(app.db, app.env)
    const visibility = visibleLinksWhere(actor, settings, 'links')
    const [links, campaigns, chats, users, domains, apiKeys, audit] = await Promise.all([
      searchLinks(app.db, pattern, visibility),
      searchCampaigns(app.db, actor, pattern),
      searchChats(app.db, actor.id, pattern),
      admin ? searchUsers(app.db, pattern) : Promise.resolve([]),
      admin ? searchDomains(app.db, pattern) : Promise.resolve([]),
      admin ? searchApiKeys(app.db, pattern) : Promise.resolve([]),
      admin ? searchAudit(app.db, pattern) : Promise.resolve([]),
    ])
    return {
      links,
      campaigns,
      chats,
      ...(admin ? { users, domains, apiKeys, audit } : {}),
    }
  })
}

function emptySearch(admin: boolean) {
  const base = { links: [], campaigns: [], chats: [] }
  if (!admin) return base
  return { ...base, users: [], domains: [], apiKeys: [], audit: [] }
}

function likePattern(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim().slice(0, 200)
  if (!trimmed) return null
  return `%${trimmed.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

async function searchLinks(db: Database, pattern: string, visibility: SQL | null): Promise<SearchLink[]> {
  const rows = rowsOf<{
    id: string
    title: string | null
    slug: string
    destination_url: string
    description: string | null
  }>(
    await db.execute(sql`
      select id::text as id, title, slug, destination_url, description
      from links
      where (${visibility ?? sql`true`})
        and (
          slug ilike ${pattern} escape '\\'
          or coalesce(title, '') ilike ${pattern} escape '\\'
          or coalesce(description, '') ilike ${pattern} escape '\\'
          or destination_url ilike ${pattern} escape '\\'
          or routing_rules::text ilike ${pattern} escape '\\'
          or exists (
            select 1 from tracking_configs
            where tracking_configs.link_id = links.id
              and (
                coalesce(utm_source, '') ilike ${pattern} escape '\\'
                or coalesce(utm_medium, '') ilike ${pattern} escape '\\'
                or coalesce(utm_campaign, '') ilike ${pattern} escape '\\'
                or coalesce(utm_id, '') ilike ${pattern} escape '\\'
                or coalesce(utm_term, '') ilike ${pattern} escape '\\'
                or coalesce(utm_content, '') ilike ${pattern} escape '\\'
              )
          )
          or exists (
            select 1 from qr_codes
            where qr_codes.link_id = links.id
              and name ilike ${pattern} escape '\\'
          )
        )
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
  }))
}

async function searchCampaigns(db: Database, actor: Actor, pattern: string): Promise<SearchCampaign[]> {
  const owner = actor.role === 'admin' ? sql`true` : sql`user_id = ${actor.id}`
  const rows = rowsOf<{ id: string; name: string; description: string | null }>(
    await db.execute(sql`
      select id::text as id, name, description
      from tracking_campaigns
      where (${owner})
        and (
          name ilike ${pattern} escape '\\'
          or coalesce(description, '') ilike ${pattern} escape '\\'
          or exists (
            select 1 from tracking_variants
            where tracking_variants.campaign_id = tracking_campaigns.id
              and tracking_variants.name ilike ${pattern} escape '\\'
          )
        )
      order by updated_at desc
      limit ${groupLimit}
    `),
  )
  return rows
}

async function searchChats(db: Database, userId: string, pattern: string): Promise<SearchChat[]> {
  const rows = rowsOf<{ id: string; title: string; snippet: string | null }>(
    await db.execute(sql`
      select id::text as id, title, (
        select left(m.content, 140)
        from ai_messages m
        where m.chat_id = ai_chats.id
          and m.content ilike ${pattern} escape '\\'
        order by m.created_at desc
        limit 1
      ) as snippet
      from ai_chats
      where user_id = ${userId}
        and (
          title ilike ${pattern} escape '\\'
          or exists (
            select 1 from ai_messages m
            where m.chat_id = ai_chats.id
              and m.content ilike ${pattern} escape '\\'
          )
        )
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

async function searchUsers(db: Database, pattern: string): Promise<SearchUser[]> {
  return rowsOf<SearchUser>(
    await db.execute(sql`
      select id::text as id, username, email
      from users
      where username ilike ${pattern} escape '\\' or email ilike ${pattern} escape '\\'
      order by username
      limit ${groupLimit}
    `),
  )
}

async function searchDomains(db: Database, pattern: string): Promise<SearchDomain[]> {
  return rowsOf<SearchDomain>(
    await db.execute(sql`
      select id::text as id, hostname
      from redirect_domains
      where hostname ilike ${pattern} escape '\\'
      order by hostname
      limit ${groupLimit}
    `),
  )
}

async function searchApiKeys(db: Database, pattern: string): Promise<SearchApiKey[]> {
  const rows = rowsOf<{ id: string; name: string; token_prefix: string }>(
    await db.execute(sql`
      select id::text as id, name, token_prefix
      from api_keys
      where name ilike ${pattern} escape '\\' or token_prefix ilike ${pattern} escape '\\'
      order by created_at desc
      limit ${groupLimit}
    `),
  )
  return rows.map((row) => ({ id: row.id, name: row.name, tokenPrefix: row.token_prefix }))
}

async function searchAudit(db: Database, pattern: string): Promise<SearchAudit[]> {
  const rows = rowsOf<{
    id: string
    action: string
    actor_username: string | null
    entity_type: string
    entity_id: string | null
    created_at: Date | string
  }>(
    await db.execute(sql`
      select audit_logs.id::text as id,
             audit_logs.action,
             users.username as actor_username,
             audit_logs.entity_type,
             audit_logs.entity_id,
             audit_logs.created_at
      from audit_logs
      left join users on users.id = audit_logs.actor_user_id
      where audit_logs.action ilike ${pattern} escape '\\'
         or audit_logs.entity_type ilike ${pattern} escape '\\'
         or coalesce(audit_logs.entity_id, '') ilike ${pattern} escape '\\'
         or coalesce(users.username, '') ilike ${pattern} escape '\\'
         or audit_logs.metadata::text ilike ${pattern} escape '\\'
      order by audit_logs.created_at desc
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
