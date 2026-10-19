export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
] as const

export type UtmKey = (typeof UTM_KEYS)[number]

export type UtmParams = Partial<Record<UtmKey, string | null | undefined>>

export function cleanUtm(input: UtmParams | null | undefined): UtmParams {
  const result: UtmParams = {}
  if (!input) return result
  for (const key of UTM_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) result[key] = value.trim()
  }
  return result
}

export function utmConflicts(destination: string, utm: UtmParams): UtmKey[] {
  let url: URL
  try {
    url = new URL(destination)
  } catch {
    return []
  }
  const conflicts: UtmKey[] = []
  for (const key of UTM_KEYS) {
    const next = utm[key]
    if (!next) continue
    const current = url.searchParams.get(key)
    if (current && current !== next) conflicts.push(key)
  }
  return conflicts
}

export function applyUtm(destination: string, utm: UtmParams): string {
  const url = new URL(destination)
  const hash = url.hash
  for (const key of UTM_KEYS) {
    const value = utm[key]
    if (typeof value === 'string' && value.length > 0) url.searchParams.set(key, value)
  }
  url.hash = hash
  return url.toString()
}

export function mergeUtm(base: UtmParams, override: UtmParams | null | undefined): UtmParams {
  return { ...cleanUtm(base), ...cleanUtm(override) }
}
