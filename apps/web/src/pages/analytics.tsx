import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type Analytics } from '../api.ts'
import { Card, CardContent } from '../components/ui/card.tsx'

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void api<Analytics>('/api/analytics')
      .then(setAnalytics)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load analytics'))
  }, [])

  return (
    <section>
      <div className="mb-5">
        <h1 className="font-heading text-4xl font-medium tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Visitor addresses are not stored. Country appears only when a local GeoIP database is configured.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {analytics ? (
        <div className="grid gap-4">
          <Card><CardContent><ClickChart series={analytics.series} /></CardContent></Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title="Referrers" rows={analytics.referrers} />
            <Breakdown title="Countries" rows={analytics.countries} />
            <Breakdown title="Browsers" rows={analytics.browsers} />
            <Breakdown title="Devices" rows={analytics.devices} />
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function ClickChart({ series }: { series: Analytics['series'] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <CartesianGrid stroke="#eee6da" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip />
          <Line type="monotone" dataKey="clicks" stroke="var(--primary)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Breakdown({ title, rows }: { title: string; rows: { name: string; clicks: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.clicks))
  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 text-lg font-medium">{title}</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> : (
          <div className="grid gap-2">
            {rows.map((row) => (
              <div className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-sm" key={row.name}>
                <span className="truncate">{row.name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-primary" style={{ width: `${(row.clicks / max) * 100}%` }} /></div>
                <b>{row.clicks}</b>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
