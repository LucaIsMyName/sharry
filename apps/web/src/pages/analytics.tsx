import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type Analytics, type LinkStat } from "../api.ts";
import { Button } from "../components/ui/button.tsx";
import { Notice } from "../components/ui/notice.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.tsx";
import { cn } from "cn";

export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const linkId = params.get("link");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [links, setLinks] = useState<LinkStat[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selected = links.find((link) => link.id === linkId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setError("");
    setAnalytics(null);
    setLoading(true);
    const overview = api<Analytics & { links: LinkStat[] }>("/api/analytics")
      .then((combined) => {
        if (cancelled) return;
        setLinks(combined.links);
        if (!linkId) setAnalytics(combined);
      })
      .catch((caught: unknown) => {
        if (!cancelled)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load analytics",
          );
      });
    if (linkId) {
      void api<Analytics>(`/api/links/${linkId}/analytics`)
        .then((result) => {
          if (!cancelled) setAnalytics(result);
        })
        .catch((caught: unknown) => {
          if (!cancelled)
            setError(
              caught instanceof Error
                ? caught.message
                : "Could not load this link",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      void overview.finally(() => {
        if (!cancelled) setLoading(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            {selected ? (
              <Link to={`/links/${selected.id}`}>
                {selected.title?.trim() || selected.slug}
              </Link>
            ) : (
              "Analytics"
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Visitor addresses are not stored. Country appears only when a local
            GeoIP database is configured.
          </p>
        </div>
        {linkId ? (
          <Button variant="outline" type="button" onClick={() => setParams({})}>
            All links
          </Button>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !analytics ? (
        <p className="text-sm text-muted-foreground">Loading analytics…</p>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">Clicks</span>
                <b className="mt-1 block text-3xl">{analytics.totalClicks}</b>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  Unique visitors
                </span>
                <b className="mt-1 block text-3xl">
                  {analytics.uniqueVisitors}
                </b>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  Bot clicks
                </span>
                <b className="mt-1 block text-3xl">{analytics.botClicks}</b>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent>
              <ClickChart series={analytics.series} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title="Referrers" rows={analytics.referrers} />
            <Breakdown title="Countries" rows={analytics.countries} />
            <Breakdown title="Browsers" rows={analytics.browsers} />
            <Breakdown title="Devices" rows={analytics.devices} />
            <UtmBreakdowns analytics={analytics} />
          </div>
        </div>
      ) : null}
      <Card className="mt-4 min-w-0">
        <CardContent className="min-w-0">
          <h2 className="mb-3 text-lg font-medium">Links</h2>
          {loading && links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading links…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <Table className="min-w-full w-max">
              <TableHeader>
                <TableRow>
                  <TableHead>Link</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Unique visitors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow
                    key={link.id}
                    className={cn(link.id === linkId && "bg-muted")}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium"
                        onClick={() => setParams({ link: link.id })}
                      >
                        {link.title?.trim() || link.slug}
                      </button>
                    </TableCell>
                    <TableCell>{link.clicks}</TableCell>
                    <TableCell>{link.uniqueVisitors}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function ClickChart({ series }: { series: Analytics["series"] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function UtmBreakdowns({ analytics }: { analytics: Analytics }) {
  const rows = [
    ["utm_source", analytics.utmSources],
    ["utm_medium", analytics.utmMediums],
    ["utm_campaign", analytics.utmCampaigns],
    ["utm_id", analytics.utmIds],
    ["utm_term", analytics.utmTerms],
    ["utm_content", analytics.utmContents],
  ] as const;
  return rows.map(([title, values]) => (
    <Breakdown key={title} title={title} rows={values} />
  ));
}

export function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; clicks: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.clicks));
  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 text-lg font-medium">{title}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="grid gap-2">
            {rows.map((row, index) => (
              <div
                className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-sm"
                key={`${index}-${row.name}`}
              >
                <span className="truncate">{row.name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full bg-primary"
                    style={{ width: `${(row.clicks / max) * 100}%` }}
                  />
                </div>
                <b>{row.clicks}</b>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
