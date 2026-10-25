import { describe, expect, it } from 'vitest'
import { deploymentHostname, normalizeHostname, redirectChallengeName, redirectHostnameError, txtRecordMatches } from './domain.ts'

describe('redirect hostnames', () => {
  it('accepts a hostname and rejects addresses that cannot be verified', () => {
    expect(normalizeHostname(' GO.Brand.com. ')).toBe('go.brand.com')
    expect(redirectHostnameError('go.brand.com', ['share.example.com'])).toBeNull()
    expect(redirectHostnameError('go.brand.com.', ['share.example.com'])).toBeNull()
    expect(redirectHostnameError('share.example.com', ['share.example.com', 'app.example.com'])).toBe('The deployment domain is already the default')
    expect(redirectHostnameError('app.example.com', [deploymentHostname('https://app.example.com')])).toBe('The deployment domain is already the default')
    expect(redirectHostnameError('localhost', [])).toBe('Enter a domain name such as go.example.com')
    expect(redirectHostnameError('1.2.3.4', [])).toBe('Enter a domain name such as go.example.com')
    expect(redirectHostnameError('*.example.com', [])).toBe('Enter a domain name without a scheme, port, or path')
    expect(redirectHostnameError('https://go.example.com/s', [])).toBe('Enter a domain name without a scheme, port, or path')
    expect(redirectHostnameError('go.example.com:443', [])).toBe('Enter a domain name without a scheme, port, or path')
    expect(redirectHostnameError('', [])).toBe('Enter a domain name')
  })

  it('matches a TXT token across split chunks', () => {
    expect(redirectChallengeName('go.brand.com')).toBe('_sharry-challenge.go.brand.com')
    expect(txtRecordMatches([['sharry-'], ['token']], 'sharry-token')).toBe(false)
    expect(txtRecordMatches([['sharry-', 'token'], ['other']], 'sharry-token')).toBe(true)
    expect(txtRecordMatches([['other']], 'sharry-token')).toBe(false)
  })
})
