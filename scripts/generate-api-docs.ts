import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export type ApiDocParam = {
  name: string
  type: string
  description: string
}

export type ApiDocResponse = {
  status: string
  description: string
}

export type ApiDocExamples = {
  curl: string
  ts: string
}

export type ApiDoc = {
  method: string
  path: string
  tag: string
  summary: string
  auth: string
  params: ApiDocParam[]
  query: ApiDocParam[]
  body: string | null
  responses: ApiDocResponse[]
  examples: ApiDocExamples
}

const METHODS = new Set(['get', 'post', 'patch', 'delete', 'put', 'head'])

const TAG_ORDER = ['Links', 'Campaigns', 'Analytics', 'AI', 'Search', 'QR codes', 'Media', 'Pages', 'Account', 'Admin', 'Settings', 'Domains']

export function extractApiDocs(dir: string): ApiDoc[] {
  const docs: ApiDoc[] = []
  for (const file of routeFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    visit(source, text, path.relative(dir, file), docs)
  }
  return docs.sort((left, right) => {
    const tag = tagRank(left.tag) - tagRank(right.tag)
    if (tag !== 0) return tag
    return left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
  })
}

function routeFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...routeFiles(full))
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) files.push(full)
  }
  return files.sort()
}

function visit(node: ts.Node, text: string, file: string, docs: ApiDoc[]): void {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    METHODS.has(node.expression.name.text) &&
    node.expression.expression.getText() === 'app'
  ) {
    const urlNode = node.arguments[0]
    if (urlNode && ts.isStringLiteral(urlNode)) {
      const method = node.expression.name.text.toUpperCase()
      const comment = leadingJsDoc(node, text)
      const documented = urlNode.text.startsWith('/api') || comment != null
      if (documented && !comment) throw new Error(`${method} ${urlNode.text} in ${file} is missing JSDoc`)
      if (documented && comment) docs.push(parseDoc(method, urlNode.text, comment, file))
    }
  }
  ts.forEachChild(node, (child) => visit(child, text, file, docs))
}

function leadingJsDoc(node: ts.Node, text: string): string | null {
  const target = ts.isExpressionStatement(node.parent) ? node.parent : node
  const ranges = ts.getLeadingCommentRanges(text, target.getFullStart()) ?? []
  const block = [...ranges].reverse().find((range) => text.slice(range.pos, range.pos + 3) === '/**')
  return block ? text.slice(block.pos, block.end) : null
}

function parseDoc(method: string, routePath: string, raw: string, file: string): ApiDoc {
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
  const summary: string[] = []
  const tags: { name: string; rest: string }[] = []
  for (const line of lines) {
    const match = /^@(\w+)\s*(.*)$/.exec(line.trim())
    if (match?.[1]) tags.push({ name: match[1], rest: match[2] ?? '' })
    else if (tags.length === 0 && line.trim()) summary.push(line.trim())
  }
  const declared = tags.find((tag) => tag.name === 'route')?.rest.trim()
  const expected = `${method} ${routePath}`
  if (declared !== expected) {
    throw new Error(`JSDoc @route ${declared ?? '(missing)'} in ${file} does not match ${expected}`)
  }
  const doc = {
    method,
    path: routePath,
    tag: tags.find((tag) => tag.name === 'tag')?.rest.trim() || 'Other',
    summary: summary.join(' '),
    auth: tags.find((tag) => tag.name === 'auth')?.rest.trim() || '',
    params: tags.filter((tag) => tag.name === 'param').map((tag) => parseParam(tag.rest)),
    query: tags.filter((tag) => tag.name === 'query').map((tag) => parseParam(tag.rest)),
    body: tags.find((tag) => tag.name === 'body')?.rest.trim() || null,
    responses: tags.filter((tag) => tag.name === 'response').map((tag) => parseResponse(tag.rest)),
  }
  return { ...doc, examples: requestExamples(doc) }
}

const exampleOrigin = 'https://your-domain'

type ExampleRoute = {
  method: string
  path: string
  auth: string
  query: ApiDocParam[]
  body: string | null
}

