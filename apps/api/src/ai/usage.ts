import { sql } from 'drizzle-orm'
import { aiUsageEvents, type Database } from '@sharry/database'
import { rowsOf } from '../settings-store.ts'

export type ModelUsage = {
  promptTokens: number | null
  completionTokens: number | null
}

const usageWindowDays = 30

export async function recordAiUsage(
  db: Database,
  row: { userId: string; feature: string; model: string } & ModelUsage,
): Promise<void> {
  await db.insert(aiUsageEvents).values({
    userId: row.userId,
    feature: row.feature,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
  })
}

export async function purgeOldAiUsage(db: Database, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const result = await db.execute(sql`
    delete from ai_usage_events
    where occurred_at < now() - make_interval(days => ${retentionDays})
  `)
  if (typeof result === 'object' && result && 'rowCount' in result && typeof result.rowCount === 'number') {
    return result.rowCount
  }
  return 0
}

export async function loadAiUsage(db: Database): Promise<{
  totalTokens: number
  series: { date: string; clicks: number }[]
  features: { name: string; tokens: number }[]
}> {
  const since = new Date(Date.now() - usageWindowDays * 24 * 60 * 60 * 1000)
  const rows = rowsOf<{ date: string; feature: string; tokens: number }>(
    await db.execute(sql`
      select to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD') as date,
             feature,
             (coalesce(sum(prompt_tokens), 0) + coalesce(sum(completion_tokens), 0))::int as tokens
      from ai_usage_events
      where occurred_at >= ${since}
      group by 1, 2
    `),
  )
  const byDay = new Map<string, number>()
  const byFeature = new Map<string, number>()
  for (const row of rows) {
    byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.tokens)
    byFeature.set(row.feature, (byFeature.get(row.feature) ?? 0) + row.tokens)
  }
  const series = recentDays(usageWindowDays).map((date) => ({ date, clicks: byDay.get(date) ?? 0 }))
  const features = [...byFeature.entries()]
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((left, right) => right.tokens - left.tokens || left.name.localeCompare(right.name))
  return {
    totalTokens: series.reduce((sum, day) => sum + day.clicks, 0),
    series,
    features,
  }
}

function recentDays(count: number): string[] {
  const days: string[] = []
  const cursor = new Date()
  const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - (count - 1))
  for (let index = 0; index < count; index += 1) {
    days.push(start.toISOString().slice(0, 10))
    start.setUTCDate(start.getUTCDate() + 1)
  }
  return days
}
