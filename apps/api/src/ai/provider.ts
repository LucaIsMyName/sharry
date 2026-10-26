import { openAiCompletionsUrl, type AiProvider } from '@sharry/shared'

export const mistralCompletionsBase = 'https://api.mistral.ai/v1'
import { SHARRY_ONLY_RULE } from './prompt.ts'
import { AppError } from '../support.ts'

export type AiToolCall = { id: string; name: string; arguments: string }

export type AiTurnMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }

export type AiToolDef = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ProviderConfig = {
  provider: AiProvider
  model: string
  apiKey: string
  baseUrl: string
}

export type ProviderRequest = {
  url: string
  headers: Record<string, string>
  body: unknown
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; call: AiToolCall }
  | { type: 'usage'; promptTokens: number | null; completionTokens: number | null }

export function buildProviderRequest(
  config: ProviderConfig,
  messages: AiTurnMessage[],
  tools: AiToolDef[],
): ProviderRequest {
  const ready = withBoundary(messages)
  if (config.provider === 'anthropic') return anthropicRequest(config, ready, tools)
  if (config.provider === 'google') return googleRequest(config, ready, tools)
  if (config.provider === 'mistral') return openAiRequest(config, ready, tools, mistralCompletionsBase)
  return openAiRequest(config, ready, tools)
}

export async function* streamCompletion(
  config: ProviderConfig,
  messages: AiTurnMessage[],
  tools: AiToolDef[],
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<StreamEvent> {
  const request = buildProviderRequest(config, messages, tools)
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  })
  if (!response.ok) await rejectProvider(response, config.apiKey)
  if (config.provider === 'anthropic') yield* parseAnthropic(response)
  else if (config.provider === 'google') yield* parseGemini(response)
  else yield* parseOpenAi(response)
}

function withBoundary(messages: AiTurnMessage[]): AiTurnMessage[] {
  const system = messages.find((message) => message.role === 'system')
  const rest = messages.filter((message) => message.role !== 'system')
  const content =
    system && system.role === 'system' && system.content.includes(SHARRY_ONLY_RULE)
      ? system.content
      : system && system.role === 'system'
        ? `${SHARRY_ONLY_RULE}\n\n${system.content}`
        : SHARRY_ONLY_RULE
  return [{ role: 'system', content }, ...rest]
}

function openAiRequest(config: ProviderConfig, messages: AiTurnMessage[], tools: AiToolDef[], baseUrl?: string): ProviderRequest {
  const base = baseUrl ?? (config.provider === 'openai' ? 'https://api.openai.com/v1' : config.baseUrl)
  return {
    url: openAiCompletionsUrl(base),
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: {
      model: config.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: messages.map(openAiMessage),
      ...(tools.length > 0
        ? {
            tools: tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
          }
        : {}),
    },
  }
}

function openAiMessage(message: AiTurnMessage): Record<string, unknown> {
  if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    }
  }
  return { role: message.role, content: message.content }
}

function anthropicRequest(config: ProviderConfig, messages: AiTurnMessage[], tools: AiToolDef[]): ProviderRequest {
  const system = messages.find((message) => message.role === 'system')
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: {
      model: config.model,
      max_tokens: 2048,
      stream: true,
      system: system && system.role === 'system' ? system.content : SHARRY_ONLY_RULE,
      messages: anthropicMessages(messages.filter((message) => message.role !== 'system')),
      ...(tools.length > 0
        ? {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
          }
        : {}),
    },
  }
}

function anthropicMessages(messages: AiTurnMessage[]): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }
      const previous = blocks[blocks.length - 1]
      if (previous && previous.role === 'user' && Array.isArray(previous.content)) {
        ;(previous.content as unknown[]).push(block)
      } else {
        blocks.push({ role: 'user', content: [block] })
      }
      continue
    }
    if (message.role === 'assistant') {
      const content: Record<string, unknown>[] = []
      if (message.content) content.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls ?? []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: objectArguments(call.arguments) })
      }
      if (content.length > 0) blocks.push({ role: 'assistant', content })
      continue
    }
    blocks.push({ role: 'user', content: message.content })
  }
  return blocks
}