export function requestExamples(doc: ExampleRoute): ApiDocExamples {
  return { curl: curlExample(doc), ts: tsExample(doc) }
}

const exampleIds = {
  id: '8c2f0b1a-4e7d-4a6c-9b3e-1d5f7a2c4e80',
  link: 'b7e1c4a2-6d90-4f3b-8a15-2c9e0d4f6a71',
  user: 'c3a91e20-5b48-4d7f-9e02-7a6c1b8d4f50',
  folder: 'd4f02a18-7c59-4e80-a163-8b7d2c9e5a61',
  variant: 'e5a13b29-8d60-4f91-b274-9c8e3d0f6b72',
  media: 'f6b24c30-9e71-40a2-8375-0d9f4e1a7c83',
  domain: 'a7c35d41-0f82-41b3-9486-1e0a5f2b8d94',
  chat: 'b8d46e52-1a93-42c4-a597-2f1b6a3c9e05',
  proposal: 'c9e57f63-2b04-43d5-b6a8-3a2c7b4d0f16',
  form: 'd0f68074-3c15-44e6-87b9-4b3d8c5e1a27',
  campaign: '9e0f1a2b-3c4d-45e6-a7b8-c9d0e1f2a3b4',
  qr: '0f1a2b3c-4d5e-46f7-b8c9-d0e1f2a3b4c5',
  page: '1a2b3c4d-5e6f-47a8-c9d0-e1f2a3b4c5d6',
  tag: '2b3c4d5e-6f70-48b9-d0e1-f2a3b4c5d6e7',
  key: '3c4d5e6f-7081-49ca-e1f2-a3b4c5d6e7f8',
}

const qrExampleStyle = {
  size: 512,
  margin: 2,
  dotsType: 'rounded',
  dotsColor: '#1a1814',
  cornersSquareType: 'extra-rounded',
  cornersSquareColor: '#1a1814',
  cornersDotType: 'dot',
  cornersDotColor: '#1a1814',
  backgroundColor: '#ffffff',
  backgroundTransparent: false,
  errorCorrectionLevel: 'H',
  imageSize: 0.28,
  jpegBackground: '#ffffff',
}

const optionalExampleFields = new Set([
  'destinationUrl',
  'title',
  'slug',
  'description',
  'name',
  'alt',
  'redirectType',
  'locale',
  'hostname',
  'kind',
  'color',
  'role',
  'status',
  'isActive',
  'hidden',
  'instruction',
  'placement',
  'from',
  'to',
  'aiProvider',
  'aiModel',
  'scope',
  'createQr',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'variantName',
  'country',
  'tags',
  'utm',
  'style',
])

function exampleUrl(routePath: string, query: ApiDocParam[]): string {
  const pathName = routePath.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => pathId(name, routePath))
  const search = query
    .map((param) => `${encodeURIComponent(param.name)}=${encodeURIComponent(queryValue(param))}`)
    .join('&')
  return `${exampleOrigin}${pathName}${search ? `?${search}` : ''}`
}

function pathId(name: string, routePath: string): string {
  if (name === 'name') return 'banner.png'
  if (name !== 'id') return idFor(name)
  if (routePath.includes('/links')) return exampleIds.link
  if (routePath.includes('/campaigns')) return exampleIds.campaign
  if (routePath.includes('/variants')) return exampleIds.variant
  if (routePath.includes('/qr')) return exampleIds.qr
  if (routePath.includes('/media') || routePath.includes('/files')) return exampleIds.media
  if (routePath.includes('/pages')) return exampleIds.page
  if (routePath.includes('/folders')) return exampleIds.folder
  if (routePath.includes('/tags')) return exampleIds.tag
  if (routePath.includes('/users')) return exampleIds.user
  if (routePath.includes('/chats')) return exampleIds.chat
  if (routePath.includes('/redirect-domains')) return exampleIds.domain
  if (routePath.includes('/api-keys')) return exampleIds.key
  return exampleIds.id
}

