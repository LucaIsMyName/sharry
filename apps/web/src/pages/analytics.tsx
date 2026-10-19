import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api, type Analytics } from '../api.ts'

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
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Visitor addresses are not stored. Country appears only when a local GeoIP database is configured.</p>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {analytics ? (
        <div className="stack">
          <div className="card"><ClickChart series={analytics.series} /></div>
          <div className="split">
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
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <CartesianGrid stroke="#eee6da" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip />
          <Line type="monotone" dataKey="clicks" stroke="#0c6b4d" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Breakdown({ title, rows }: { title: string; rows: { name: string; clicks: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.clicks))
  return (
    <article className="card">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="muted">No data yet.</p> : (
        <div className="bars">
          {rows.map((row) => (
            <div className="bar-row" key={row.name}>
              <span>{row.name}</span>
              <div className="bar"><span style={{ width: `${(row.clicks / max) * 100}%` }} /></div>
              <b>{row.clicks}</b>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
