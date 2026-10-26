export const ROUTING_FIELDS = [
  'browser',
  'device',
  'operating_system',
  'country',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
] as const

export const ROUTING_OPERATORS = ['is', 'is_not'] as const

export const OPEN_ROUTING_FIELDS = ['utm_campaign', 'utm_id', 'utm_term', 'utm_content'] as const

export const MAX_ROUTING_RULES = 50
export const MAX_ROUTING_CONDITIONS = 30
export const MAX_ROUTING_VALUES = 30

export type RoutingField = (typeof ROUTING_FIELDS)[number]
export type RoutingOperator = (typeof ROUTING_OPERATORS)[number]
export type OpenRoutingField = (typeof OPEN_ROUTING_FIELDS)[number]

export type RoutingCondition = {
  field: RoutingField | string
  operator: RoutingOperator | string
  values: string[]
}

export type RoutingRule = {
  id: string
  destinationUrl: string
  conditions: RoutingCondition[]
}

export type RoutingChoices = Record<OpenRoutingField, string[]>

export type RoutingContext = {
  browser: string
  device: string
  operatingSystem: string
  countryCode: string | null
  referrerHost: string | null
  utm: Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_id' | 'utm_term' | 'utm_content', string | null | undefined>>
}

export type RoutingOption = { id: string; label: string }

const BROWSERS: RoutingOption[] = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'safari', label: 'Safari' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'edge', label: 'Edge' },
  { id: 'opera', label: 'Opera' },
  { id: 'other', label: 'Other' },
]

const DEVICES: RoutingOption[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'bot', label: 'Bot' },
]

const OPERATING_SYSTEMS: RoutingOption[] = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'ios', label: 'iOS' },
  { id: 'android', label: 'Android' },
  { id: 'linux', label: 'Linux' },
  { id: 'other', label: 'Other' },
]

const UTM_SOURCES = ['google', 'facebook', 'instagram', 'newsletter', 'bing', 'linkedin', 'twitter', 'youtube', 'tiktok', 'reddit', 'email']

const UTM_MEDIUMS = ['email', 'social', 'cpc', 'organic', 'referral', 'display', 'affiliate', 'qr']