function idFor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('user')) return exampleIds.user
  if (key.includes('folder') || key.includes('parent')) return exampleIds.folder
  if (key.includes('variant') || key.includes('tracking')) return exampleIds.variant
  if (key.includes('logo') || key.includes('media')) return exampleIds.media
  if (key.includes('domain')) return exampleIds.domain
  if (key.includes('proposal')) return exampleIds.proposal
  if (key.includes('form')) return exampleIds.form
  if (key.includes('chat')) return exampleIds.chat
  if (key.includes('campaign')) return exampleIds.campaign
  if (key.includes('page')) return exampleIds.page
  if (key.includes('link')) return exampleIds.link
  if (key.includes('tag')) return exampleIds.tag
  return exampleIds.id
}

function queryValue(param: ApiDocParam): string {
  const description = param.description
  if (/YYYY-MM-DD/.test(description)) return param.name === 'to' ? '2026-10-29' : '2026-10-01'
  const choices = leadingChoices(description)
  if (choices) {
    if (param.name === 'dir' && choices.includes('desc')) return 'desc'
    if (param.name === 'sort' && choices.includes('createdAt')) return 'createdAt'
    if (param.name === 'status' && choices.includes('published')) return 'published'
    if (param.name === 'status' && choices.includes('active')) return 'active'
    const preferred = /[Dd]efault(?:s to)? ([a-z0-9]+)/.exec(description)
    if (preferred?.[1] && choices.includes(preferred[1])) return preferred[1]
    return choices[0] ?? 'spring'
  }
  const fallback = /[Dd]efault(?:s to)? ([^\s.,]+)/.exec(description)
  if (fallback?.[1] && fallback[1] !== '30') return fallback[1]
  if (/\bor root\b/.test(description)) return 'root'
  if (/\b1 returns\b/.test(description)) return '1'
  return queryByName(param)
}

function leadingChoices(description: string): string[] | null {
  const match = /^([a-z0-9][\w.-]*(?:, [a-z0-9][\w.-]*)*,? or [a-z0-9][\w.-]*)\b/i.exec(description.trim())
  if (!match?.[1]) return null
  const choices = match[1].split(/,?\s+or\s+|,\s+/).map((part) => part.trim()).filter(Boolean)
  if (choices.length < 2 || choices.some((choice) => choice.includes(' '))) return null
  return choices
}

function queryByName(param: ApiDocParam): string {
  const name = param.name
  if (name === 'q') return 'spring'
  if (name === 'slug') return 'spring-sale'
  if (name === 'title') return 'Spring sale'
  if (name === 'tag') return 'newsletter'
  if (name === 'offset') return '0'
  if (name === 'limit') return '50'
  if (name === 'country') return 'US'
  if (name === 'browser') return 'Chrome'
  if (name === 'os') return 'macOS'
  if (name === 'device') return 'desktop'
  if (name === 'referrer') return 'google'
  if (name === 'utm_source') return 'newsletter'
  if (name === 'utm_medium') return 'email'
  if (name === 'utm_campaign') return 'spring-sale'
  if (name === 'utm_id') return 'spring-2026'
  if (name === 'utm_term') return 'pricing'
  if (name === 'utm_content') return 'banner'
  if (name === 'domain') return 'go.example.com'
  if (name === 'link' || name === 'entry' || name === 'id' || /Id$/.test(name) || /Ids$/.test(name)) {
    return idFor(name === 'link' || name === 'entry' ? 'linkId' : name)
  }
  if (param.type === 'number') return '1'
  return 'spring'
}

function usesApiKey(auth: string): boolean {
  return auth.includes('api-key')
}

function isMultipart(body: string | null): boolean {
  return body != null && /^multipart\b/i.test(body.trim())
}

function isJsonBody(body: string | null): boolean {
  return body != null && /^JSON\b/i.test(body.trim())
}

function exampleBody(doc: ExampleRoute): Record<string, unknown> | null {
  if (!isJsonBody(doc.body)) return null
  if (doc.path === '/api/admin/settings') {
    return { defaultRedirectType: '302', slugLength: 6, analyticsRetentionDays: 90 }
  }
  const fields = bodyFields(doc.body)
  const required = fields.filter((field) => !field.optional)
  const illustrative = fields.filter((field) => field.optional && optionalExampleFields.has(field.name)).slice(0, 3)
  const chosen = required.length > 0 ? [...required, ...illustrative] : illustrative
  const object: Record<string, unknown> = {}
  for (const field of chosen) object[field.name] = fieldValue(field.name, doc.path)
  return object
}

