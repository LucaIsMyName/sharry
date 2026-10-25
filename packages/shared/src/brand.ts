const SLUG_LIMIT = 40

export function appSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LIMIT)
    .replace(/-+$/g, '')
  return slug || 'sharry'
}

export function sessionCookieName(name: string): string {
  return `${appSlug(name)}_session`
}

export function unlockCookieName(name: string): string {
  return `${appSlug(name)}_unlock`
}

export function apiKeySecretPrefix(name: string): string {
  return `${appSlug(name)}_`
}

export function apiKeyTokenPrefix(secret: string, name: string): string {
  const head = apiKeySecretPrefix(name)
  return secret.slice(0, Math.max(12, head.length + 4))
}
