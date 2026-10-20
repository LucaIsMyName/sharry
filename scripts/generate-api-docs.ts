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
}

const METHODS = new Set(['get', 'post', 'patch', 'delete', 'put', 'head'])

const TAG_ORDER = ['Links', 'Campaigns', 'Analytics', 'QR codes', 'Account', 'Admin', 'Settings']

export function extractApiDocs(dir: string): ApiDoc[] {
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort()
  const docs: ApiDoc[] = []
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const text = fs.readFileSync(fullPath, 'utf8')
    const source = ts.createSourceFile(fullPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    visit(source, text, file, docs)
  }
  return docs.sort((left, right) => {
    const tag = tagRank(left.tag) - tagRank(right.tag)
    if (tag !== 0) return tag
    return left.path.localeCompare(right.path) || left.method.localeCompare(right.method)
  })
}

function visit(node: ts.Node, text: string, file: string, docs: ApiDoc[]): void {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    METHODS.has(node.expression.name.text) &&
    node.expression.expression.getText() === 'app'
  ) {
    const urlNode = node.arguments[0]
    if (urlNode && ts.isStringLiteral(urlNode) && urlNode.text.startsWith('/api')) {
      const method = node.expression.name.text.toUpperCase()
      const comment = leadingJsDoc(node, text)
      if (!comment) throw new Error(`${method} ${urlNode.text} in ${file} is missing JSDoc`)
      docs.push(parseDoc(method, urlNode.text, comment, file))
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
  return {
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