export const REFERRER_PRESETS: { id: string; label: string; hosts: string[] }[] = [
  { id: 'none', label: 'No referrer', hosts: [] },
  { id: 'google', label: 'Google', hosts: ['google.com'] },
  { id: 'bing', label: 'Bing', hosts: ['bing.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
  { id: 'x', label: 'X', hosts: ['x.com', 't.co', 'twitter.com'] },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com', 'lnkd.in'] },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
  { id: 'reddit', label: 'Reddit', hosts: ['reddit.com'] },
  { id: 'gmail', label: 'Gmail', hosts: ['mail.google.com'] },
  { id: 'outlook', label: 'Outlook', hosts: ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'outlook.com'] },
]

export const ROUTING_FIELD_LABELS: Record<RoutingField, string> = {
  browser: 'Browser',
  device: 'Device',
  operating_system: 'Operating system',
  country: 'Country',
  referrer: 'Referrer',
  utm_source: 'UTM source',
  utm_medium: 'UTM medium',
  utm_campaign: 'UTM campaign',
  utm_id: 'UTM id',
  utm_term: 'UTM term',
  utm_content: 'UTM content',
}

export const ROUTING_OPERATOR_LABELS: Record<RoutingOperator, string> = {
  is: 'is',
  is_not: 'is not',
}

const COUNTRY_CODE_LIST = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
XK
YE YT
ZA ZM ZW
`.trim().split(/\s+/)

const COUNTRY_CODES = new Set(COUNTRY_CODE_LIST)

export function emptyRoutingChoices(): RoutingChoices {
  return { utm_campaign: [], utm_id: [], utm_term: [], utm_content: [] }
}

export function isRoutingField(value: string): value is RoutingField {
  return (ROUTING_FIELDS as readonly string[]).includes(value)
}

export function isRoutingOperator(value: string): value is RoutingOperator {
  return (ROUTING_OPERATORS as readonly string[]).includes(value)
}

export function isOpenRoutingField(value: string): value is OpenRoutingField {
  return (OPEN_ROUTING_FIELDS as readonly string[]).includes(value)
}

export function countryOptions(locale: string): RoutingOption[] {
  let names: Intl.DisplayNames
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    names = new Intl.DisplayNames(['en'], { type: 'region' })
  }
  return COUNTRY_CODE_LIST.map((id) => ({ id, label: names.of(id) ?? id })).sort((left, right) =>
    left.label.localeCompare(right.label, locale),
  )
}

export function routingCatalog(field: RoutingField, locale = 'en'): RoutingOption[] {
  switch (field) {
    case 'browser':
      return BROWSERS
    case 'device':
      return DEVICES
    case 'operating_system':
      return OPERATING_SYSTEMS
    case 'country':
      return countryOptions(locale)
    case 'referrer':
      return REFERRER_PRESETS.map(({ id, label }) => ({ id, label }))
    case 'utm_source':
      return UTM_SOURCES.map((id) => ({ id, label: id }))
    case 'utm_medium':
      return UTM_MEDIUMS.map((id) => ({ id, label: id }))
    default:
      return []
  }
}

export function canonicalRoutingValue(field: string, value: string): string | null {
  if (!isRoutingField(field)) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 200) return null
  if (field === 'country') {
    const code = trimmed.toUpperCase()
    return COUNTRY_CODES.has(code) ? code : null
  }
  if (isOpenRoutingField(field)) return trimmed
  const match = routingCatalog(field).find((option) => option.id.toLowerCase() === trimmed.toLowerCase())
  return match?.id ?? null
}

export function routeHasUnrecognizedValue(rule: RoutingRule): boolean {
  for (const condition of rule.conditions ?? []) {
    const operator = canonicalOperator(condition.operator)
    if (!isRoutingField(condition.field) || !isRoutingOperator(operator)) return true
    for (const value of condition.values ?? []) {
      if (!canonicalRoutingValue(condition.field, value)) return true
    }
  }
  return false
}

export function firstRoutingValue(field: RoutingField, choices: RoutingChoices, locale = 'en'): string | null {
  if (isOpenRoutingField(field)) return choices[field][0] ?? null
  return routingCatalog(field, locale)[0]?.id ?? null
}

export function conditionForField(field: RoutingField, choices: RoutingChoices, locale = 'en'): RoutingCondition {
  const first = firstRoutingValue(field, choices, locale)
  return { field, operator: 'is', values: first ? [first] : [] }
}

export function normalizeRoutingRules(rules: unknown): RoutingRule[] {
  if (!Array.isArray(rules)) return []
  const normalized: RoutingRule[] = []
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object') continue
    const candidate = rule as Partial<RoutingRule>
    if (typeof candidate.id !== 'string' || typeof candidate.destinationUrl !== 'string' || !Array.isArray(candidate.conditions)) {
      continue
    }
    normalized.push({
      id: candidate.id,
      destinationUrl: candidate.destinationUrl,
      conditions: candidate.conditions.flatMap((condition) => {
        if (!condition || typeof condition !== 'object' || !Array.isArray(condition.values)) return []
        const values = condition.values
          .filter((value): value is string => typeof value === 'string')
          .map((value) => canonicalRoutingValue(condition.field, value) ?? value.trim())
          .filter(Boolean)
        return [{ field: condition.field, operator: canonicalOperator(condition.operator), values }]
      }),
    })
  }
  return normalized
}

export function sameRoutingRules(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeRoutingRules(left)) === JSON.stringify(normalizeRoutingRules(right))
}

export function matchRoute(rules: unknown, context: RoutingContext | null | undefined): string | null {
  try {
    if (!Array.isArray(rules) || !context) return null
    const limited = rules.length > MAX_ROUTING_RULES ? rules.slice(0, MAX_ROUTING_RULES) : rules
    for (const rule of limited) {
      try {
        const destination = matchOne(rule, context)
        if (destination) return destination
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}

function matchOne(rule: unknown, context: RoutingContext): string | null {
  if (!rule || typeof rule !== 'object') return null
  const candidate = rule as Partial<RoutingRule>
  if (typeof candidate.destinationUrl !== 'string' || !isHttpUrl(candidate.destinationUrl)) return null
  if (!Array.isArray(candidate.conditions) || candidate.conditions.length === 0) return null
  if (candidate.conditions.length > MAX_ROUTING_CONDITIONS) return null
  for (const condition of candidate.conditions) {
    const result = matchCondition(condition, context)
    if (result !== true) return null
  }
  return candidate.destinationUrl.trim()
}

function matchCondition(condition: unknown, context: RoutingContext): boolean | 'skip' {
  if (!condition || typeof condition !== 'object') return 'skip'
  const candidate = condition as Partial<RoutingCondition>
  const field = candidate.field
  const rawOperator = candidate.operator
  if (typeof field !== 'string' || typeof rawOperator !== 'string') return 'skip'
  const operator = canonicalOperator(rawOperator)
  if (!isRoutingField(field) || !isRoutingOperator(operator)) return 'skip'
  if (!Array.isArray(candidate.values) || candidate.values.length > MAX_ROUTING_VALUES) return 'skip'
  const recognized = candidate.values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => canonicalRoutingValue(field, value))
    .filter((value): value is string => Boolean(value))
  if (recognized.length === 0) return 'skip'
  if (field === 'country' && !clean(context.countryCode)) return 'skip'
  const matched = field === 'referrer'
    ? recognized.some((value) => referrerMatches(value, context.referrerHost))
    : recognized.some((value) => value.toLowerCase() === actualValue(field, context))
  if (operator === 'is_not') return !matched
  return matched
}

function canonicalOperator(operator: string): RoutingOperator | string {
  return operator === 'any_of' ? 'is' : operator
}

function actualValue(field: RoutingField, context: RoutingContext): string {
  switch (field) {
    case 'browser':
      return clean(context.browser)
    case 'device':
      return clean(context.device)
    case 'operating_system':
      return clean(context.operatingSystem)
    case 'country':
      return clean(context.countryCode)
    case 'utm_source':
    case 'utm_medium':
    case 'utm_campaign':
    case 'utm_id':
    case 'utm_term':
    case 'utm_content':
      return clean(context.utm?.[field])
    default:
      return ''
  }
}

function referrerMatches(presetId: string, host: string | null): boolean {
  const preset = REFERRER_PRESETS.find((item) => item.id === presetId)
  if (!preset) return false
  if (preset.id === 'none') return !clean(host)
  const value = clean(host)
  if (!value) return false
  return preset.hosts.some((suffix) => value === suffix || value.endsWith(`.${suffix}`))
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
