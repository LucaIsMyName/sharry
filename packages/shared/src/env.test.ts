import { describe, expect, it } from 'vitest'
import { chooseEnvFile, parseDeployEnv, parseRuntimeEnv, redactSecrets, serializeEnv, splitEnv } from './env.ts'

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

  it('uses the development file locally and the production file for deploy', () => {
    expect(chooseEnvFile('development', { development: true, legacy: true })).toBe('.env.development')
    expect(chooseEnvFile('development', { development: false, legacy: true })).toBe('.env')
    expect(chooseEnvFile('development', { development: false, legacy: false })).toBe('.env.development')
    expect(chooseEnvFile('production', { development: true, legacy: true })).toBe('.env.production')
    expect(chooseEnvFile('production', { override: 'shared/.env', development: true })).toBe('shared/.env')
    expect(chooseEnvFile('development', { override: '  shared/.env  ' })).toBe('shared/.env')
  })

  it('uses Sharry when APP_NAME is missing or blank', () => {
    expect(parseRuntimeEnv(valid).APP_NAME).toBe('Sharry')
    expect(parseRuntimeEnv({ ...valid, APP_NAME: '' }).APP_NAME).toBe('Sharry')
    expect(parseRuntimeEnv({ ...valid, APP_NAME: '   ' }).APP_NAME).toBe('Sharry')
    expect(parseRuntimeEnv({ ...valid, APP_NAME: '  My Brand  ' }).APP_NAME).toBe('My Brand')
  })

  it('derives the public origins from DOMAIN and keeps an explicit origin', () => {
    const derived = parseRuntimeEnv({
      ...valid,
      APP_URL: '',
      SHORT_URL_BASE: '',
      DOMAIN: 'Share.Example.com',
    })
    expect(derived.APP_URL).toBe('https://share.example.com')
    expect(derived.SHORT_URL_BASE).toBe('https://share.example.com')

    const explicit = parseRuntimeEnv({ ...valid, DOMAIN: 'share.example.com' })
    expect(explicit.APP_URL).toBe(valid.APP_URL)
    expect(explicit.SHORT_URL_BASE).toBe(valid.SHORT_URL_BASE)
    expect(() => parseRuntimeEnv({ ...valid, DOMAIN: 'https://share.example.com/s' })).toThrow(/DOMAIN/)
  })

  it('derives the health check and the remote directory for deploy', () => {
    const deploy = parseDeployEnv({
      DEPLOY_ENABLED: 'true',
      DEPLOY_HOST: '203.0.113.10',
      DEPLOY_USER: 'root',
      DEPLOY_SSH_KEY_PATH: '/tmp/key',
      DOMAIN: 'share.example.com',
    })
    expect(deploy.DEPLOY_HEALTHCHECK_URL).toBe('https://share.example.com/health')
    expect(deploy.DEPLOY_REMOTE_DIR).toBe('/var/www/sharry')
    expect(deploy.DEPLOY_RESTART_SERVICE).toBe('sharry')
    expect(deploy.DEPLOY_PORT).toBe(22)
    const uploaded = serializeEnv(splitEnv({ ...valid, DOMAIN: 'share.example.com' }).runtime)
    expect(uploaded).not.toContain('DOMAIN')
  })
})
