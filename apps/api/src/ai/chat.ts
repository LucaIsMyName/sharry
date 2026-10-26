import { Readable } from 'node:stream'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { aiChats, aiMessages, users, type AiMessageRecord, type Database } from '@sharry/database'
import {
  aiBaseUrlError,
  aiConnectionTestSchema,
  aiIsAvailable,
  sendChatMessageSchema,
  suggestSlugSchema,
  type AiConnectionTestInput,
  type AiProposal,
  type ChatBlock,
} from '@sharry/shared'
import type { Actor } from '../auth.ts'
import { requireAdmin, requireUser } from '../auth.ts'
import { getSettings, rowsOf, type AppSettings } from '../settings-store.ts'
import { AppError, decryptString, parseBody } from '../support.ts'
import { aiSystemPrompt } from './prompt.ts'
import { mistralCompletionsBase, streamCompletion, type AiToolCall, type AiTurnMessage, type ProviderConfig } from './provider.ts'
import { suggestFreeSlug } from './page-slug.ts'
import {
  aiToolDefs,
  applyFormSubmission,
  blocksFromAnalyticsResult,
  confirmProposal,
  formBlockFromCall,
  isFormTool,
  isReadTool,
  isWriteTool,
  proposalFromWrite,
  runReadTool,
  searchContextForActor,
} from './tools.ts'

const messageLimit = 40
const historyLimit = 30
const toolRounds = 4
const newChatTitle = 'New chat'

