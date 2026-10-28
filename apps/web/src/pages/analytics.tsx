import { useEffect, useRef, useState } from "react";
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
import { Section } from "../components/ui/section.tsx";
import { DataTable, type DataColumn } from "../components/ui/data-table.tsx";
import { cn } from "cn";
import { chartDayLabel } from "../chart-day.ts";
import { AnalyticsFilters } from "../components/analytics-filters.tsx";
import { AnalyticsSummary, useReportRange } from "../components/analytics-summary.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { useI18n } from "../i18n/index.tsx";
import { clampWindow, inclusiveDays, maxAnalyticsDays } from "./analytics-range.ts";
import { DateRangeSlider } from "./date-range-slider.tsx";

export function AnalyticsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const linkIds = params.getAll("link");
  const [analytics, setAnalytics] = useState<(Analytics & { links: LinkStat[] }) | null>(null);
  const [links, setLinks] = useState<LinkStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [earliest, setEarliest] = useState<string | undefined>();
  const aiAvailable = useAiAvailable();
  const report = useReportRange(linkIds.length === 1 ? undefined : earliest);
  const selected = linkIds.length === 1 ? (links.find((link) => link.id === linkIds[0]) ?? null) : null;
  const urlFrom = params.get("from") ?? "";
  const urlTo = params.get("to") ?? "";
  const hasDates = /^\d{4}-\d{2}-\d{2}$/.test(urlFrom) && /^\d{4}-\d{2}-\d{2}$/.test(urlTo);
  const tooLong = hasDates && inclusiveDays(urlFrom, urlTo) > maxAnalyticsDays;
  const window = hasDates
    ? clampWindow(urlFrom, urlTo, report.trackStart, report.today)
    : report.range;
  const queryKey = params.toString();
  const loaded = useRef(false);

  useEffect(() => {
    if (tooLong) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (!loaded.current) setLoading(true);
    const search = queryKey ? `?${queryKey}` : "";
    void api<Analytics & { links: LinkStat[] }>(`/api/analytics${search}`)
      .then((combined) => {
        if (cancelled) return;
        loaded.current = true;
        setLinks(combined.links);
        if (combined.earliestCreatedAt) setEarliest(combined.earliestCreatedAt);
        setAnalytics(combined);
      })
      .catch((caught: unknown) => {
        if (!cancelled) toastCaught(caught, t("Could not load analytics"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, tooLong]);

  function setDates(from: string, to: string) {
    const next = new URLSearchParams(params);
    next.set("from", from);
    next.set("to", to);
    setParams(next);
  }

  function selectLink(id: string) {
    setLinkIds([id]);
  }

  function setLinkIds(ids: string[]) {
    const next = new URLSearchParams(params);
    next.delete("link");
    for (const id of ids) next.append("link", id);
    setParams(next);
  }

  function clearLinks() {
    const next = new URLSearchParams(params);
    next.delete("link");
    setParams(next);
  }

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
          linkIds.length > 0 ? (
            <Button variant="outline" size="sm" type="button" onClick={clearLinks}>
              <ArrowLeft /> {t("All links")}
            </Button>
          ) : null
        }
      />
      <AnalyticsFilters params={params} links={links} options={analytics?.options} onChange={setParams} />
      {tooLong && !analytics ? (
        <p className="mb-4 text-sm text-destructive">{t("Choose a range of 400 days or fewer")}</p>
      ) : null}
      {loading && !analytics ? (
        <div className="grid gap-4">
          <StatSkeleton />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-6 border-b border-border pb-4">
            <Metric label={t("Clicks")} value={analytics.totalClicks} />
            <Metric label={t("Unique visitors")} value={analytics.uniqueVisitors} />
            <Metric label={t("Bot clicks")} value={analytics.botClicks} />
          </div>
          {aiAvailable ? (
            <Section>
              <AnalyticsSummary
                showRange={false}
                earliest={linkIds.length === 1 ? undefined : earliest}
                range={window}
                onRange={setDates}
                filters={{
                  linkIds,
                  country: params.getAll("country"),
                  browser: params.getAll("browser"),
                  os: params.getAll("os"),
                  referrer: params.getAll("referrer"),
                  device: params.getAll("device"),
                  utm_source: params.getAll("utm_source"),
                  utm_medium: params.getAll("utm_medium"),
                  utm_campaign: params.getAll("utm_campaign"),
                  utm_id: params.getAll("utm_id"),
                  utm_term: params.getAll("utm_term"),
                  utm_content: params.getAll("utm_content"),
                }}
              />
            </Section>
          ) : null}
          <Section title={t("Date range")}>
            <DateRangeSlider
              min={report.trackStart}
              max={report.today}
              start={window.from}
              end={window.to}
              onChange={setDates}
            />
            {tooLong ? (
              <p className="text-sm text-destructive">{t("Choose a range of 400 days or fewer")}</p>
            ) : null}
            <ClickChart series={analytics.series} onRange={setDates} />
          </Section>
          <AnalyticsBreakdowns
            analytics={analytics}
            selected={{
              Referrers: params.getAll("referrer"),
              Countries: params.getAll("country"),
              Browsers: params.getAll("browser"),
              "Operating systems": params.getAll("os"),
              Devices: params.getAll("device"),
              utm_source: params.getAll("utm_source"),
              utm_medium: params.getAll("utm_medium"),
              utm_campaign: params.getAll("utm_campaign"),
              utm_id: params.getAll("utm_id"),
              utm_term: params.getAll("utm_term"),
              utm_content: params.getAll("utm_content"),
            }}
            onSelect={(title, name) => toggleBreakdown(params, setParams, title, name)}
          />
        </div>
      ) : null}
      <Section className="mt-4" title={t("Links")}>
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
            <DataTable
              storageKey="analytics-links"
              columns={analyticsLinkColumns}
              rows={links}
              selectable
              selectedIds={linkIds}
              onSelectedIds={setLinkIds}
              getRow={(link) => ({
                id: link.id,
                label: link.title?.trim() || link.slug,
                onSelect: () => selectLink(link.id),
                className: cn(linkIds.includes(link.id) && "bg-muted"),
              })}
            />
          )}
      </Section>
    </section>
  );
}

