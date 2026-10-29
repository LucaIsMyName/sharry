import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { links, linkPasswordAttempts } from '@sharry/database'
import { eq } from 'drizzle-orm'
import { clickColumn } from '../src/analytics.ts'
import { formatRecoveryCode } from '../src/auth.ts'
import { smtpTransportOptions } from '../src/mail.ts'
import { publicPageOrigin } from '../src/pages.ts'
import { allowLinkPasswordAttempt } from '../src/redirect.ts'
import { themeScriptHash } from '../src/server.ts'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

const recoveryAlphabet = 'abcdefghijkmnpqrstuvwxyz23456789'

describe('security hardening', () => {
  useTestApp()

  it('draws recovery codes from the full alphabet', () => {
    for (const code of Array.from({ length: 20 }, () => formatRecoveryCode())) {
      expect(code).toMatch(new RegExp(`^[${recoveryAlphabet}]{4}-[${recoveryAlphabet}]{4}$`))
    }
  })

  it('requires TLS for remote SMTP and leaves loopback mail cleartext', () => {
    expect(smtpTransportOptions('127.0.0.1', 1025)).toEqual({ secure: false })
    expect(smtpTransportOptions('localhost', 587)).toEqual({ secure: false })
    expect(smtpTransportOptions('[::1]', 587)).toEqual({ secure: false })
    expect(smtpTransportOptions('smtp.example', 465)).toEqual({ secure: true })
    expect(smtpTransportOptions('smtp.example', 587)).toEqual({
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
    })
  })

  it('hashes the theme script that production CSP allows', () => {
    const html = readFileSync(new URL('../../../apps/web/index.html', import.meta.url), 'utf8')
    const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
    const digest = createHash('sha256').update(source).digest('base64')
    expect(themeScriptHash).toBe(`'sha256-${digest}'`)
  })

  it('keeps a public page canonical URL on a known host', () => {
    const settings = { appUrl: 'http://127.0.0.1:5173', shortUrlBase: 'http://127.0.0.1:3000' }
    const page = { redirectDomainId: null }
    expect(publicPageOrigin({ protocol: 'http', host: '127.0.0.1:3000', hostname: '127.0.0.1' }, page, settings, new Map())).toBe(
      'http://127.0.0.1:3000',
    )
    expect(publicPageOrigin({ protocol: 'https', host: 'evil.example', hostname: 'evil.example' }, page, settings, new Map())).toBe(
      'http://127.0.0.1:3000',
    )
    const hosts = new Map([['domain-1', 'go.example']])
    const assigned = { redirectDomainId: 'domain-1' }
    expect(publicPageOrigin({ protocol: 'https', host: 'go.example', hostname: 'go.example' }, assigned, settings, hosts)).toBe(
      'https://go.example',
    )
    expect(publicPageOrigin({ protocol: 'https', host: 'evil.example', hostname: 'evil.example' }, assigned, settings, hosts)).toBe(
      'https://go.example',
    )
    expect(publicPageOrigin({ protocol: 'http', host: '127.0.0.1:5173', hostname: '127.0.0.1' }, assigned, settings, hosts)).toBe(
      'http://127.0.0.1:5173',
    )
  })

  it('refuses click column names that are not on the allow list', () => {
    expect(() => clickColumn('country_code')).not.toThrow()
    expect(() => clickColumn('occurred_at', 'e')).not.toThrow()
    expect(() => clickColumn('link_id')).not.toThrow()
    expect(() => clickColumn('country_code; drop table click_events')).toThrow(/Unknown click column/)
  })

  it('stops recording link password guesses at ten in one statement', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const [link] = await ctx.db
      .insert(links)
      .values({ userId: user.id, slug: 'locked', destinationUrl: 'https://example.com' })
      .returning()
    if (!link) throw new Error('missing link')
    let allowed = 0
    for (let attempt = 0; attempt < 11; attempt += 1) {
      if (await allowLinkPasswordAttempt(ctx.db, link.id, 'visitor', 'network')) allowed += 1
    }
    expect(allowed).toBe(10)
    const rows = await ctx.db.select().from(linkPasswordAttempts).where(eq(linkPasswordAttempts.linkId, link.id))
    expect(rows).toHaveLength(20)
  })
})