export function registerAiRoutes(app: FastifyInstance): void {
  /**
   * Suggest a free custom slug and the page title from a destination page. Nothing is created.
   * @route POST /api/ai/suggest-slug
   * @tag AI
   * @auth api-key or session
   * @body JSON { destinationUrl, linkId? }
   * @response 200 { slug, title, fromTitle }
   */
  app.post('/api/ai/suggest-slug', async (request) => {
    await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    if (!configured(settings)) throw new AppError(503, 'AI is not available.', 'ai_unavailable')
    const body = parseBody(suggestSlugSchema, request.body ?? {})
    const suggested = await suggestFreeSlug(app.db, body.destinationUrl, { exceptLinkId: body.linkId })
    if (!suggested) throw new AppError(422, 'Could not suggest a slug for that page.')
    return suggested
  })

  /**
   * Say whether an administrator has saved a usable AI provider.
   * @route GET /api/ai/status
   * @tag AI
   * @auth api-key or session
   * @response 200 { available, provider, model }
   */
  app.get('/api/ai/status', async (request) => {
    await requireUser(app, request, ['full'])
    const settings = await getSettings(app.db, app.env)
    return statusOf(settings)
  })

  /**
   * Try the provider, model, and API key in this request. Omitted fields use the saved settings. Nothing is stored.
   * @route POST /api/admin/ai/test
   * @tag AI
   * @auth admin api-key or admin session
   * @body JSON { aiProvider?, aiModel?, aiBaseUrl?, aiApiKey? }
   * @response 200 { ok: true }
   */
  app.post('/api/admin/ai/test', async (request) => {
    await requireAdmin(app, request)
    const input = parseBody(aiConnectionTestSchema, request.body ?? {})
    const settings = await getSettings(app.db, app.env)
    const config = connectionConfig(settings, app.env.ENCRYPTION_KEY, input)
    for await (const _event of streamCompletion(config, [{ role: 'user', content: 'Reply with ok.' }], [])) {
      // A successful stream is enough. The reply is not stored.
    }
    return { ok: true }
  })

  /**
   * List the signed-in user's chats, newest first.
   * @route GET /api/chats
   * @tag AI
   * @auth api-key or session
   * @response 200 { chats: Chat[] }
   */
  app.get('/api/chats', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const rows = await app.db
      .select()
      .from(aiChats)
      .where(eq(aiChats.userId, actor.id))
      .orderBy(desc(aiChats.updatedAt))
    return { chats: rows.map(serializeChat) }
  })

  /**
   * Start an empty chat.
   * @route POST /api/chats
   * @tag AI
   * @auth api-key or session
   * @response 200 Chat
   */
  app.post('/api/chats', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const [created] = await app.db.insert(aiChats).values({ userId: actor.id, title: newChatTitle }).returning()
    if (!created) throw new AppError(500, 'Could not start a chat')
    return serializeChat(created)
  })

  /**
   * Read one chat and its messages. Old chats stay readable when AI is off.
   * @route GET /api/chats/:id
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @response 200 { chat, messages }
   * @response 404 Chat not found
   */
  app.get('/api/chats/:id', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const chat = await ownChat(app.db, actor, chatId(request.params))
    const messages = await app.db.select().from(aiMessages).where(eq(aiMessages.chatId, chat.id)).orderBy(asc(aiMessages.createdAt))
    return { chat: serializeChat(chat), messages: messages.map(serializeMessage) }
  })

  /**
   * Delete one of the signed-in user's chats.
   * @route DELETE /api/chats/:id
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @response 204 Empty
   */
  app.delete('/api/chats/:id', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const chat = await ownChat(app.db, actor, chatId(request.params))
    await app.db.delete(aiChats).where(eq(aiChats.id, chat.id))
    return reply.code(204).send()
  })

  /**
   * Send a message and stream the assistant reply. Rejected when AI is not configured, and the message is not stored.
   * @route POST /api/chats/:id/messages
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @body JSON { content }
   * @response 200 Server-sent events: text, block, proposal, done, error
   */
  app.post('/api/chats/:id/messages', async (request, reply) => {
    const actor = await requireUser(app, request, ['full'])
    const body = parseBody(sendChatMessageSchema, request.body)
    const settings = await getSettings(app.db, app.env)
    if (!configured(settings)) throw new AppError(503, 'AI is not available.', 'ai_unavailable')
    const chat = await ownChat(app.db, actor, chatId(request.params))
    await assertMessageRate(app.db, actor.id)
    const config = providerConfig(settings, app.env.ENCRYPTION_KEY)
    if (!config) throw new AppError(503, 'AI is not available.', 'ai_unavailable')
    const [userMessage] = await app.db
      .insert(aiMessages)
      .values({ chatId: chat.id, role: 'user', content: body.content })
      .returning()
    if (!userMessage) throw new AppError(500, 'Could not save the message')
    if (chat.title === newChatTitle) {
      await app.db
        .update(aiChats)
        .set({ title: titleFrom(body.content), updatedAt: new Date() })
        .where(eq(aiChats.id, chat.id))
    } else {
      await touchChat(app.db, chat.id)
    }
    const locale = await userLocale(app.db, actor.id)
    const stream = new Readable({ read() {} })
    const send = (event: string, data: unknown) => {
      if (!stream.destroyed) stream.push(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
    void runTurn(app.db, actor, settings, locale, config, chat.id, send)
      .catch((error: unknown) => {
        const message = error instanceof AppError ? error.message : 'The AI provider rejected the request.'
        send('error', { error: message })
      })
      .finally(() => {
        if (!stream.destroyed) stream.push(null)
      })
    return reply
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-cache')
      .header('connection', 'keep-alive')
      .send(stream)
  })

  /**
   * Create the link or campaign on a pending card. This does not call the provider.
   * @route POST /api/chats/:id/proposals/:proposalId/confirm
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @param proposalId string Proposal id
   * @response 200 { proposal }
   */
  app.post('/api/chats/:id/proposals/:proposalId/confirm', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const params = request.params as { id?: string; proposalId?: string }
    const chat = await ownChat(app.db, actor, chatId(params))
    const message = await pendingProposal(app.db, chat.id, params.proposalId ?? '')
    const settings = await getSettings(app.db, app.env)
    const next = await confirmProposal(app.db, actor, settings, message.proposal as AiProposal)
    await app.db.update(aiMessages).set({ proposal: next }).where(eq(aiMessages.id, message.id))
    await touchChat(app.db, chat.id)
    return { proposal: next }
  })

  /**
   * Dismiss a pending card. Nothing is created.
   * @route POST /api/chats/:id/proposals/:proposalId/dismiss
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @param proposalId string Proposal id
   * @response 200 { proposal }
   */
  app.post('/api/chats/:id/proposals/:proposalId/dismiss', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const params = request.params as { id?: string; proposalId?: string }
    const chat = await ownChat(app.db, actor, chatId(params))
    const message = await pendingProposal(app.db, chat.id, params.proposalId ?? '')
    const next: AiProposal = { ...(message.proposal as AiProposal), status: 'dismissed' }
    await app.db.update(aiMessages).set({ proposal: next }).where(eq(aiMessages.id, message.id))
    await touchChat(app.db, chat.id)
    return { proposal: next }
  })

  /**
   * Submit a form in the chat. A link or campaign is created here. An analytics form adds the chart and table.
   * @route POST /api/chats/:id/forms/:formId/submit
   * @tag AI
   * @auth api-key or session
   * @param id string Chat id
   * @param formId string Form id
   * @body JSON { destinationUrl?, slug?, createQr?, scope?, linkId?, name?, description?, variantName? }
   * @response 200 { message, report }
   */
  app.post('/api/chats/:id/forms/:formId/submit', async (request) => {
    const actor = await requireUser(app, request, ['full'])
    const params = request.params as { id?: string; formId?: string }
    const chat = await ownChat(app.db, actor, chatId(params))
    const found = await messageWithForm(app.db, chat.id, params.formId ?? '')
    if (found.block.status === 'submitted') throw new AppError(409, 'That form was already submitted.')
    const settings = await getSettings(app.db, app.env)
    const locale = await userLocale(app.db, actor.id)
    const applied = await applyFormSubmission(app.db, actor, settings, locale, found.block, request.body)
    const blocks = (found.message.blocks ?? []).map((block) =>
      block.type === 'form' && block.id === found.block.id ? applied.block : block,
    )
    await app.db.update(aiMessages).set({ blocks }).where(eq(aiMessages.id, found.message.id))
    await touchChat(app.db, chat.id)
    const message = { ...found.message, blocks }
    if (!applied.report || applied.block.type !== 'form' || applied.block.status !== 'submitted') {
      return { message: serializeMessage(message), report: null }
    }
    let content = applied.report.content
    const config = providerConfig(settings, app.env.ENCRYPTION_KEY)
    if (config) {
      try {
        const history = toProviderMessages(await recentMessages(app.db, chat.id), locale)
        history.push({ role: 'user', content: applied.report.brief })
        let text = ''
        for await (const event of streamCompletion(config, history, [])) {
          if (event.type === 'text') text += event.text
        }
        if (text.trim()) content = text.trim()
      } catch {
        content = applied.report.content
      }
    }
    const report = await insertAssistant(app.db, chat.id, content, undefined, applied.report.blocks)
    return { message: serializeMessage(message), report: serializeMessage(report) }
  })
}

