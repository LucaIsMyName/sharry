import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
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
import { EmptyState } from "../components/empty-state.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { RowSkeleton, Skeleton, StatSkeleton } from "../components/ui/skeleton.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  ClickableTableRow,
  TableRow,
} from "../components/ui/table.tsx";
import { cn } from "cn";
import { chartDayLabel } from "../chart-day.ts";
import { AnalyticsSummary, useReportRange } from "../components/analytics-summary.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { useI18n } from "../i18n/index.tsx";

export function AnalyticsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const linkId = params.get("link");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [links, setLinks] = useState<LinkStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [earliest, setEarliest] = useState<string | undefined>();
  const aiAvailable = useAiAvailable();
  const report = useReportRange(linkId ? undefined : earliest);
  const selected = links.find((link) => link.id === linkId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setAnalytics(null);
    setLoading(true);
    const rangeQuery = aiAvailable ? `?from=${report.range.from}&to=${report.range.to}` : "";
    const overview = api<Analytics & { links: LinkStat[] }>(`/api/analytics${rangeQuery}`)
      .then((combined) => {
        if (cancelled) return;
        setLinks(combined.links);
        if (combined.earliestCreatedAt) setEarliest(combined.earliestCreatedAt);
        if (!linkId) setAnalytics(combined);
      })
      .catch((caught: unknown) => {
        if (!cancelled) toastCaught(caught, t("Could not load analytics"));
      });
    if (linkId) {
      void api<Analytics>(`/api/links/${linkId}/analytics${rangeQuery}`)
        .then((result) => {
          if (!cancelled) setAnalytics(result);
        })
        .catch((caught: unknown) => {
          if (!cancelled) toastCaught(caught, t("Could not load this link"));
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
  }, [linkId, aiAvailable, report.range.from, report.range.to]);

  return (
    <section>
      <PageHeader
        title={
          selected ? (
            <Link to={`/links/${selected.id}`}>{selected.title?.trim() || selected.slug}</Link>
          ) : (
            t("Analytics")
          )
        }
        lede={t(
          "Visitor addresses are not stored. Country appears only when a local GeoIP database is configured.",
        )}
        action={
          linkId ? (
            <Button variant="outline" size="sm" type="button" onClick={() => setParams({})}>
              <ArrowLeft /> {t("All links")}
            </Button>
          ) : null
        }
      />
      {loading && !analytics ? (
        <div className="grid gap-4">
          <StatSkeleton />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">{t("Clicks")}</span>
                <b className="mt-1 block text-3xl">{analytics.totalClicks}</b>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  {t("Unique visitors")}
                </span>
                <b className="mt-1 block text-3xl">
                  {analytics.uniqueVisitors}
                </b>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  {t("Bot clicks")}
                </span>
                <b className="mt-1 block text-3xl">{analytics.botClicks}</b>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="grid gap-4">
              {aiAvailable ? (
                <AnalyticsSummary
                  linkId={linkId ?? undefined}
                  earliest={linkId ? undefined : earliest}
                  range={report.range}
                  onRange={(from, to) => report.setRange({ from, to })}
                />
              ) : null}
              <ClickChart series={analytics.series} />
            </CardContent>
          </Card>
          <AnalyticsBreakdowns analytics={analytics} />
        </div>
      ) : null}
      <div className="mt-4 min-w-0">
          <h2 className="mb-3 text-lg font-medium">{t("Links")}</h2>
          {loading && links.length === 0 ? (
            <RowSkeleton label="Loading links…" />
          ) : links.length === 0 ? (
            <EmptyState
              action={
                <Link className={buttonVariants({ size: "sm" })} to="/links/new">
                  <Plus /> {t("New link")}
                </Link>
              }
            >
              {t("No links yet.")}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Link")}</TableHead>
                  <TableHead>{t("Clicks")}</TableHead>
                  <TableHead>{t("Unique visitors")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const name = link.title?.trim() || link.slug;
                  return (
                  <ClickableTableRow
                    key={link.id}
                    label={name}
                    className={cn(link.id === linkId && "bg-muted")}
                    onSelect={() => setParams({ link: link.id })}
                  >
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>{link.clicks}</TableCell>
                    <TableCell>{link.uniqueVisitors}</TableCell>
                  </ClickableTableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </div>
    </section>
  );
}

export function ClickChart({ series }: { series: Analytics["series"] }) {
  const { locale, t } = useI18n();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            minTickGap={24}
            tickFormatter={(value) => chartDayLabel(String(value), locale)}
          />
          <YAxis allowDecimals={false} width={36} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const clicks = payload[0]?.value ?? 0;
              return (
                <div className="rounded-md bg-popover px-2.5 py-1.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
                  <div>{chartDayLabel(String(label), locale)}</div>
                  <div className="tabular-nums">
                    {clicks} {t("Clicks")}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="clicks"
            name={t("Clicks")}
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsBreakdowns({ analytics }: { analytics: Analytics }) {
  const { t } = useI18n();
  const bots =
    analytics.totalClicks <= 0
      ? []
      : [
          { name: t("People"), clicks: Math.max(0, analytics.totalClicks - analytics.botClicks) },
          { name: t("Bots"), clicks: analytics.botClicks },
        ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Breakdown title={t("Referrers")} rows={analytics.referrers} />
      <Breakdown title={t("Countries")} rows={analytics.countries} />
      <Breakdown title={t("Browsers")} rows={analytics.browsers} />
      <Breakdown title={t("Operating systems")} rows={analytics.operatingSystems} />
      <Breakdown title={t("Devices")} rows={analytics.devices} />
      <Breakdown title={t("Bots")} rows={bots} />
      <UtmBreakdowns analytics={analytics} />
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

const barTones = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"] as const;

function barTone(index: number): string {
  return barTones[index % barTones.length] ?? "bg-chart-1";
}

export function Breakdown({
  title,
  rows,
  plain = false,
}: {
  title: string;
  rows: { name: string; clicks: number }[];
  plain?: boolean;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((row) => row.clicks));
  const body =
    rows.length === 0 ? (
      <EmptyState>{t("No data yet.")}</EmptyState>
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
                className={cn("block h-full", barTone(index))}
                style={{ width: `${(row.clicks / max) * 100}%` }}
              />
            </div>
            <b>{row.clicks}</b>
          </div>
        ))}
      </div>
    );
  if (plain) {
    return (
      <div>
        <h2 className="mb-3 font-medium">{t(title)}</h2>
        {body}
      </div>
    );
  }
  return (
    <Card>
      <CardContent>
        <h2 className="mb-3 text-lg font-medium">{t(title)}</h2>
        {body}
      </CardContent>
    </Card>
  );
}