function bodyFields(body: string | null): { name: string; optional: boolean }[] {
  const inner = body ? /\{([^{}]*)\}/.exec(body)?.[1] : null
  if (!inner) return []
  return inner
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((raw) => ({
      name: raw.endsWith('?') ? raw.slice(0, -1) : raw,
      optional: raw.endsWith('?'),
    }))
    .filter((field) => field.name.length > 0)
}

function fieldValue(name: string, routePath: string): unknown {
  if (name === 'urls') return ['https://example.com/pricing', 'https://example.com/about']
  if (name === 'tags') return ['newsletter']
  if (name === 'linkIds') return [exampleIds.link]
  if (name === 'country') return ['US']
  if (name === 'browser') return ['Chrome']
  if (name === 'os') return ['macOS']
  if (name === 'utm_source' || name === 'utmSource') return name.startsWith('utm_') ? ['newsletter'] : 'newsletter'
  if (name === 'utm_medium' || name === 'utmMedium') return name.startsWith('utm_') ? ['email'] : 'email'
  if (name === 'utm_campaign' || name === 'utmCampaign') return name.startsWith('utm_') ? ['spring-sale'] : 'spring-sale'
  if (name === 'utm') return { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'spring-sale' }
  if (name === 'style') return qrExampleStyle
  if (name === 'destinationUrl') return 'https://example.com/pricing'
  if (name === 'title') return /\/chats\/:id$/.test(routePath) ? 'Spring campaign' : 'Spring sale'
  if (name === 'description') return 'Launch page for the spring campaign.'
  if (name === 'slug') return 'spring-sale'
  if (name === 'redirectType') return '302'
  if (name === 'expiresAt') return '2026-12-31T23:59:59.000Z'
  if (name === 'password') return 'a-long-password'
  if (name === 'currentPassword') return 'current-long-password'
  if (name === 'newPassword') return 'a-new-long-password'
  if (name === 'username') return 'ada'
  if (name === 'email' || name === 'usernameOrEmail') return 'ada@example.com'
  if (name === 'role') return 'user'
  if (name === 'code') return '123456'
  if (name === 'locale') return 'en'
  if (name === 'token') return '0123456789abcdef0123456789abcdef'
  if (name === 'hostname') return 'go.example.com'
  if (name === 'name') return nameFor(routePath)
  if (name === 'kind') return routePath.includes('/media') ? 'image' : 'link'
  if (name === 'color') return '#2563eb'
  if (name === 'instruction') {
    return routePath.includes('variants')
      ? 'Draft newsletter, social, and partner variants for the spring sale.'
      : 'Send visitors from Germany to the local pricing page.'
  }
  if (name === 'placement') return 'Newsletter footer'
  if (name === 'content') return 'Shorten https://example.com/pricing for the spring newsletter.'
  if (name === 'from') return '2026-10-01'
  if (name === 'to') return '2026-10-29'
  if (name === 'aiProvider') return 'openai'
  if (name === 'aiModel') return 'gpt-4o-mini'
  if (name === 'aiBaseUrl') return 'https://api.openai.com/v1'
  if (name === 'status') return 'active'
  if (name === 'alt') return 'Spring sale banner'
  if (name === 'scope') return 'link'
  if (name === 'variantName') return 'Newsletter'
  if (name === 'hidden' || name === 'isActive' || name === 'createQr') return name !== 'hidden'
  if (name.endsWith('Ids')) return [idFor(name)]
  if (name === 'id' || name.endsWith('Id')) return idFor(name)
  if (/url/i.test(name)) return 'https://example.com/pricing'
  if (/email/i.test(name)) return 'ada@example.com'
  if (/password/i.test(name)) return 'current-long-password'
  return 'spring-sale'
}

