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
