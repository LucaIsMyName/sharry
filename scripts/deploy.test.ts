import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { assertSafeRemoteDir, assertSafeServiceName, hostKeyMatches } from './ssh.ts'

describe('deploy safety', () => {
  it('rejects unsafe remote paths and service names', () => {
    expect(() => assertSafeRemoteDir('/var/www/sharry')).not.toThrow()
    expect(() => assertSafeRemoteDir('relative')).toThrow(/absolute/)
    expect(() => assertSafeRemoteDir('/tmp/../etc')).toThrow(/absolute/)
    expect(() => assertSafeServiceName('sharry')).not.toThrow()
    expect(() => assertSafeServiceName('sharry;reboot')).toThrow(/Service name/)
  })

  it('matches a known host key and rejects a different one', () => {
    const key = crypto.randomBytes(32)
    const known = `203.0.113.10 ssh-ed25519 ${key.toString('base64')}`
    expect(hostKeyMatches(known, '203.0.113.10', 22, key)).toBe(true)
    expect(hostKeyMatches(known, '203.0.113.10', 22, crypto.randomBytes(32))).toBe(false)
    expect(hostKeyMatches(known, '198.51.100.8', 22, key)).toBe(false)
  })
})
