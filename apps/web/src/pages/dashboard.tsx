import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type Analytics, type ShortLink } from '../api.ts'
import { buttonVariants } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table.tsx'
import { ClickChart } from './analytics.tsx'

export function DashboardPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([
      api<{ links: ShortLink[] }>('/api/links?limit=5'),
      api<Analytics>('/api/analytics'),
    ]).then(([linkData, analyticsData]) => {
      setLinks(linkData.links)
      setAnalytics(analyticsData)
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the overview'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Clicks stay attached to the short link when the destination changes.</p>
        </div>
        <Link className={buttonVariants()} to="/links/new">New link</Link>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Card><CardContent><span className="text-sm text-muted-foreground">Clicks, 30 days</span><b className="mt-1 block text-3xl">{analytics?.totalClicks ?? '—'}</b></CardContent></Card>
        <Card><CardContent><span className="text-sm text-muted-foreground">Unique visitors</span><b className="mt-1 block text-3xl">{analytics?.uniqueVisitors ?? '—'}</b></CardContent></Card>
        <Card><CardContent><span className="text-sm text-muted-foreground">Bot clicks</span><b className="mt-1 block text-3xl">{analytics?.botClicks ?? '—'}</b></CardContent></Card>
      </div>
      <Card className="mt-4">
        <CardContent>
          {analytics ? <ClickChart series={analytics.series} /> : <p className="text-sm text-muted-foreground">Loading analytics…</p>}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardContent>
          <h2 className="mb-2 text-lg font-medium">Recent links</h2>
          {loading ? <p className="text-sm text-muted-foreground">Loading links…</p> : links.length === 0 ? <p className="text-sm text-muted-foreground">No links yet.</p> : (
            <Table>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell><Link to={`/links/${link.id}`}>{link.slug}</Link></TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{link.destinationUrl}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
