import { useEffect, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Link } from "react-router";
import type { ChatBlock, ChatFormLink } from "@sharry/shared";
import { ApiError, api } from "../api.ts";
import { Breakdown, ClickChart } from "./analytics.tsx";
import { downloadAnalyticsPdf } from "./analytics-pdf.ts";
import { clampWindow, inclusiveDays, initialWindow, maxAnalyticsDays, trackStartFor, utcToday } from "./analytics-range.ts";
import { DateRangeSlider } from "./date-range-slider.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.tsx";
import { useI18n } from "../i18n/index.tsx";

const noLink = "__none__";

export function CopyableUrl({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <p className="min-w-0 flex-1 font-mono text-sm break-all">{url}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void copyText(url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? (
          <>
            <Check /> {t("Copied")}
          </>
        ) : (
          <>
            <Copy /> {t("Copy")}
          </>
        )}
      </Button>
    </div>
  );
}

function blockPath(block: ChatBlock): string | undefined {
  if (block.type === "chart" || block.type === "bars" || block.type === "table") return block.path;
  return undefined;
}

function labeledRows(
  rows: { name: string; clicks: number }[],
  t: (message: string) => string,
): { name: string; clicks: number }[] {
  return rows.map((row) => ({
    ...row,
    name: row.name === "People" ? t("People") : row.name === "Bots" ? t("Bots") : row.name,
  }));
}