async function runTurn(
  db: Database,
  actor: Actor,
  settings: AppSettings,
  locale: string,
  config: ProviderConfig,
  chatId: string,
  send: (event: string, data: unknown) => void,
): Promise<void> {
  const history = await recentMessages(db, chatId)
  const latest = [...history].reverse().find((row) => row.role === 'user')
  const searchNote = latest ? await searchContextForActor(db, actor, settings, latest.content) : undefined
  const live = toProviderMessages(history, locale, searchNote)
  let text = ''
  const blocks: ChatBlock[] = []
  for (let round = 0; round < toolRounds; round += 1) {
    const calls: AiToolCall[] = []
    let roundText = ''
    for await (const event of streamCompletion(config, live, aiToolDefs)) {
      if (event.type === 'text') {
        roundText += event.text
        text += event.text
        send('text', { text: event.text })
      } else {
        calls.push(event.call)
      }
    }
    if (calls.length === 0) {
      const saved = await insertAssistant(db, chatId, text, undefined, blocks)
      send('done', { messageId: saved.id })
      return
    }
    live.push({ role: 'assistant', content: roundText, toolCalls: calls })
    for (const call of calls) {
      if (isWriteTool(call.name) || isFormTool(call.name)) continue
      const content = isReadTool(call.name)
        ? await runReadTool(db, actor, settings, locale, call)
        : 'That tool is not available. Ask a question about Sharry instead.'
      if (call.name === 'query_analytics') {
        for (const block of blocksFromAnalyticsResult(parseJson(content))) {
          blocks.push(block)
          send('block', { block })
        }
      }
      live.push({ role: 'tool', toolCallId: call.id, name: call.name, content })
      await db.insert(aiMessages).values({
        chatId,
        role: 'tool',
        content,
        toolName: call.name,
        toolCallId: call.id,
      })
    }
    const forms = calls.filter((call) => isFormTool(call.name))
    const writes = calls.filter((call) => isWriteTool(call.name))
    const form = forms[0]
    const write = form ? undefined : writes[0]
    const extras = form ? [...forms.slice(1), ...writes] : writes.slice(1)
    for (const extra of extras) {
      const content = 'Only one form can be shown at a time.'
      live.push({ role: 'tool', toolCallId: extra.id, name: extra.name, content })
      await db.insert(aiMessages).values({ chatId, role: 'tool', content, toolName: extra.name, toolCallId: extra.id })
    }
    if (form) {
      const prepared = await formBlockFromCall(db, actor, settings, form)
      if (!prepared.ok) {
        live.push({ role: 'tool', toolCallId: form.id, name: form.name, content: prepared.error })
        await db.insert(aiMessages).values({
          chatId,
          role: 'tool',
          content: prepared.error,
          toolName: form.name,
          toolCallId: form.id,
        })
        continue
      }
      const saved = await insertAssistant(db, chatId, text, undefined, [...blocks, prepared.block])
      send('block', { block: prepared.block })
      send('done', { messageId: saved.id })
      return
    }
    if (!write) continue
    const prepared = proposalFromWrite(write)
    if (!prepared.ok) {
      live.push({ role: 'tool', toolCallId: write.id, name: write.name, content: prepared.error })
      await db.insert(aiMessages).values({
        chatId,
        role: 'tool',
        content: prepared.error,
        toolName: write.name,
        toolCallId: write.id,
      })
      continue
    }
    const saved = await insertAssistant(db, chatId, text, prepared.proposal, blocks)
    send('proposal', { proposal: prepared.proposal })
    send('done', { messageId: saved.id })
    return
  }
  const saved = await insertAssistant(db, chatId, text, undefined, blocks)
  send('done', { messageId: saved.id })
}

