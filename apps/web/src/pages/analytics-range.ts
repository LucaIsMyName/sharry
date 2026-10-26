const dayMs = 24 * 60 * 60 * 1000

export const maxAnalyticsDays = 400

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function parseDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return time
}

export function formatDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

export function addDays(day: string, days: number): string {
  const time = parseDay(day)
  if (time == null) return day
  return formatDay(time + days * dayMs)
}

export function dayNumber(day: string): number {
  const time = parseDay(day)
  if (time == null) return 0
  return Math.round(time / dayMs)
}

export function dayFromNumber(value: number): string {
  return formatDay(value * dayMs)
}

export function inclusiveDays(from: string, to: string): number {
  const start = parseDay(from)
  const end = parseDay(to)
  if (start == null || end == null || end < start) return 0
  return Math.round((end - start) / dayMs) + 1
}

function asDay(value: string | undefined): string | undefined {
  if (!value) return undefined
  const day = value.slice(0, 10)
  return parseDay(day) == null ? undefined : day
}

export function clampDay(day: string, min: string, max: string): string {
  if (day < min) return min
  if (day > max) return max
  return day
}

export function trackStartFor(
  scope: "all" | "link",
  earliest: string | undefined,
  linkCreatedAt: string | undefined,
  today: string,
): string {
  const candidate = scope === "link" ? asDay(linkCreatedAt) ?? asDay(earliest) : asDay(earliest)
  if (!candidate || candidate > today) return today
  return candidate
}

export function clampWindow(
  from: string,
  to: string,
  trackStart: string,
  trackEnd: string,
): { from: string; to: string } {
  const start = clampDay(from, trackStart, trackEnd)
  const end = clampDay(to, trackStart, trackEnd)
  if (start > end) return initialWindow(trackStart, trackEnd)
  return { from: start, to: end }
}

export function initialWindow(
  trackStart: string,
  trackEnd: string,
  prefillFrom?: string,
  prefillTo?: string,
): { from: string; to: string } {
  const fallbackFrom = clampDay(addDays(trackEnd, -29), trackStart, trackEnd)
  const from = asDay(prefillFrom) ?? fallbackFrom
  const to = asDay(prefillTo) ?? trackEnd
  const start = clampDay(from, trackStart, trackEnd)
  const end = clampDay(to, trackStart, trackEnd)
  if (start > end) return { from: fallbackFrom, to: trackEnd }
  return { from: start, to: end }
}
