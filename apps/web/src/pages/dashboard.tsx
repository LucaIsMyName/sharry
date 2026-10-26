import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { api, type Analytics, type LinkSummary } from "../api.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { RowSkeleton, Skeleton, StatSkeleton } from "../components/ui/skeleton.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  ClickableTableRow,
  TableRow,
} from "../components/ui/table.tsx";
import { useI18n } from "../i18n/index.tsx";
import { ClickChart } from "./analytics.tsx";

export function DashboardPage() {
  const { t } = useI18n();
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      api<{ links: LinkSummary[] }>("/api/links?limit=5"),
      api<Analytics>("/api/analytics"),
    ])
      .then(([linkData, analyticsData]) => {
        setLinks(linkData.links);
        setAnalytics(analyticsData);
      })
      .catch((caught: unknown) => {
        setFailed(true);
        toastCaught(caught, t("Could not load the overview"));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <PageHeader
        title={t("Overview")}
        lede={t("Clicks stay attached to the short link when the destination changes.")}
        action={
          <Link className={buttonVariants({ size: "sm" })} to="/links/new">
            <Plus /> {t("New link")}
          </Link>
        }
      />
      {loading && !analytics && !failed ? (
        <div className="grid gap-4">
          <StatSkeleton />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
      <>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Card>
          <CardContent>
            <span className="text-sm text-muted-foreground">
              {t("Clicks, 30 days")}
            </span>
            <b className="mt-1 block text-3xl tabular-nums">
              {analytics?.totalClicks ?? "—"}
            </b>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span className="text-sm text-muted-foreground">
              {t("Unique visitors")}
            </span>
            <b className="mt-1 block text-3xl tabular-nums">
              {analytics?.uniqueVisitors ?? "—"}
            </b>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <span className="text-sm text-muted-foreground">{t("Bot clicks")}</span>
            <b className="mt-1 block text-3xl tabular-nums">
              {analytics?.botClicks ?? "—"}
            </b>
          </CardContent>
        </Card>
      </div>
      {failed ? null : (
        <Card className="mt-4">
          <CardContent>
            {analytics ? (
              <ClickChart series={analytics.series} />
            ) : null}
          </CardContent>
        </Card>
      )}
      </>
      )}
      <div className="mt-4">
          <h2 className="mb-2 text-lg font-medium">{t("Recent links")}</h2>
          {loading ? (
            <RowSkeleton label="Loading links…" />
          ) : failed ? (
            <EmptyState>{t("Could not load links.")}</EmptyState>
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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">
                  {t("Link")}
                </TableHead>
                <TableHead>{t("Destination")}</TableHead>
                <TableHead className="w-20">{t("Clicks")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {links.map((link) => {
                  const name = link.title?.trim() || link.slug;
                  return (
                  <ClickableTableRow key={link.id} to={`/links/${link.id}`} label={name}>
                    <TableCell className="truncate font-medium">
                      {name}
                    </TableCell>
                    <TableCell
                      className="truncate text-muted-foreground"
                      title={link.destinationUrl}
                    >
                      {link.destinationUrl}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {link.clicks}
                    </TableCell>
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