export function ChatBlocks({
  blocks,
  reportText = "",
  submitting,
  aiAvailable,
  onSubmit,
}: {
  blocks: ChatBlock[];
  reportText?: string;
  submitting: string | null;
  aiAvailable: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const path = blocks.map(blockPath).find((value) => value);
  const hasChart = blocks.some((block) => block.type === "chart" || (block.type === "bars" && block.rows.length > 0));
  return (
    <div className="grid gap-4">
      {blocks.map((block, index) => {
        if (block.type === "form") {
          return (
            <FormCard
              key={block.id}
              block={block}
              submitting={submitting === block.id}
              aiAvailable={aiAvailable}
              onSubmit={onSubmit}
            />
          );
        }
        if (block.type === "chart") {
          return (
            <section key={`chart-${index}`} className="grid gap-2">
              <h2 className="font-medium">{t(block.title)}</h2>
              <ClickChart series={block.series} />
            </section>
          );
        }
        if (block.type === "bars") {
          if (block.rows.length === 0) return null;
          return (
            <Breakdown
              key={`bars-${index}`}
              plain
              title={block.title}
              rows={labeledRows(block.rows, t)}
            />
          );
        }
        return (
          <section key={`table-${index}`} className="grid gap-2">
            <h2 className="font-medium">{t(block.title)}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  {block.columns.map((column) => (
                    <TableHead key={column}>{t(column)}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        );
      })}
      {path || hasChart ? (
        <div className="flex flex-wrap gap-2">
          {path ? (
            <Link className={buttonVariants({ size: "sm" })} to={path}>
              {t("Open analytics")}
            </Link>
          ) : null}
          {hasChart ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const series = blocks.flatMap((block) => (block.type === "chart" ? block.series : []));
                downloadAnalyticsPdf({
                  summary: reportText,
                  clicksLabel: t("Clicks"),
                  sections: [
                    ...(series.length > 0 ? [{ title: t("Clicks"), series }] : []),
                    ...blocks.flatMap((block) =>
                      block.type === "bars" && block.rows.length > 0
                        ? [{ title: t(block.title), rows: labeledRows(block.rows, t) }]
                        : [],
                    ),
                  ],
                });
              }}
            >
              {t("Export to PDF")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FormCard({
  block,
  submitting,
  aiAvailable,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  aiAvailable: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  if (block.form === "link") return <LinkForm block={block} submitting={submitting} aiAvailable={aiAvailable} onSubmit={onSubmit} />;
  if (block.form === "analytics") return <AnalyticsForm block={block} submitting={submitting} onSubmit={onSubmit} />;
  return <CampaignForm block={block} submitting={submitting} onSubmit={onSubmit} />;
}

function LinkForm({
  block,
  submitting,
  aiAvailable,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  aiAvailable: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const prefill = block.prefill ?? {};
  const [destinationUrl, setDestinationUrl] = useState(typeof prefill.destinationUrl === "string" ? prefill.destinationUrl : "");
  const [title, setTitle] = useState(typeof prefill.title === "string" ? prefill.title : "");
  const [slug, setSlug] = useState(typeof prefill.slug === "string" ? prefill.slug : "");
  const [utmSource, setUtmSource] = useState(typeof prefill.utmSource === "string" ? prefill.utmSource : "");
  const [utmMedium, setUtmMedium] = useState(typeof prefill.utmMedium === "string" ? prefill.utmMedium : "");
  const [utmCampaign, setUtmCampaign] = useState(typeof prefill.utmCampaign === "string" ? prefill.utmCampaign : "");
  const [createQr, setCreateQr] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState(prefill.suggested === true);
  const [fromTitle, setFromTitle] = useState(prefill.fromTitle === true);
  const [suggestError, setSuggestError] = useState("");
  const done = block.status === "submitted";
  async function suggestSlug() {
    if (!destinationUrl.trim() || suggesting) return;
    setSuggesting(true);
    setSuggestError("");
    try {
      const result = await api<{ slug: string | null; fromTitle: boolean }>("/api/ai/suggest-slug", {
        method: "POST",
        body: JSON.stringify({ destinationUrl }),
      });
      if (!result.slug) {
        setSuggested(false);
        setSuggestError("Could not suggest a slug for that page.");
        return;
      }
      setSlug(result.slug);
      setSuggested(true);
      setFromTitle(result.fromTitle);
    } catch (caught) {
      setSuggested(false);
      setSuggestError(caught instanceof ApiError ? caught.message : "Could not suggest a slug for that page.");
    } finally {
      setSuggesting(false);
    }
  }
  return (
    <div className="grid gap-3">
      <h2 className="font-medium">{t("Short link")}</h2>
        {done ? (
          <FormResult block={block} />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, { destinationUrl, title, slug, createQr, utmSource, utmMedium, utmCampaign });
            }}
          >
            <Field label="Destination">
              <Input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Custom slug">
              <div className="relative">
                <Input
                  className={aiAvailable ? "pr-10" : undefined}
                  value={slug}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setSuggested(false);
                  }}
                />
                {aiAvailable ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    aria-label={t("Suggest a slug")}
                    disabled={suggesting || !destinationUrl.trim()}
                    onClick={() => void suggestSlug()}
                  >
                    <Sparkles size={16} />
                  </button>
                ) : null}
              </div>
            </Field>
            {suggested ? (
              <p className="text-sm text-muted-foreground">
                {t(fromTitle ? "Suggested from the page title." : "Suggested from the page.")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("The slug can be skipped.")}</p>
            )}
            <Field label="UTM source">
              <Input value={utmSource} onChange={(event) => setUtmSource(event.target.value)} />
            </Field>
            <Field label="UTM medium">
              <Input value={utmMedium} onChange={(event) => setUtmMedium(event.target.value)} />
            </Field>
            <Field label="UTM campaign">
              <Input value={utmCampaign} onChange={(event) => setUtmCampaign(event.target.value)} />
            </Field>
            <p className="text-sm text-muted-foreground">{t("The title and UTM fields can be skipped.")}</p>
            {suggestError ? <p className="text-sm text-destructive">{t(suggestError)}</p> : null}
            <Label className="w-fit font-normal">
              <Checkbox
                checked={createQr}
                onCheckedChange={(checked) => setCreateQr(checked === true)}
              />
              <span>{t("Create a QR code")}</span>
            </Label>
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            <Button type="submit" disabled={submitting || !destinationUrl.trim()}>
              {submitting ? t("Creating…") : t("Create link")}
            </Button>
          </form>
        )}
    </div>
  );
}

function AnalyticsForm({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const prefill = block.prefill ?? {};
  const prefillLink = typeof prefill.linkId === "string" ? prefill.linkId : "";
  const knownLink = (block.links ?? []).some((link) => link.id === prefillLink);
  const [scope, setScope] = useState<"all" | "link">(knownLink || block.result?.scope === "link" ? "link" : "all");
  const [linkId, setLinkId] = useState(block.result?.linkId ?? (knownLink ? prefillLink : ""));
  const [today] = useState(() => utcToday());
  const chosenLink = (block.links ?? []).find((link) => link.id === linkId);
  const trackStart = trackStartFor(scope, block.earliestCreatedAt, chosenLink?.createdAt, today);
  const [range, setRange] = useState(() =>
    initialWindow(
      trackStartFor(knownLink ? "link" : "all", block.earliestCreatedAt, knownLink ? chosenCreatedAt(block.links, prefillLink) : undefined, utcToday()),
      utcToday(),
      typeof prefill.from === "string" ? prefill.from : undefined,
      typeof prefill.to === "string" ? prefill.to : undefined,
    ),
  );
  useEffect(() => {
    setRange((current) => {
      const next = clampWindow(current.from, current.to, trackStart, today);
      return next.from === current.from && next.to === current.to ? current : next;
    });
  }, [trackStart, today]);
  const done = block.status === "submitted";
  const chosen = block.links?.find((link) => link.id === block.result?.linkId);
  const tooLong = inclusiveDays(range.from, range.to) > maxAnalyticsDays;
  return (
    <div className="grid gap-3">
      <h2 className="font-medium">{t("Analytics report")}</h2>
        {done ? (
          <p className="text-sm">{scope === "all" ? t("All links") : linkLabel(chosen)}</p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, { scope, linkId: scope === "link" ? linkId : undefined, from: range.from, to: range.to });
            }}
          >
            <Field label="Report">
              <Select
                value={scope}
                options={[
                  { value: "all", label: "All links" },
                  { value: "link", label: "One link" },
                ]}
                onValueChange={setScope}
              />
            </Field>
            {scope === "link" ? (
              <Field label="Link">
                <Select
                  value={linkId}
                  placeholder="Choose a link"
                  options={(block.links ?? []).map((link) => ({ value: link.id, label: linkLabel(link) }))}
                  onValueChange={setLinkId}
                />
              </Field>
            ) : null}
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t("Date range")}</span>
              <DateRangeSlider
                min={trackStart}
                max={today}
                start={range.from}
                end={range.to}
                onChange={(from, to) => setRange({ from, to })}
              />
              {tooLong ? <p className="text-sm text-destructive">{t("Choose a range of 400 days or fewer")}</p> : null}
            </div>
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            <Button type="submit" disabled={submitting || tooLong || (scope === "link" && !linkId)}>
              {submitting ? t("Loading…") : t("Show report")}
            </Button>
          </form>
        )}
    </div>
  );
}

function CampaignForm({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const prefill = block.prefill ?? {};
  const [name, setName] = useState(typeof prefill.name === "string" ? prefill.name : "");
  const [linkId, setLinkId] = useState("");
  const [variantName, setVariantName] = useState("");
  const done = block.status === "submitted";
  return (
    <div className="grid gap-3">
      <h2 className="font-medium">{t("Campaign")}</h2>
        {done ? (
          <FormResult block={block} />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, {
                name,
                linkId: linkId || undefined,
                variantName: variantName.trim() || undefined,
              });
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Link">
              <Select
                value={linkId || noLink}
                options={[
                  { value: noLink, label: "No link" },
                  ...(block.links ?? []).map((link) => ({ value: link.id, label: linkLabel(link) })),
                ]}
                onValueChange={(value) => setLinkId(value === noLink ? "" : value)}
              />
            </Field>
            <Field label="Variant name">
              <Input value={variantName} onChange={(event) => setVariantName(event.target.value)} />
            </Field>
            <p className="text-sm text-muted-foreground">{t("The variant can be skipped.")}</p>
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            {block.result?.variants?.map((variant) => (
              <p key={variant.name} className="text-sm text-muted-foreground">
                {variant.error ? `${variant.name}: ${t(variant.error)}` : variant.name}
              </p>
            ))}
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? t("Creating…") : t("Create campaign")}
            </Button>
          </form>
        )}
    </div>
  );
}

