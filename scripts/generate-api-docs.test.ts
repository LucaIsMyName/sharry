import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractApiDocs } from './generate-api-docs.ts'

const apiDir = path.resolve('apps/api/src')

describe('API docs extractor', () => {
  it('reads JSDoc from the API routes', () => {
    const docs = extractApiDocs(apiDir)
    const links = docs.find((doc) => doc.method === 'GET' && doc.path === '/api/links')
    expect(links?.tag).toBe('Links')
    expect(links?.auth).toBe('api-key or session')
    expect(links?.query.map((item) => item.name)).toEqual(['q', 'limit', 'offset', 'folder', 'status', 'sort', 'dir', 'tag'])
    const login = docs.find((doc) => doc.method === 'POST' && doc.path === '/api/auth/login')
    expect(login?.auth).toBe('session')
    expect(new Set(docs.map((doc) => `${doc.method} ${doc.path}`)).size).toBe(docs.length)
    expect(docs.length).toBeGreaterThan(40)
  })

  it('groups media and landing page routes after QR codes', () => {
    const tags = [...new Set(extractApiDocs(apiDir).map((doc) => doc.tag))]
    expect(tags.indexOf('Media')).toBe(tags.indexOf('QR codes') + 1)
    expect(tags.indexOf('Pages')).toBe(tags.indexOf('Media') + 1)
  })

  it('builds a curl command and a TypeScript fetch for each route', () => {
    const docs = extractApiDocs(apiDir)
    expect(docs.every((doc) => doc.examples.curl.startsWith('curl') && doc.examples.ts.includes('await fetch'))).toBe(true)
    expect(docs.some((doc) => doc.examples.curl.includes('=status&') || doc.examples.curl.includes('/ID'))).toBe(false)

    const list = docs.find((doc) => doc.method === 'GET' && doc.path === '/api/links')
    const listUrl = 'https://your-domain/api/links?q=spring&limit=50&offset=0&folder=root&status=active&sort=createdAt&dir=desc&tag=newsletter'
    expect(list?.examples.curl).toBe(`curl "${listUrl}" \\\n  -H "Authorization: Bearer TOKEN"`)
    expect(list?.examples.ts).toBe(
      [
        `const response = await fetch("${listUrl}", {`,
        '  headers: {',
        '    Authorization: "Bearer TOKEN",',
        '  },',
        '})',
      ].join('\n'),
    )

    const create = docs.find((doc) => doc.method === 'POST' && doc.path === '/api/links')
    expect(create?.examples.curl).toBe(
      [
        'curl -X POST "https://your-domain/api/links" \\',
        '  -H "Authorization: Bearer TOKEN" \\',
        '  -H "Content-Type: application/json" \\',
        "  -d '{",
        '  "destinationUrl": "https://example.com/pricing",',
        '  "title": "Spring sale",',
        '  "description": "Launch page for the spring campaign.",',
        '  "slug": "spring-sale"',
        "}'",
      ].join('\n'),
    )
    expect(create?.examples.ts).toContain('destinationUrl: "https://example.com/pricing"')
    expect(create?.examples.ts).toContain('slug: "spring-sale"')

    const upload = docs.find((doc) => doc.method === 'POST' && doc.path === '/api/media')
    expect(upload?.examples.curl).toBe(
      [
        'curl -X POST "https://your-domain/api/media?folder=root" \\',
        '  -H "Authorization: Bearer TOKEN" \\',
        '  -F "file=@./banner.png"',
      ].join('\n'),
    )
    expect(upload?.examples.ts).toContain('https://your-domain/api/media?folder=root')
    expect(upload?.examples.ts).toContain('body.append("file", file)')

    const login = docs.find((doc) => doc.method === 'POST' && doc.path === '/api/auth/login')
    expect(login?.examples.curl).not.toContain('Authorization')
    expect(login?.examples.curl).toBe(
      [
        'curl -X POST "https://your-domain/api/auth/login" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '{"usernameOrEmail":"ada@example.com","password":"a-long-password"}'`,
      ].join('\n'),
    )
    expect(login?.examples.ts).toContain('usernameOrEmail: "ada@example.com"')
    expect(login?.examples.ts).toContain('password: "a-long-password"')

    const settings = docs.find((doc) => doc.method === 'PATCH' && doc.path === '/api/admin/settings')
    expect(settings?.examples.curl).toContain('"defaultRedirectType":"302"')
    expect(settings?.examples.curl).toContain('"slugLength":6')
    const media = docs.find((doc) => doc.method === 'PATCH' && doc.path === '/api/media/:id')
    expect(media?.examples.curl).toContain('https://your-domain/api/media/f6b24c30-9e71-40a2-8375-0d9f4e1a7c83')
    expect(media?.examples.curl).toContain('"name":"banner.png"')
    expect(media?.examples.ts).toContain('name: "banner.png"')
    const file = docs.find((doc) => doc.method === 'GET' && doc.path === '/files/:id/:name')
    expect(file?.examples.curl).toContain('https://your-domain/files/f6b24c30-9e71-40a2-8375-0d9f4e1a7c83/banner.png')
    expect(file?.examples.curl).not.toContain('Authorization')
    const ask = docs.find((doc) => doc.method === 'GET' && doc.path === '/internal/caddy/ask')
    expect(ask?.examples.curl).toContain('domain=go.example.com')
    expect(ask?.examples.ts).toContain('await fetch')
  })

  it('rejects a JSDoc route that does not match the call', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharry-docs-'))
    fs.writeFileSync(
      path.join(dir, 'sample.ts'),
      `export function register(app: { get: (...args: unknown[]) => void }) {
        /**
         * Wrong method.
         * @route POST /api/links
         * @tag Links
         * @auth session
         */
        app.get('/api/links', async () => {})
      }
      `,
    )
    expect(() => extractApiDocs(dir)).toThrow(/does not match/)
  })

  it('rejects an API route without JSDoc', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharry-docs-'))
    fs.writeFileSync(
      path.join(dir, 'sample.ts'),
      `export function register(app: { get: (...args: unknown[]) => void }) {
        app.get('/api/links', async () => {})
      }
      `,
    )
    expect(() => extractApiDocs(dir)).toThrow(/missing JSDoc/)
  })
})
