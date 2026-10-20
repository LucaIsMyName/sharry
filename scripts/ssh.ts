import crypto from 'node:crypto'

export function assertSafeRemoteDir(dir: string): void {
  if (dir.split('/').includes('..') || !/^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(dir)) {
    throw new Error('Remote directory must be an absolute path without spaces or parent segments')
  }
}

export function assertSafeServiceName(name: string): void {
  if (!/^[a-zA-Z0-9._@-]+$/.test(name)) throw new Error('Service name contains unsupported characters')
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function privileged(command: string): string {
  const quoted = shellQuote(command)
  return `if [ "$(id -u)" -eq 0 ]; then bash -c ${quoted}; else sudo -n bash -c ${quoted}; fi`
}

export function opensshFingerprint(key: Buffer): string {
  return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
}

export function hostIsListed(knownHosts: string, hostname: string, port: number): boolean {
  for (const line of knownHosts.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) continue
    const hostField = trimmed.split(/\s+/)[0] ?? ''
    if (hostFieldMatches(hostField, hostname, port)) return true
  }
  return false
}

export function hostKeyMatches(knownHosts: string, hostname: string, port: number, key: Buffer): boolean {
  for (const line of knownHosts.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const hostField = parts[0] ?? ''
    const keyData = parts[2] ?? ''
    if (!hostFieldMatches(hostField, hostname, port)) continue
    const known = Buffer.from(keyData, 'base64')
    if (known.length === key.length && crypto.timingSafeEqual(known, key)) return true
  }
  return false
}

function hostFieldMatches(field: string, hostname: string, port: number): boolean {
  return field.split(',').some((token) => {
    if (token.startsWith('|1|')) return hashedHostMatches(token, hostname)
    if (token === hostname) return true
    return token === `[${hostname}]:${port}`
  })
}

function hashedHostMatches(token: string, hostname: string): boolean {
  const [, , saltB64, hashB64] = token.split('|')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = crypto.createHmac('sha1', salt).update(hostname).digest()
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
