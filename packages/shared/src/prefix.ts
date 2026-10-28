export const RESERVED_PREFIXES = [
  'api',
  'health',
  'assets',
  'login',
  'account',
  'links',
  'campaigns',
  'analytics',
  'admin',
  'docs',
  'media',
  'files',
] as const

export const RESERVED_SLUGS = [
  'api',
  'health',
  'assets',
  'admin',
  'login',
  'account',
  'links',
  'campaigns',
  'analytics',
  'favicon.ico',
  'robots.txt',
  'docs',
  'media',
  'files',
] as const

export function validatePrefix(prefix: string): string | null {
  if (!prefix.startsWith('/')) return 'Prefix must start with /'
  if (prefix.length < 2) return 'Prefix is too short'
  const name = prefix.slice(1)
  if (name.includes('/')) return 'Prefix must be a single path segment'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    return 'Prefix may only contain lowercase letters, digits, and hyphens'
  }
  if ((RESERVED_PREFIXES as readonly string[]).includes(name)) {
    return 'This prefix conflicts with an application route'
  }
  return null
}

export function validateSlug(slug: string): string | null {
  if (slug.length < 2 || slug.length > 64) return 'Slug must be between 2 and 64 characters'
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)) {
    return 'Slug may only contain letters, digits, and hyphens'
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase())) {
    return 'This slug is reserved'
  }
  return null
}

const RANDOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generateRandomSlug(length: number, entropy: () => number = randomUnit): string {
  const size = clampSlugLength(length)
  let slug = ''
  for (let index = 0; index < size; index += 1) {
    const unit = entropy()
    slug += RANDOM_ALPHABET[Math.floor(unit * RANDOM_ALPHABET.length)]
  }
  return slug
}

export function clampSlugLength(length: number): number {
  if (!Number.isFinite(length)) return 5
  return Math.min(16, Math.max(4, Math.trunc(length)))
}

function randomUnit(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return (buffer[0] ?? 0) / 2 ** 32
}

export const SLUG_TAKEN_MESSAGE = 'This short URL is already in use. Please choose a different slug.'

export async function allocateRandomSlug(
  length: number,
  isTaken: (slug: string) => Promise<boolean>,
  entropy: () => number = randomUnit,
  attempts = 8,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const slug = generateRandomSlug(length, entropy)
    if (!(await isTaken(slug))) return slug
  }
  throw new Error('Could not generate a unique slug. Try again.')
}

export function buildShortUrl(
  base: string,
  prefix: string,
  slug: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(`${trimTrailingSlash(base)}${prefix}/${encodeURIComponent(slug)}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