function FormResult({ block }: { block: Extract<ChatBlock, { type: "form" }> }) {
  const { t } = useI18n();
  const openLabel = block.form === "campaign" ? "Open campaign" : "Open link";
  return (
    <div className="grid gap-2">
      {block.result?.name ? <p className="text-sm">{block.result.name}</p> : null}
      {block.result?.shortUrl ? <CopyableUrl url={block.result.shortUrl} /> : null}
      {block.result?.qrCreated ? <p className="text-sm text-muted-foreground">{t("QR code saved")}</p> : null}
      {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
      {block.result?.path ? (
        <Link className={buttonVariants({ size: "sm" })} to={block.result.path}>
          {t(openLabel)}
        </Link>
      ) : null}
      {block.result?.variants?.map((variant) => (
        <p key={variant.name} className="text-sm text-muted-foreground">
          {variant.error ? `${variant.name}: ${t(variant.error)}` : variant.name}
        </p>
      ))}
    </div>
  );
}

function chosenCreatedAt(links: ChatFormLink[] | undefined, id: string): string | undefined {
  return links?.find((link) => link.id === id)?.createdAt;
}

function linkLabel(link: ChatFormLink | undefined): string {
  if (!link) return "";
  return link.title ? `${link.title} (${link.slug})` : link.slug;
}