function toProviderMessages(rows: AiMessageRecord[], locale: string, searchNote?: string): AiTurnMessage[] {
  const note = searchNote ? `\n\n${searchNote}` : ''
  const messages: AiTurnMessage[] = [{ role: 'system', content: `${aiSystemPrompt(locale)}${note}` }]
  for (const row of rows) {
    if (row.role === 'user') {
      messages.push({ role: 'user', content: row.content })
      continue
    }
    if (row.role === 'tool') {
      messages.push({ role: 'user', content: `Tool result (${row.toolName ?? 'tool'}): ${row.content}` })
      continue
    }
    if (row.role === 'assistant') {
      let content = row.content
      if (row.proposal?.status === 'confirmed') content += `\n\nConfirmed result: ${JSON.stringify(row.proposal.result ?? {})}`
      if (row.proposal?.status === 'pending') content += '\n\nA confirmation card is waiting.'
      if (row.proposal?.status === 'dismissed') content += '\n\nThe user dismissed that proposal.'
      if (row.proposal?.status === 'failed') content += `\n\nThe proposal failed: ${row.proposal.result?.error ?? 'unknown'}`
      for (const block of row.blocks ?? []) {
        if (block.type === 'form' && block.status === 'pending') content += '\n\nA form is waiting for the person.'
        if (block.type === 'form' && block.status === 'submitted') content += `\n\nForm result: ${JSON.stringify(block.result ?? {})}`
        if (block.type === 'chart') content += `\n\nA chart is shown for ${block.path}.`
        if (block.type === 'table') content += `\n\nA table titled ${block.title} is shown.`
      }
      if (content.trim()) messages.push({ role: 'assistant', content })
    }
  }
  return messages
}

async function recentMessages(db: Database, chatId: string): Promise<AiMessageRecord[]> {
  const rows = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.chatId, chatId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(historyLimit)
  return rows.reverse()
}

async function insertAssistant(db: Database, chatId: string, content: string, proposal?: AiProposal, blocks?: ChatBlock[]) {
  const [saved] = await db
    .insert(aiMessages)
    .values({ chatId, role: 'assistant', content, proposal, blocks: blocks && blocks.length > 0 ? blocks : null })
    .returning()
  if (!saved) throw new AppError(500, 'Could not save the reply')
  return saved
}

async function messageWithForm(db: Database, chatId: string, formId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(formId)) throw new AppError(404, 'That form was not found.')
  const rows = await db.select().from(aiMessages).where(eq(aiMessages.chatId, chatId))
  for (const message of rows) {
    const block = message.blocks?.find((item) => item.type === 'form' && item.id === formId)
    if (block?.type === 'form') return { message, block }
  }
  throw new AppError(404, 'That form was not found.')
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

async function pendingProposal(db: Database, chatId: string, proposalId: string): Promise<AiMessageRecord> {
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new AppError(404, 'That proposal was not found.')
  const rows = await db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.chatId, chatId), sql`${aiMessages.proposal}->>'id' = ${proposalId}`))
    .limit(1)
  const message = rows[0]
  if (!message?.proposal) throw new AppError(404, 'That proposal was not found.')
  if (message.proposal.status !== 'pending') throw new AppError(409, 'That proposal is no longer pending.')
  return message
}

