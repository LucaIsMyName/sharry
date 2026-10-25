import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router";
import { api, type Analytics, type LinkSummary } from "../api.ts";
import { buttonVariants } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            {t("Overview")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Clicks stay attached to the short link when the destination changes.",
            )}
          </p>
        </div>
        <Link className={buttonVariants({ size: "sm" })} to="/links/new">
          <Plus /> {t("New link")}
        </Link>
      </div>
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
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("Loading analytics…")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      <Card className="mt-4">
        <CardContent>
          <h2 className="mb-2 text-lg font-medium">{t("Recent links")}</h2>
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
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {t("Loading links…")}
                  </TableCell>
                </TableRow>
              ) : failed ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {t("Could not load links.")}
                  </TableCell>
                </TableRow>
              ) : links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    {t("No links yet.")}
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="truncate">
                      <Link
                        className="font-medium hover:text-primary"
                        to={`/links/${link.id}`}
                      >
                        {link.title?.trim() || link.slug}
                      </Link>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
