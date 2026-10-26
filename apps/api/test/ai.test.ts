import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiMessages, appSettings, clickEvents, links, trackingCampaigns } from '@sharry/database'
import type { AiProposal } from '@sharry/shared'
import { SHARRY_ONLY_RULE } from '../src/ai/prompt.ts'
import type { Actor } from '../src/auth.ts'
import { lookupForActor, queryAnalyticsForActor } from '../src/ai/tools.ts'
import { getSettings } from '../src/settings-store.ts'
import { decryptString } from '../src/support.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI settings and chat', () => {
  useTestApp()

  it('encrypts the API key and hides it from settings and status', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const saved = await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    expect(saved.statusCode).toBe(200)
    expect(JSON.stringify(saved.json())).not.toContain('sk-test-secret')
    expect(saved.json()).toMatchObject({ aiProvider: 'openai', aiModel: 'gpt-4.1-mini', aiApiKeySet: true })
    const stored = await ctx.db.select().from(appSettings).where(eq(appSettings.key, 'ai_api_key'))
    expect(decryptString(stored[0]?.value ?? '', ctx.env.ENCRYPTION_KEY)).toBe('sk-test-secret')

    const kept = await saveAi(admin.cookie, { aiApiKey: '' })
    expect(kept.json().aiApiKeySet).toBe(true)
    const cleared = await saveAi(admin.cookie, { aiApiKeyClear: true })
    expect(cleared.json().aiApiKeySet).toBe(false)

    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const status = await ctx.app.inject({ method: 'GET', url: '/api/ai/status', headers: { cookie: user.cookie } })
    expect(status.json()).toEqual({ available: true, provider: 'openai', model: 'gpt-4.1-mini' })
    expect(JSON.stringify(status.json())).not.toContain('sk-test-secret')
  })

  it('requires a base URL for an OpenAI-compatible provider', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const missing = await saveAi(admin.cookie, { aiProvider: 'openai_compatible', aiBaseUrl: '' })
    expect(missing.statusCode).toBe(400)
    const saved = await saveAi(admin.cookie, { aiProvider: 'openai_compatible', aiBaseUrl: 'http://127.0.0.1:11434/v1' })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().aiBaseUrl).toBe('http://127.0.0.1:11434/v1')
  })

  it('keeps old chats readable and blocks new replies when AI is off', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    expect(created.statusCode).toBe(200)
    const chatId = created.json().id as string
    await ctx.db.insert(aiMessages).values({ chatId, role: 'user', content: 'Where are my links?' })
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages`,
      headers: { cookie: user.cookie },
      payload: { content: 'Hello' },
    })
    expect(blocked.statusCode).toBe(503)
    const history = await ctx.app.inject({ method: 'GET', url: `/api/chats/${chatId}`, headers: { cookie: user.cookie } })
    expect(history.statusCode).toBe(200)
    expect(history.json().messages).toHaveLength(1)
    expect(history.json().messages[0].content).toBe('Where are my links?')

    const other = await createSessionUser(ctx, { username: 'bea', email: 'bea@example.com' })
    const hidden = await ctx.app.inject({ method: 'GET', url: `/api/chats/${chatId}`, headers: { cookie: other.cookie } })
    expect(hidden.statusCode).toBe(404)
  })

  it('asks before creating a link, then confirms it inside the chat', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const bodies: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''))
      return sse([
        { choices: [{ delta: { content: 'I prepared this link.' } }] },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'propose_link', arguments: JSON.stringify({ destinationUrl: 'https://example.com/docs', title: 'Docs' }) },
                  },
                ],
              },
            },
          ],
        },
      ])
    })
    const created = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const chatId = created.json().id as string
    const reply = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages`,
      headers: { cookie: user.cookie },
      payload: { content: 'Help me create a short link to https://example.com/docs called Docs.' },
    })
    expect(reply.statusCode).toBe(200)
    expect(bodies[0]).toContain(SHARRY_ONLY_RULE)
    const proposal = events(reply.body).find((event) => event.event === 'proposal')?.data.proposal
    if (!proposal) throw new Error('missing proposal')
    expect(proposal.status).toBe('pending')
    expect(await ctx.db.select().from(links)).toHaveLength(0)

    const confirmed = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/proposals/${proposal.id}/confirm`,
      headers: { cookie: user.cookie },
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().proposal.status).toBe('confirmed')
    expect(confirmed.json().proposal.result.path).toMatch(/^\/links\//)
    expect(confirmed.json().proposal.result.shortUrl).toContain('/s/')
    expect(await ctx.db.select().from(links)).toHaveLength(1)

    const dismissedChat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const dismissedId = dismissedChat.json().id as string
    const pending: AiProposal = {
      id: randomUUID(),
      tool: 'propose_link',
      args: { destinationUrl: 'https://example.com/nope' },
      status: 'pending',
    }
    await ctx.db.insert(aiMessages).values({ chatId: dismissedId, role: 'assistant', content: 'Ready', proposal: pending })
    const dismissed = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${dismissedId}/proposals/${pending.id}/dismiss`,
      headers: { cookie: user.cookie },
    })
    expect(dismissed.json().proposal.status).toBe('dismissed')
    expect(await ctx.db.select().from(links)).toHaveLength(1)
  })

  it('keeps analytics and page lookup inside the caller visibility', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'bea', email: 'bea@example.com' })
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/spring', title: 'Spring launch' },
    })
    expect(created.statusCode).toBe(200)
    const link = created.json() as { id: string; slug: string }
    await ctx.db.insert(clickEvents).values({
      linkId: link.id,
      occurredAt: new Date('2026-10-20T15:00:00.000Z'),
      browser: 'Chrome',
      operatingSystem: 'macOS',
      deviceType: 'desktop',
      isBot: false,
      anonymousVisitorId: 'visitor-1',
    })
    const settings = await getSettings(ctx.db, ctx.env)
    const range = { from: '2026-10-20', to: '2026-10-20' }
    const ownerReport = await queryAnalyticsForActor(ctx.db, actor(owner.id, 'ada', 'user'), settings, range)
    const otherReport = await queryAnalyticsForActor(ctx.db, actor(other.id, 'bea', 'user'), settings, range)
    expect(ownerReport).toMatchObject({ totalClicks: 1, path: '/analytics' })
    expect(otherReport).toMatchObject({ totalClicks: 0 })

    const hidden = await lookupForActor(ctx.db, actor(other.id, 'bea', 'user'), settings, { query: 'audit settings' })
    expect(hidden.matches.some((match) => match.path.startsWith('/admin'))).toBe(false)
    const visible = await lookupForActor(ctx.db, actor(admin.id, 'root', 'admin'), settings, { query: 'audit' })
    expect(visible.matches.some((match) => match.path === '/admin/audit')).toBe(true)
    const found = await lookupForActor(ctx.db, actor(owner.id, 'ada', 'user'), settings, { query: 'Spring' })
    expect(found.matches.some((match) => match.path === `/links/${link.id}`)).toBe(true)
    const missed = await lookupForActor(ctx.db, actor(other.id, 'bea', 'user'), settings, { query: 'Spring' })
    expect(missed.matches.some((match) => match.path === `/links/${link.id}`)).toBe(false)
  })

  it('creates a campaign for the caller and skips a link they cannot see', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'bea', email: 'bea@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/spring', slug: 'spring-link' },
    })
    expect(created.statusCode).toBe(200)
    const chat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: other.cookie } })
    const chatId = chat.json().id as string
    const proposal: AiProposal = {
      id: randomUUID(),
      tool: 'propose_campaign',
      args: { name: 'Launch', variants: [{ slug: 'spring-link', name: 'Poster' }] },
      status: 'pending',
    }
    await ctx.db.insert(aiMessages).values({ chatId, role: 'assistant', content: 'Ready', proposal })
    const confirmed = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/proposals/${proposal.id}/confirm`,
      headers: { cookie: other.cookie },
    })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().proposal.result.path).toMatch(/^\/campaigns\//)
    expect(confirmed.json().proposal.result.variants[0].error).toMatch(/not found/i)
    const campaigns = await ctx.db.select().from(trackingCampaigns)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0]?.userId).toBe(other.id)
  })
})

async function saveAi(cookie: string, fields: Record<string, unknown> = {}) {
  const ctx = await getContext()
  return ctx.app.inject({
    method: 'PATCH',
    url: '/api/admin/settings',
    headers: { cookie },
    payload: { aiProvider: 'openai', aiModel: 'gpt-4.1-mini', ...fields },
  })
}

function actor(id: string, username: string, role: 'admin' | 'user'): Actor {
  return {
    id,
    username,
    email: `${username}@example.com`,
    role,
    isActive: true,
    totpEnabled: true,
    mustChangePassword: false,
    scope: 'full',
  }
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function events(payload: string): { event: string; data: { proposal?: AiProposal; text?: string } }[] {
  return payload
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? 'message'
      const data = block.match(/^data: (.+)$/m)?.[1] ?? '{}'
      return { event, data: JSON.parse(data) as { proposal?: AiProposal; text?: string } }
    })
}