const analyticsLinkColumns: DataColumn<LinkStat>[] = [
  {
    id: "name",
    header: "Link",
    sortable: true,
    filter: "text",
    sortValue: (link) => link.title?.trim() || link.slug,
    filterValue: (link) => link.title?.trim() || link.slug,
    cell: (link) => <span className="font-medium">{link.title?.trim() || link.slug}</span>,
  },
  {
    id: "clicks",
    header: "Clicks",
    sortable: true,
    filter: "text",
    align: "right",
    sortValue: (link) => link.clicks,
    filterValue: (link) => String(link.clicks),
    cell: (link) => link.clicks,
  },
  {
    id: "unique",
    header: "Unique visitors",
    sortable: true,
    filter: "text",
    align: "right",
    sortValue: (link) => link.uniqueVisitors,
    filterValue: (link) => String(link.uniqueVisitors),
    cell: (link) => link.uniqueVisitors,
  },
];

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-sm text-muted-foreground">{label}</span>
      <b className="mt-1 block text-3xl tabular-nums">{value}</b>
    </div>
  );
}

const breakdownParams: Record<string, string> = {
  Referrers: "referrer",
  Countries: "country",
  Browsers: "browser",
  "Operating systems": "os",
  Devices: "device",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_id: "utm_id",
  utm_term: "utm_term",
  utm_content: "utm_content",
};

