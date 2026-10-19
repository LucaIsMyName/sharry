import { describe, expect, it } from 'vitest'
import { parseRuntimeEnv, redactSecrets, serializeEnv, splitEnv } from './env.ts'

const valid = {
  NODE_ENV: 'test',
  APP_URL: 'http://127.0.0.1:5173',
  SHORT_URL_BASE: 'http://127.0.0.1:3000',
  SHORT_URL_PREFIX: '/s',
  DATABASE_URL: 'postgresql://sharry:sharry@127.0.0.1:5432/sharry',
  SESSION_SECRET: 'test-session-secret-should-be-long-enough',
  ENCRYPTION_KEY: 'test-encryption-key-should-be-long-enough',
}

describe('environment', () => {
  it('rejects an incomplete configuration without echoing secrets', () => {
    const secret = 'super-secret-value-that-must-stay-hidden'
    expect(() => parseRuntimeEnv({})).toThrow(/Invalid environment/)
    try {
      parseRuntimeEnv({ ...valid, APP_URL: 'not a url', SESSION_SECRET: secret })
      throw new Error('expected invalid env')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).not.toContain(secret)
      expect(String(error)).toContain('APP_URL')
    }
  })

  it('keeps deployment secrets off the server env', () => {
    const split = splitEnv({
      ...valid,
      DEPLOY_HOST: '203.0.113.10',
      DEPLOY_SSH_KEY_PATH: '/secret/key',
      REDIS_URL: 'redis://localhost',
    })
    const text = serializeEnv(split.runtime)
    expect(text).not.toContain('DEPLOY_')
    expect(text).not.toContain('/secret/key')
    expect(text).toContain('DATABASE_URL')
    expect(redactSecrets(`key=${valid.ENCRYPTION_KEY}`, [valid.ENCRYPTION_KEY])).not.toContain(valid.ENCRYPTION_KEY)
  })
})