async function ownChat(db: Database, actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(404, 'Chat not found')
  const rows = await db.select().from(aiChats).where(eq(aiChats.id, id)).limit(1)
  const chat = rows[0]
  if (!chat || chat.userId !== actor.id) throw new AppError(404, 'Chat not found')
  return chat
}

async function assertMessageRate(db: Database, userId: string): Promise<void> {
  const rows = rowsOf<{ count: number }>(
    await db.execute(sql`
      select count(*)::int as count
      from ai_messages m
      join ai_chats c on c.id = m.chat_id
      where c.user_id = ${userId}
        and m.role = 'user'
        and m.created_at > now() - interval '1 hour'
    `),
  )
  if ((rows[0]?.count ?? 0) >= messageLimit) {
    throw new AppError(429, 'You can send 40 messages an hour. Try again later.', 'rate_limit')
  }
}

async function userLocale(db: Database, userId: string): Promise<string> {
  const rows = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1)
  return rows[0]?.locale === 'de' ? 'de' : 'en'
}

async function touchChat(db: Database, chatId: string): Promise<void> {
  await db.update(aiChats).set({ updatedAt: new Date() }).where(eq(aiChats.id, chatId))
}

function connectionConfig(settings: AppSettings, encryptionKey: string, input: AiConnectionTestInput): ProviderConfig {
  const provider = input.aiProvider ?? settings.aiProvider
  const model = (input.aiModel !== undefined ? input.aiModel : settings.aiModel).trim()
  const baseUrl = (input.aiBaseUrl !== undefined ? input.aiBaseUrl : settings.aiBaseUrl).trim()
  const apiKey = input.aiApiKey?.trim() || savedApiKey(settings, encryptionKey)
  if (!aiIsAvailable({ provider, model, baseUrl, apiKeySet: Boolean(apiKey) })) {
    const urlError = provider === 'openai_compatible' ? aiBaseUrlError(baseUrl) : null
    throw new AppError(400, urlError ?? 'Enter a provider, model, and API key before testing the connection.')
  }
  if (
    provider !== 'openai' &&
    provider !== 'anthropic' &&
    provider !== 'google' &&
    provider !== 'mistral' &&
    provider !== 'openai_compatible'
  ) {
    throw new AppError(400, 'Enter a provider, model, and API key before testing the connection.')
  }
  return {
    provider,
    model,
    apiKey,
    baseUrl: providerBase(provider, baseUrl),
  }
}

function providerBase(provider: string, baseUrl: string): string {
  if (provider === 'mistral') return mistralCompletionsBase
  if (provider === 'openai_compatible') return baseUrl
  return 'https://api.openai.com/v1'
}

function savedApiKey(settings: AppSettings, encryptionKey: string): string {
  if (!settings.aiApiKeyEncrypted) return ''
  try {
    return decryptString(settings.aiApiKeyEncrypted, encryptionKey)
  } catch {
    return ''
  }
}

function providerConfig(settings: AppSettings, encryptionKey: string): ProviderConfig | null {
  if (!configured(settings)) return null
  try {
    return {
      provider: settings.aiProvider as ProviderConfig['provider'],
      model: settings.aiModel,
      apiKey: decryptString(settings.aiApiKeyEncrypted, encryptionKey),
      baseUrl: providerBase(settings.aiProvider, settings.aiBaseUrl),
    }
  } catch {
    return null
  }
}

function configured(settings: AppSettings): boolean {
  return aiIsAvailable({
    provider: settings.aiProvider,
    model: settings.aiModel,
    baseUrl: settings.aiBaseUrl,
    apiKeySet: Boolean(settings.aiApiKeyEncrypted),
  })
}

function statusOf(settings: AppSettings) {
  return {
    available: configured(settings),
    provider: settings.aiProvider || null,
    model: settings.aiModel || null,
  }
}

function serializeChat(chat: { id: string; title: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  }
}

function serializeMessage(message: AiMessageRecord) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    toolName: message.toolName,
    proposal: message.proposal ?? null,
    blocks: message.blocks ?? null,
    createdAt: message.createdAt.toISOString(),
  }
}

function titleFrom(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim()
  return clean.slice(0, 80) || newChatTitle
}

function chatId(params: unknown): string {
  return typeof params === 'object' && params && 'id' in params && typeof params.id === 'string' ? params.id : ''
}