function toggleBreakdown(
  params: URLSearchParams,
  setParams: (next: URLSearchParams) => void,
  title: string,
  name: string,
) {
  const key = breakdownParams[title];
  if (!key) return;
  const value = key === "referrer" && name === "Direct" ? "Not set" : name;
  const next = new URLSearchParams(params);
  const values = next.getAll(key).filter((item) => item !== value);
  next.delete(key);
  const adding = !params.getAll(key).includes(value);
  for (const item of adding ? [...values, value] : values) next.append(key, item);
  setParams(next);
}

export function ClickChart({
  series,
  metric = "Clicks",
  onRange,
}: {
  series: Analytics["series"];
  metric?: string;
  onRange?: (from: string, to: string) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={series}
          onClick={(state) => {
            const day = state?.activeLabel;
            if (day && onRange) onRange(String(day), String(day));
          }}
        >
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
                    {clicks} {t(metric)}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="clicks"
            name={t(metric)}
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsBreakdowns({
  analytics,
  selected = {},
  onSelect,
}: {
  analytics: Analytics;
  selected?: Record<string, string[]>;
  onSelect?: (title: string, name: string) => void;
}) {
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
      <Breakdown title="Referrers" rows={analytics.referrers} selected={selected.Referrers} onSelect={onSelect} />
      <Breakdown title="Countries" rows={analytics.countries} selected={selected.Countries} onSelect={onSelect} />
      <Breakdown title="Browsers" rows={analytics.browsers} selected={selected.Browsers} onSelect={onSelect} />
      <Breakdown title="Operating systems" rows={analytics.operatingSystems} selected={selected["Operating systems"]} onSelect={onSelect} />
      <Breakdown title="Devices" rows={analytics.devices} selected={selected.Devices} onSelect={onSelect} />
      <Breakdown title="Bots" rows={bots} />
      <UtmBreakdowns analytics={analytics} selected={selected} onSelect={onSelect} />
    </div>
  );
}

export function UtmBreakdowns({
  analytics,
  selected = {},
  onSelect,
}: {
  analytics: Analytics;
  selected?: Record<string, string[]>;
  onSelect?: (title: string, name: string) => void;
}) {
  const rows = [
    ["utm_source", analytics.utmSources],
    ["utm_medium", analytics.utmMediums],
    ["utm_campaign", analytics.utmCampaigns],
    ["utm_id", analytics.utmIds],
    ["utm_term", analytics.utmTerms],
    ["utm_content", analytics.utmContents],
  ] as const;
  return rows.map(([title, values]) => (
    <Breakdown key={title} title={title} rows={values} selected={selected[title]} onSelect={onSelect} />
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
  selected = [],
  onSelect,
}: {
  title: string;
  rows: { name: string; clicks: number }[];
  plain?: boolean;
  selected?: string[];
  onSelect?: (title: string, name: string) => void;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...rows.map((row) => row.clicks));
  const body =
    rows.length === 0 ? (
      <EmptyState>{t("No data yet.")}</EmptyState>
    ) : (
      <div className="grid gap-2">
        {rows.map((row, index) => {
          const value = title === "Referrers" && row.name === "Direct" ? "Not set" : row.name;
          const active = selected.includes(value) || selected.includes(row.name);
          const content = (
            <>
              <span className="truncate text-left">{row.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <span className={cn("block h-full", barTone(index))} style={{ width: `${(row.clicks / max) * 100}%` }} />
              </div>
              <b>{row.clicks}</b>
            </>
          );
          if (!onSelect) {
            return (
              <div className="grid grid-cols-[120px_1fr_auto] items-center gap-2 text-sm" key={`${index}-${row.name}`}>
                {content}
              </div>
            );
          }
          return (
            <button
              type="button"
              key={`${index}-${row.name}`}
              className={cn(
                "grid grid-cols-[120px_1fr_auto] items-center gap-2 rounded-md px-1 text-left text-sm",
                active && "bg-accent",
              )}
              aria-pressed={active}
              onClick={() => onSelect(title, row.name)}
            >
              {content}
            </button>
          );
        })}
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
  return <Section title={t(title)}>{body}</Section>;
}
