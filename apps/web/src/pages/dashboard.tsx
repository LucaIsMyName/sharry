import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type Analytics, type ShortLink } from '../api.ts'
import { ClickChart } from './analytics.tsx'

export function DashboardPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void Promise.all([
      api<{ links: ShortLink[] }>('/api/links?limit=5'),
      api<Analytics>('/api/analytics'),
    ]).then(([linkData, analyticsData]) => {
      setLinks(linkData.links)
      setAnalytics(analyticsData)
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the overview'))
  }, [])

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="muted">Clicks stay attached to the short link when the destination changes.</p>
        </div>
        <Link className="btn btn-accent" to="/links/new">New link</Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid stats">
        <article className="card stat"><span className="muted">Clicks, 30 days</span><b>{analytics?.totalClicks ?? '—'}</b></article>
        <article className="card stat"><span className="muted">Unique visitors</span><b>{analytics?.uniqueVisitors ?? '—'}</b></article>
        <article className="card stat"><span className="muted">Bot clicks</span><b>{analytics?.botClicks ?? '—'}</b></article>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        {analytics ? <ClickChart series={analytics.series} /> : <p className="muted">Loading analytics…</p>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Recent links</h2>
        {links.length === 0 ? <p className="muted">No links yet.</p> : (
          <table className="table">
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td><Link to={`/links/${link.id}`}>{link.slug}</Link></td>
                  <td className="muted">{link.destinationUrl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
