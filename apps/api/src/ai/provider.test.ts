import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHARRY_ONLY_RULE } from './prompt.ts'
import { buildProviderRequest, streamCompletion, type ProviderConfig } from './provider.ts'

const key = 'super-secret-key'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('provider requests', () => {
  it('sends the Sharry-only rule to OpenAI, Anthropic, Gemini, Mistral, and a compatible endpoint', () => {
    const messages = [{ role: 'user' as const, content: 'Code me an app' }]
    const tools = [{ name: 'show_link_form', description: 'Show the short-link form', parameters: { type: 'object', properties: {} } }]
    const openai = buildProviderRequest(config('openai'), messages, [])
    const compatible = buildProviderRequest(config('openai_compatible', 'http://127.0.0.1:11434/v1'), messages, [])
    const anthropic = buildProviderRequest(config('anthropic'), messages, [])
    const google = buildProviderRequest(config('google'), messages, [])
    const mistral = buildProviderRequest(config('mistral'), messages, tools)
    expect(JSON.stringify(openai.body)).toContain(SHARRY_ONLY_RULE)
    expect(JSON.stringify(compatible.body)).toContain(SHARRY_ONLY_RULE)
    expect(JSON.stringify(mistral.body)).toContain(SHARRY_ONLY_RULE)
    expect(mistral.body).toMatchObject({
      model: 'mistral-small-latest',
      tools: [{ type: 'function', function: { name: 'show_link_form' } }],
    })
    expect(mistral.headers.authorization).toBe(`Bearer ${key}`)
    expect(openai.body).toMatchObject({ stream_options: { include_usage: true } })
    expect(openai.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(mistral.url).toBe('https://api.mistral.ai/v1/chat/completions')
    expect(compatible.url).toBe('http://127.0.0.1:11434/v1/chat/completions')
    expect(anthropic.body).toMatchObject({ system: expect.stringContaining(SHARRY_ONLY_RULE) })
    expect(JSON.stringify(google.body)).toContain(SHARRY_ONLY_RULE)
    expect(google.url).toContain('models/gemini-2.5-flash')
    const headers = openai.headers.authorization ?? ''
    expect(headers).toBe(`Bearer ${key}`)
  })

  it('reads token counts from an OpenAI usage chunk', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        sse([
          { choices: [{ delta: { content: 'ok' } }] },
          { usage: { prompt_tokens: 11, completion_tokens: 4 } },
        ]),
    )
    const events = []
    for await (const event of streamCompletion(config('openai'), [{ role: 'user', content: 'Hello' }], [])) {
      events.push(event)
    }
    expect(events).toContainEqual({ type: 'usage', promptTokens: 11, completionTokens: 4 })
    expect(events).toContainEqual({ type: 'text', text: 'ok' })
  })

  it('keeps a malformed tool call for the assistant to ask again', async () => {
    vi.stubGlobal('fetch', async () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'propose_link', arguments: '{' } }] } }] }]))
    const events = []
    for await (const event of streamCompletion(config('openai'), [{ role: 'user', content: 'Make a link' }], [])) {
      events.push(event)
    }
    expect(events).toEqual([{ type: 'tool', call: { id: 'call_1', name: 'propose_link', arguments: '{' } }])
  })

  it('hides the API key when the provider rejects it', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ error: { message: `bad key ${key}` } }), { status: 401 }),
    )
    await expect(
      collect(streamCompletion(config('openai'), [{ role: 'user', content: 'Hello' }], [])),
    ).rejects.toThrow(/\[redacted\]/)
    await expect(
      collect(streamCompletion(config('openai'), [{ role: 'user', content: 'Hello' }], [])),
    ).rejects.not.toThrow(key)
  })
})

function config(provider: ProviderConfig['provider'], baseUrl = ''): ProviderConfig {
  const model =
    provider === 'anthropic'
      ? 'claude-haiku-4-5'
      : provider === 'google'
        ? 'gemini-2.5-flash'
        : provider === 'mistral'
          ? 'mistral-small-latest'
          : 'gpt-4.1-mini'
  return { provider, model, apiKey: key, baseUrl }
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

async function collect(stream: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events = []
  for await (const event of stream) events.push(event)
  return events
}