function googleRequest(config: ProviderConfig, messages: AiTurnMessage[], tools: AiToolDef[]): ProviderRequest {
  const system = messages.find((message) => message.role === 'system')
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`,
    headers: {
      'x-goog-api-key': config.apiKey,
      'content-type': 'application/json',
    },
    body: {
      systemInstruction: { parts: [{ text: system && system.role === 'system' ? system.content : SHARRY_ONLY_RULE }] },
      contents: googleContents(messages.filter((message) => message.role !== 'system')),
      generationConfig: { maxOutputTokens: 2048 },
      ...(tools.length > 0
        ? { tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }] }
        : {}),
    },
  }
}

function googleContents(messages: AiTurnMessage[]): Record<string, unknown>[] {
  const contents: Record<string, unknown>[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      const part = { functionResponse: { name: message.name, response: { result: message.content } } }
      const previous = contents[contents.length - 1]
      if (previous && previous.role === 'user' && Array.isArray(previous.parts)) {
        ;(previous.parts as unknown[]).push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
      continue
    }
    if (message.role === 'assistant') {
      const parts: Record<string, unknown>[] = []
      if (message.content) parts.push({ text: message.content })
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: objectArguments(call.arguments) } })
      }
      if (parts.length > 0) contents.push({ role: 'model', parts })
      continue
    }
    contents.push({ role: 'user', parts: [{ text: message.content }] })
  }
  return contents
}

function objectArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    return { raw: value }
  }
  return { raw: value }
}

async function* parseOpenAi(response: Response): AsyncGenerator<StreamEvent> {
  const pending = new Map<number, AiToolCall>()
  for await (const data of readSse(response)) {
    const payload = parseJson(data) as {
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[]
    } | null
    const usage = usageEvent(payload?.usage?.prompt_tokens, payload?.usage?.completion_tokens)
    if (usage) yield usage
    const delta = payload?.choices?.[0]?.delta
    if (!delta) continue
    if (delta.content) yield { type: 'text', text: delta.content }
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0
      const current = pending.get(index) ?? { id: call.id || `call_${index}`, name: '', arguments: '' }
      if (call.id) current.id = call.id
      if (call.function?.name) current.name += call.function.name
      if (call.function?.arguments) current.arguments += call.function.arguments
      pending.set(index, current)
    }
  }
  for (const index of [...pending.keys()].sort((left, right) => left - right)) {
    const call = pending.get(index)
    if (call?.name) yield { type: 'tool', call }
  }
}

async function* parseAnthropic(response: Response): AsyncGenerator<StreamEvent> {
  const blocks = new Map<number, { type: string; id: string; name: string; arguments: string }>()
  for await (const data of readSse(response)) {
    const payload = parseJson(data) as {
      type?: string
      index?: number
      content_block?: { type?: string; id?: string; name?: string }
      delta?: { type?: string; text?: string; partial_json?: string }
      message?: { usage?: { input_tokens?: number; output_tokens?: number } }
      usage?: { input_tokens?: number; output_tokens?: number }
    } | null
    if (!payload) continue
    if (payload.type === 'message_start') {
      const usage = usageEvent(payload.message?.usage?.input_tokens, payload.message?.usage?.output_tokens)
      if (usage) yield usage
    }
    if (payload.type === 'message_delta') {
      const usage = usageEvent(payload.usage?.input_tokens, payload.usage?.output_tokens)
      if (usage) yield usage
    }
    if (payload.type === 'content_block_start' && payload.content_block) {
      blocks.set(payload.index ?? blocks.size, {
        type: payload.content_block.type ?? 'text',
        id: payload.content_block.id ?? `tool_${payload.index ?? 0}`,
        name: payload.content_block.name ?? '',
        arguments: '',
      })
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta' && payload.delta.text) {
      yield { type: 'text', text: payload.delta.text }
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'input_json_delta') {
      const block = blocks.get(payload.index ?? 0)
      if (block) block.arguments += payload.delta.partial_json ?? ''
    }
  }
  for (const block of blocks.values()) {
    if (block.type === 'tool_use' && block.name) {
      yield { type: 'tool', call: { id: block.id, name: block.name, arguments: block.arguments || '{}' } }
    }
  }
}

async function* parseGemini(response: Response): AsyncGenerator<StreamEvent> {
  const seen = new Set<string>()
  let index = 0
  for await (const data of readSse(response)) {
    const payload = parseJson(data) as {
      candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: unknown } }[] } }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    } | null
    for (const part of payload?.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) yield { type: 'text', text: part.text }
      if (part.functionCall?.name) {
        const args = JSON.stringify(part.functionCall.args ?? {})
        const key = `${part.functionCall.name}:${args}`
        if (seen.has(key)) continue
        seen.add(key)
        yield { type: 'tool', call: { id: `call_${index}`, name: part.functionCall.name, arguments: args } }
        index += 1
      }
    }
    const usage = usageEvent(payload?.usageMetadata?.promptTokenCount, payload?.usageMetadata?.candidatesTokenCount)
    if (usage) yield usage
  }
}

function usageEvent(prompt: unknown, completion: unknown): StreamEvent | null {
  const promptTokens = typeof prompt === 'number' ? prompt : null
  const completionTokens = typeof completion === 'number' ? completion : null
  if (promptTokens == null && completionTokens == null) return null
  return { type: 'usage', promptTokens, completionTokens }
}

async function* readSse(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) yield* sseData(part)
  }
  if (buffer.trim()) yield* sseData(buffer)
}

function* sseData(part: string): Generator<string> {
  const data = part
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
  if (data && data !== '[DONE]') yield data
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

async function rejectProvider(response: Response, apiKey: string): Promise<never> {
  const body = await response.text()
  let detail = ''
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    if (typeof parsed.error === 'string') detail = parsed.error
    else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) detail = parsed.error.message
    else if (typeof parsed.message === 'string') detail = parsed.message
  } catch {
    detail = body.slice(0, 180)
  }
  if (apiKey) detail = detail.split(apiKey).join('[redacted]')
  const message = detail.trim().slice(0, 200) || 'The AI provider rejected the request.'
  throw new AppError(502, message)
}
