import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiChats, aiMessages, aiUsageEvents, appSettings, clickEvents, links, qrCodes, trackingCampaigns, trackingConfigs } from '@sharry/database'
import type { AiProposal, ChatBlock } from '@sharry/shared'
import { pageIo } from '../src/ai/page-slug.ts'
import { SHARRY_ONLY_RULE } from '../src/ai/prompt.ts'
import type { Actor } from '../src/auth.ts'
import { formBlockFromCall, lookupForActor, queryAnalyticsForActor } from '../src/ai/tools.ts'
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

  it('tests an unsaved key without storing it', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const seen: { auth?: string; model?: string } = {}
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      seen.auth = headers.get('authorization') ?? ''
      seen.model = JSON.parse(String(init?.body ?? '{}')).model as string
      return sse([{ choices: [{ delta: { content: 'ok' } }] }])
    })
    const tested = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/ai/test',
      headers: { cookie: admin.cookie },
      payload: { aiProvider: 'openai', aiModel: 'gpt-4.1-mini', aiApiKey: 'sk-unsaved' },
    })
    expect(tested.statusCode).toBe(200)
    expect(tested.json()).toEqual({ ok: true })
    expect(seen.auth).toBe('Bearer sk-unsaved')
    expect(seen.model).toBe('gpt-4.1-mini')
    const settings = await ctx.app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie: admin.cookie } })
    expect(settings.json().aiApiKeySet).toBe(false)
    expect(JSON.stringify(tested.json())).not.toContain('sk-unsaved')

    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/api/admin/ai/test',
      headers: { cookie: admin.cookie },
      payload: { aiProvider: 'openai', aiModel: 'gpt-4.1-mini' },
    })
    expect(missing.statusCode).toBe(400)
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

  it('renames a chat and refuses another person', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const chatId = created.json().id as string
    const renamed = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/chats/${chatId}`,
      headers: { cookie: user.cookie },
      payload: { title: '  Spring launch  ' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().title).toBe('Spring launch')
    const [stored] = await ctx.db.select().from(aiChats).where(eq(aiChats.id, chatId))
    expect(stored?.title).toBe('Spring launch')
    const blank = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/chats/${chatId}`,
      headers: { cookie: user.cookie },
      payload: { title: '   ' },
    })
    expect(blank.statusCode).toBe(400)
    const other = await createSessionUser(ctx, { username: 'bea', email: 'bea@example.com' })
    const hidden = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/chats/${chatId}`,
      headers: { cookie: other.cookie },
      payload: { title: 'Taken' },
    })
    expect(hidden.statusCode).toBe(404)
    const [still] = await ctx.db.select().from(aiChats).where(eq(aiChats.id, chatId))
    expect(still?.title).toBe('Spring launch')
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

  it('shows a link form before creating the link or a QR code', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    vi.stubGlobal(
      'fetch',
      async () =>
        sse([
          { choices: [{ delta: { content: 'Here is the form.' } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, id: 'call_form', function: { name: 'show_link_form', arguments: '{}' } }],
                },
              },
            ],
          },
        ]),
    )
    const created = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const chatId = created.json().id as string
    const reply = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages`,
      headers: { cookie: user.cookie },
      payload: { content: 'Help me create a short link.' },
    })
    expect(reply.statusCode).toBe(200)
    const block = events(reply.body).find((event) => event.event === 'block')?.data.block
    if (!block || block.type !== 'form') throw new Error('missing form')
    expect(block.form).toBe('link')
    expect(await ctx.db.select().from(links)).toHaveLength(0)

    const submitted = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/forms/${block.id}/submit`,
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/docs', slug: 'guide', createQr: true },
    })
    expect(submitted.statusCode).toBe(200)
    expect(submitted.json().message.blocks[0].status).toBe('submitted')
    expect(submitted.json().message.blocks[0].result.shortUrl).toContain('/s/guide')
    expect(submitted.json().message.blocks[0].result.qrCreated).toBe(true)
    expect(submitted.json().message.blocks[0].result.path).toMatch(/^\/links\//)
    expect(await ctx.db.select().from(qrCodes)).toHaveLength(1)

    const plain = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const plainId = plain.json().id as string
    const formId = randomUUID()
    const pending: ChatBlock = { type: 'form', id: formId, form: 'link', status: 'pending' }
    await ctx.db.insert(aiMessages).values({ chatId: plainId, role: 'assistant', content: 'Form', blocks: [pending] })
    const withoutQr = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${plainId}/forms/${formId}/submit`,
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/plain', createQr: false },
    })
    expect(withoutQr.json().message.blocks[0].result.qrCreated).toBe(false)
    expect(await ctx.db.select().from(qrCodes)).toHaveLength(1)

    const conflictId = randomUUID()
    const conflict: ChatBlock = { type: 'form', id: conflictId, form: 'link', status: 'pending' }
    await ctx.db.insert(aiMessages).values({ chatId: plainId, role: 'assistant', content: 'Again', blocks: [conflict] })
    const taken = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${plainId}/forms/${conflictId}/submit`,
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/again', slug: 'guide' },
    })
    expect(taken.statusCode).toBe(200)
    expect(taken.json().message.blocks[0].status).toBe('pending')
    expect(taken.json().message.blocks[0].result.error).toMatch(/already in use/i)
    expect(await ctx.db.select().from(links)).toHaveLength(2)
  })

  it('does not read a page when AI is off', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(String(url))
      return new Response('no')
    })
    const suggested = await ctx.app.inject({
      method: 'POST',
      url: '/api/ai/suggest-slug',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/pricing/' },
    })
    expect(suggested.statusCode).toBe(503)
    expect(fetched).toEqual([])
  })

  it('suggests a free slug from the destination page and keeps a typed slug', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const lookup = pageIo.lookup
    pageIo.lookup = async () => [{ address: '93.184.216.34', family: 4 }]
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(String(url))
      if (String(url).includes('example.com')) {
        return new Response('<html><head><title>Pricing | ipstack</title></head></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      }
      const providerCalls = fetched.filter((item) => !item.includes('example.com')).length
      const args =
        providerCalls === 1
          ? { destinationUrl: 'https://example.com/pricing/' }
          : { destinationUrl: 'https://example.com/pricing/', slug: 'mine' }
      return sse([
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: 'call_form', function: { name: 'show_link_form', arguments: JSON.stringify(args) } }],
              },
            },
          ],
        },
      ])
    })
    try {
      const suggested = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-slug',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing/' },
      })
      expect(suggested.statusCode).toBe(200)
      expect(suggested.json()).toEqual({ slug: 'pricing-ipstack', title: 'Pricing | ipstack', fromTitle: true })
      expect(await ctx.db.select().from(links)).toHaveLength(0)

      const created = await ctx.app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing', slug: 'pricing-ipstack' },
      })
      expect(created.statusCode).toBe(200)
      const next = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-slug',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing/' },
      })
      expect(next.json()).toEqual({ slug: 'example-pricing', title: 'Pricing | ipstack', fromTitle: false })
      const own = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-slug',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing/', linkId: created.json().id },
      })
      expect(own.json()).toEqual({ slug: 'pricing-ipstack', title: 'Pricing | ipstack', fromTitle: true })

      const local = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-slug',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'http://127.0.0.1/secret' },
      })
      expect(local.statusCode).toBe(422)
      expect(fetched.some((url) => url.includes('127.0.0.1'))).toBe(false)

      const chat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
      const reply = await ctx.app.inject({
        method: 'POST',
        url: `/api/chats/${chat.json().id}/messages`,
        headers: { cookie: user.cookie },
        payload: { content: 'Make me a short url for https://example.com/pricing/' },
      })
      const block = events(reply.body).find((event) => event.event === 'block')?.data.block
      if (!block || block.type !== 'form') throw new Error('missing form')
      expect(block.prefill).toMatchObject({ slug: 'example-pricing', suggested: true, fromTitle: false })

      const kept = await ctx.app.inject({
        method: 'POST',
        url: `/api/chats/${chat.json().id}/messages`,
        headers: { cookie: user.cookie },
        payload: { content: 'Use the slug mine.' },
      })
      const typed = events(kept.body).find((event) => event.event === 'block')?.data.block
      if (!typed || typed.type !== 'form') throw new Error('missing typed form')
      expect(typed.prefill).toMatchObject({ slug: 'mine' })
      expect(typed.prefill?.suggested).toBeUndefined()
    } finally {
      pageIo.lookup = lookup
    }
  })

  it('suggests UTM, routes, a summary, variants, and pasted links without storing them', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/ai/suggest-utm',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/pricing' },
    })
    expect(blocked.statusCode).toBe(503)
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const lookup = pageIo.lookup
    pageIo.lookup = async () => [{ address: '93.184.216.34', family: 4 }]
    const replies = new Map<string, string>()
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.includes('api.openai.com')) {
        const prompt = String(init?.body ?? '')
        const content = prompt.includes('routing rules')
          ? JSON.stringify({
              rules: [
                {
                  name: 'Germany',
                  destinationUrl: 'https://example.com/de',
                  conditions: [{ field: 'country', operator: 'is', values: ['DE'] }],
                },
              ],
            })
          : prompt.includes('campaign variants')
            ? JSON.stringify({
                description: 'Launch copies.',
                variants: [{ name: 'Newsletter', utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'launch' }],
              })
            : prompt.includes('name Sharry short links')
              ? JSON.stringify({ titles: ['October pricing'] })
              : prompt.includes('summarize Sharry analytics')
                ? 'From the range: 0 clicks.'
                : JSON.stringify({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'october' })
        replies.set(prompt.slice(0, 80), content)
        return sse([{ choices: [{ delta: { content } }] }])
      }
      if (target.includes('/guide')) {
        return new Response('<html><title>Pricing guide</title></html>', { status: 200, headers: { 'content-type': 'text/html' } })
      }
      return new Response('<html><title>Example</title></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    })
    try {
      const utm = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-utm',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing', placement: 'October newsletter' },
      })
      expect(utm.statusCode).toBe(200)
      expect(utm.json()).toEqual({ utm: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'october' } })

      const routes = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-routes',
        headers: { cookie: user.cookie },
        payload: { instruction: 'Germany goes to https://example.com/de' },
      })
      expect(routes.statusCode).toBe(200)
      expect(routes.json().rules[0]).toMatchObject({
        name: 'Germany',
        destinationUrl: 'https://example.com/de',
        conditions: [{ field: 'country', operator: 'is', values: ['DE'] }],
      })

      const summary = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/summarize-analytics',
        headers: { cookie: user.cookie },
        payload: { from: '2026-10-01', to: '2026-10-20' },
      })
      expect(summary.statusCode).toBe(200)
      expect(summary.json().summary).toBe('From the range: 0 clicks.')
      expect(summary.json().from).toBe('2026-10-01')
      expect(summary.json().to).toBe('2026-10-20')

      const variants = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-variants',
        headers: { cookie: user.cookie },
        payload: { instruction: 'newsletter' },
      })
      expect(variants.statusCode).toBe(200)
      expect(variants.json()).toEqual({
        description: 'Launch copies.',
        variants: [{ name: 'Newsletter', utm: { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'launch' } }],
      })

      const pasted = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-links',
        headers: { cookie: user.cookie },
        payload: { urls: ['https://example.com/pricing', 'https://example.com/guide', 'not a url'] },
      })
      expect(pasted.statusCode).toBe(200)
      expect(pasted.json().rows).toEqual([
        { destinationUrl: 'https://example.com/pricing', title: 'October pricing', slug: 'october-pricing' },
        { destinationUrl: 'https://example.com/guide', title: 'Pricing guide', slug: 'pricing-guide' },
        { destinationUrl: 'not a url', title: '', slug: '', error: 'Enter a valid http or https URL' },
      ])
      expect(await ctx.db.select().from(links)).toHaveLength(0)
      expect(replies.size).toBeGreaterThan(0)
    } finally {
      pageIo.lookup = lookup
    }
  })

  it('lists only the caller links on an analytics form and charts stored clicks', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const other = await createSessionUser(ctx, { username: 'bea', email: 'bea@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/spring', title: 'Spring launch' },
    })
    const link = created.json() as { id: string }
    await ctx.db.insert(clickEvents).values({
      linkId: link.id,
      occurredAt: new Date('2026-10-20T15:00:00.000Z'),
      browser: 'Chrome',
      operatingSystem: 'macOS',
      deviceType: 'desktop',
      isBot: false,
      anonymousVisitorId: 'visitor-1',
    })
    vi.stubGlobal(
      'fetch',
      async () =>
        sse([
          { choices: [{ delta: { content: '## Report' } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, id: 'call_form', function: { name: 'show_analytics_form', arguments: '{}' } }],
                },
              },
            ],
          },
        ]),
    )
    const ownerChat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: owner.cookie } })
    const ownerReply = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${ownerChat.json().id}/messages`,
      headers: { cookie: owner.cookie },
      payload: { content: 'Give me an analytics report.' },
    })
    const ownerForm = events(ownerReply.body).find((event) => event.event === 'block')?.data.block
    if (!ownerForm || ownerForm.type !== 'form') throw new Error('missing form')
    expect(ownerForm.links?.some((item) => item.id === link.id)).toBe(true)
    expect(ownerForm.links?.find((item) => item.id === link.id)?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ownerForm.earliestCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const otherChat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: other.cookie } })
    const otherReply = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${otherChat.json().id}/messages`,
      headers: { cookie: other.cookie },
      payload: { content: 'Give me an analytics report.' },
    })
    const otherForm = events(otherReply.body).find((event) => event.event === 'block')?.data.block
    if (!otherForm || otherForm.type !== 'form') throw new Error('missing form')
    expect(otherForm.links?.some((item) => item.id === link.id)).toBe(false)

    const report = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${ownerChat.json().id}/forms/${ownerForm.id}/submit`,
      headers: { cookie: owner.cookie },
      payload: { scope: 'link', linkId: link.id },
    })
    expect(report.statusCode).toBe(200)
    const chart = report.json().report.blocks.find((block: ChatBlock) => block.type === 'chart')
    expect(chart.series.some((point: { clicks: number }) => point.clicks === 1)).toBe(true)
    expect(chart.path).toBe(`/analytics?link=${link.id}`)
    const browsers = report.json().report.blocks.find((block: ChatBlock) => block.type === 'bars' && block.title === 'Browsers')
    expect(browsers?.type === 'bars' ? browsers.rows : []).toEqual([{ name: 'Chrome', clicks: 1 }])
    const systems = report.json().report.blocks.find((block: ChatBlock) => block.type === 'bars' && block.title === 'Operating systems')
    expect(systems?.type === 'bars' ? systems.rows : []).toEqual([{ name: 'macOS', clicks: 1 }])
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
    expect(ownerReport).toMatchObject({
      totalClicks: 1,
      path: '/analytics',
      browsers: [{ name: 'Chrome', clicks: 1 }],
      operatingSystems: [{ name: 'macOS', clicks: 1 }],
      devices: [{ name: 'desktop', clicks: 1 }],
      bots: [
        { name: 'People', clicks: 1 },
        { name: 'Bots', clicks: 0 },
      ],
    })
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

  it('resolves a loose analytics slug through search', async () => {
    const ctx = await getContext()
    const owner = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { cookie: owner.cookie },
      payload: { destinationUrl: 'https://example.com/router', slug: 'test-router', title: 'Test Router' },
    })
    expect(created.statusCode).toBe(200)
    const linkId = created.json().id as string
    const settings = await getSettings(ctx.db, ctx.env)
    const report = await queryAnalyticsForActor(ctx.db, actor(owner.id, 'ada', 'user'), settings, {
      slug: 'test router',
      from: '2026-10-01',
      to: '2026-10-26',
    })
    expect(report).toMatchObject({ path: `/analytics?link=${linkId}` })
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

  it('stores a title and utm source from the link form', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const chat = await ctx.app.inject({ method: 'POST', url: '/api/chats', headers: { cookie: user.cookie } })
    const formId = randomUUID()
    const pending: ChatBlock = { type: 'form', id: formId, form: 'link', status: 'pending' }
    await ctx.db.insert(aiMessages).values({ chatId: chat.json().id, role: 'assistant', content: 'Form', blocks: [pending] })
    const submitted = await ctx.app.inject({
      method: 'POST',
      url: `/api/chats/${chat.json().id}/forms/${formId}/submit`,
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/spring', title: 'Spring', utmSource: 'newsletter' },
    })
    expect(submitted.statusCode).toBe(200)
    const stored = await ctx.db.select().from(links)
    const created = stored.find((link) => link.title === 'Spring')
    expect(created?.title).toBe('Spring')
    const utm = await ctx.db.select().from(trackingConfigs)
    expect(utm.find((row) => row.linkId === created?.id)?.utmSource).toBe('newsletter')
    if (!created) return
    await ctx.db.update(links).set({ createdAt: new Date('2020-01-15T00:00:00.000Z') }).where(eq(links.id, created.id))
    const settings = await getSettings(ctx.db, ctx.env)
    const opened = await formBlockFromCall(ctx.db, actor(user.id, 'ada', 'user'), settings, {
      id: 'call-analytics',
      name: 'show_analytics_form',
      arguments: JSON.stringify({ linkId: created.id, from: '2020-02-01', to: '2020-02-02' }),
    })
    expect(opened.ok).toBe(true)
    if (!opened.ok || opened.block.type !== 'form') throw new Error('missing analytics form')
    expect(opened.block.earliestCreatedAt).toBe('2020-01-15')
    expect(opened.block.prefill).toMatchObject({ linkId: created.id, from: '2020-02-01' })
    expect(opened.block.links?.find((link) => link.id === created.id)?.createdAt).toBe('2020-01-15')
  })

  it('pauses AI without clearing the provider and records a call for an admin', async () => {
    const ctx = await getContext()
    const admin = await createSessionUser(ctx, { username: 'root', email: 'root@example.com', role: 'admin' })
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    await saveAi(admin.cookie, { aiApiKey: 'sk-test-secret' })
    const saved = await ctx.app.inject({ method: 'GET', url: '/api/admin/settings', headers: { cookie: admin.cookie } })
    expect(saved.json()).toMatchObject({
      aiEnabled: true,
      aiProvider: 'openai',
      aiModel: 'gpt-4.1-mini',
      aiApiKeySet: true,
    })

    const paused = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: admin.cookie },
      payload: { aiEnabled: false },
    })
    expect(paused.statusCode).toBe(200)
    expect(paused.json()).toMatchObject({
      aiEnabled: false,
      aiProvider: 'openai',
      aiModel: 'gpt-4.1-mini',
      aiApiKeySet: true,
    })
    const status = await ctx.app.inject({ method: 'GET', url: '/api/ai/status', headers: { cookie: user.cookie } })
    expect(status.json().available).toBe(false)
    const blocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/ai/suggest-utm',
      headers: { cookie: user.cookie },
      payload: { destinationUrl: 'https://example.com/pricing' },
    })
    expect(blocked.statusCode).toBe(503)
    expect(blocked.json().code).toBe('ai_unavailable')

    const lookup = pageIo.lookup
    pageIo.lookup = async () => [{ address: '93.184.216.34', family: 4 }]
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('api.openai.com')) return sse([{ choices: [{ delta: { content: 'ok' } }] }])
      return new Response('<html><title>Pricing</title></html>', { status: 200 })
    })
    try {
      const tested = await ctx.app.inject({
        method: 'POST',
        url: '/api/admin/ai/test',
        headers: { cookie: admin.cookie },
        payload: {},
      })
      expect(tested.statusCode).toBe(200)
      expect(await ctx.db.select().from(aiUsageEvents)).toHaveLength(0)

      await ctx.app.inject({
        method: 'PATCH',
        url: '/api/admin/settings',
        headers: { cookie: admin.cookie },
        payload: { aiEnabled: true },
      })
      vi.stubGlobal('fetch', async (url: string) => {
        if (String(url).includes('api.openai.com')) {
          return sse([
            {
              choices: [
                {
                  delta: {
                    content: '{"utm_source":"newsletter","utm_medium":"email","utm_campaign":"october"}',
                  },
                },
              ],
            },
            { usage: { prompt_tokens: 11, completion_tokens: 4 } },
          ])
        }
        return new Response('<html><title>Pricing</title></html>', { status: 200 })
      })
      const suggested = await ctx.app.inject({
        method: 'POST',
        url: '/api/ai/suggest-utm',
        headers: { cookie: user.cookie },
        payload: { destinationUrl: 'https://example.com/pricing', placement: 'October newsletter' },
      })
      expect(suggested.statusCode).toBe(200)
      const rows = await ctx.db.select().from(aiUsageEvents)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        userId: user.id,
        feature: 'suggest-utm',
        promptTokens: 11,
        completionTokens: 4,
      })
      const denied = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/ai-usage',
        headers: { cookie: user.cookie },
      })
      expect(denied.statusCode).toBe(404)
      const usage = await ctx.app.inject({
        method: 'GET',
        url: '/api/admin/ai-usage',
        headers: { cookie: admin.cookie },
      })
      expect(usage.statusCode).toBe(200)
      expect(usage.json().totalTokens).toBe(15)
      expect(usage.json().features).toEqual([{ name: 'suggest-utm', tokens: 15 }])
      expect(usage.json().series).toHaveLength(30)
    } finally {
      pageIo.lookup = lookup
    }
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

function events(payload: string): { event: string; data: { proposal?: AiProposal; text?: string; block?: ChatBlock } }[] {
  return payload
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? 'message'
      const data = block.match(/^data: (.+)$/m)?.[1] ?? '{}'
      return { event, data: JSON.parse(data) as { proposal?: AiProposal; text?: string; block?: ChatBlock } }
    })
}