function nameFor(routePath: string): string {
  if (routePath.includes('/media')) return 'banner.png'
  if (routePath.includes('/qr')) return 'Spring sale poster'
  if (routePath.includes('/chats')) return 'Spring campaign'
  if (routePath.includes('/tags')) return 'newsletter'
  if (routePath.includes('/folders')) return 'Campaigns'
  if (routePath.includes('/api-keys')) return 'Deploy script'
  return 'Spring sale'
}

function curlExample(doc: ExampleRoute): string {
  const lines = [`curl${doc.method === 'GET' ? '' : ` -X ${doc.method}`} "${exampleUrl(doc.path, doc.query)}"`]
  if (usesApiKey(doc.auth)) lines.push('  -H "Authorization: Bearer TOKEN"')
  if (isMultipart(doc.body)) lines.push('  -F "file=@./banner.png"')
  else {
    const body = exampleBody(doc)
    if (body && Object.keys(body).length > 0) {
      lines.push('  -H "Content-Type: application/json"')
      lines.push(`  -d '${curlPayload(body)}'`)
    }
  }
  return lines.join(' \\\n')
}

function curlPayload(body: Record<string, unknown>): string {
  return isCompact(body) ? JSON.stringify(body) : JSON.stringify(body, null, 2)
}

function tsExample(doc: ExampleRoute): string {
  const url = exampleUrl(doc.path, doc.query)
  const multipart = isMultipart(doc.body)
  const body = exampleBody(doc)
  const json = body != null && Object.keys(body).length > 0
  const lines: string[] = []
  if (multipart) {
    lines.push('const body = new FormData()')
    lines.push('body.append("file", file)')
  }
  const options: string[] = []
  if (doc.method !== 'GET') options.push(`  method: "${doc.method}",`)
  const headers: string[] = []
  if (usesApiKey(doc.auth)) headers.push('    Authorization: "Bearer TOKEN",')
  if (json) headers.push('    "Content-Type": "application/json",')
  if (headers.length > 0) {
    options.push('  headers: {')
    options.push(...headers)
    options.push('  },')
  }
  if (multipart) options.push('  body,')
  else if (json && body) options.push(`  body: JSON.stringify(${formatTsValue(body, 2)}),`)
  if (options.length === 0) lines.push(`const response = await fetch("${url}")`)
  else {
    lines.push(`const response = await fetch("${url}", {`)
    lines.push(...options)
    lines.push('})')
  }
  return lines.join('\n')
}

function isCompact(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true
  if (Array.isArray(value)) return value.every((item) => item === null || typeof item !== 'object')
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.length <= 3 && entries.every(([, item]) => item === null || typeof item !== 'object')
}

function formatTsValue(value: unknown, indent: number): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => formatTsValue(item, indent)).join(', ')}]`
    }
    const pad = ' '.repeat(indent)
    const inner = ' '.repeat(indent + 2)
    return `[\n${value.map((item) => `${inner}${formatTsValue(item, indent + 2)}`).join(',\n')}\n${pad}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    if (isCompact(value)) {
      return `{ ${entries.map(([key, item]) => `${tsKey(key)}: ${formatTsValue(item, indent)}`).join(', ')} }`
    }
    const pad = ' '.repeat(indent)
    const inner = ' '.repeat(indent + 2)
    return `{\n${entries.map(([key, item]) => `${inner}${tsKey(key)}: ${formatTsValue(item, indent + 2)},`).join('\n')}\n${pad}}`
  }
  return 'null'
}

function tsKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)
}

function parseParam(rest: string): ApiDocParam {
  const match = /^(\S+)\s+(\S+)\s+([\s\S]+)$/.exec(rest.trim())
  if (!match) return { name: rest.trim(), type: '', description: '' }
  return { name: match[1] ?? '', type: match[2] ?? '', description: match[3] ?? '' }
}

function parseResponse(rest: string): ApiDocResponse {
  const match = /^(\S+)\s+([\s\S]+)$/.exec(rest.trim())
  if (!match) return { status: rest.trim(), description: '' }
  return { status: match[1] ?? '', description: match[2] ?? '' }
}

function tagRank(tag: string): number {
  const index = TAG_ORDER.indexOf(tag)
  return index === -1 ? TAG_ORDER.length : index
}
