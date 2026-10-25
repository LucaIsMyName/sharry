const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '')
}

export function deploymentHostname(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function redirectHostnameError(value: string, deploymentHostnames: string[]): string | null {
  const hostname = normalizeHostname(value)
  if (!hostname) return 'Enter a domain name'
  if (hostname.includes('*') || hostname.includes('/') || hostname.includes(':') || hostname.includes(' ') || hostname.includes('@')) {
    return 'Enter a domain name without a scheme, port, or path'
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || !HOSTNAME.test(hostname)) {
    return 'Enter a domain name such as go.example.com'
  }
  const blocked = new Set(deploymentHostnames.map((item) => normalizeHostname(item)).filter(Boolean))
  if (blocked.has(hostname)) return 'The deployment domain is already the default'
  return null
}

export function redirectChallengeName(hostname: string): string {
  return `_sharry-challenge.${hostname}`
}

export function txtRecordMatches(records: string[][], token: string): boolean {
  return records.some((chunks) => chunks.join('') === token)
}
