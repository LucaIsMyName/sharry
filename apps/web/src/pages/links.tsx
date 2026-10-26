import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import { Link, useNavigate, useParams } from "react-router";
import {
  appSlug,
  applyUtm,
  defaultQrStyle,
  destinationSchema,
  emptyRoutingChoices,
  MAX_ROUTING_RULES,
  qrWarnings,
  utmConflicts,
  type QrStyle,
  type QrWarning,
  type RoutingChoices,
  type RoutingRule,
  type UtmParams,
} from "@sharry/shared";
import {
  ApiError,
  api,
  type Analytics,
  type LinkSummary,
  type PublicSettings,
  type QrCode,
  type ShortLink,
} from "../api.ts";
import { useAppName } from "../brand.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { AnalyticsSummary, useReportRange } from "../components/analytics-summary.tsx";
import { BulkLinks } from "../components/bulk-links.tsx";
import { RouteSuggest } from "../components/route-suggest.tsx";
import { SuggestButton } from "../components/suggest-button.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { UtmSuggest } from "../components/utm-suggest.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { PageTitle } from "../components/page-title.tsx";
import { DetailSkeleton, RowSkeleton } from "../components/ui/skeleton.tsx";
import { choiceNote, correctionOptions, redirectOptions } from "../choices.ts";
import { downloadQr, QrPreview } from "../components/qr-preview.tsx";
import { UtmFields } from "../components/utm-fields.tsx";
import { RouteBuilder } from "../components/route-builder.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Card, CardContent, cardBevel } from "../components/ui/card.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Field, FieldMessage } from "../components/ui/field.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { ImageUpload } from "../components/ui/image-upload.tsx";
import { Input } from "../components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  ClickableTableRow,
  TableRow,
} from "../components/ui/table.tsx";
import { t, useI18n } from "../i18n/index.tsx";
import { Breakdown, ClickChart, UtmBreakdowns } from "./analytics.tsx";

const emptyUtm: UtmParams = {};
const noVariant = "none";

type LinkVariant = { id: string; name: string; utm: UtmParams };

const statusOptions = [
  { value: "active", label: "Active" },
  { value: "disabled", label: "Paused" },
] as const;

const moduleOptions = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "extra-rounded", label: "Rounded dots" },
] as const;

const finderOptions = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "extra-rounded", label: "Extra rounded" },
  { value: "dot", label: "Dot" },
] as const;

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function qrPreviewUrl(
  shortUrl: string,
  qrId: string | null,
  variantId: string,
): string {
  try {
    const url = new URL(shortUrl);
    if (qrId) url.searchParams.set("qr", qrId);
    if (variantId !== noVariant) url.searchParams.set("v", variantId);
    return url.toString();
  } catch {
    return shortUrl;
  }
}

function previewDestination(destination: string, utm: UtmParams): string {
  try {
    return applyUtm(destination, utm);
  } catch {
    return "";
  }
}

const linkPageSize = 50;

function AccessBadge({ canEdit }: { canEdit?: boolean }) {
  const { t } = useI18n();
  const viewOnly = canEdit === false;
  return (
    <Badge variant={viewOnly ? "outline" : "secondary"}>
      {viewOnly ? t("View only") : t("Editable")}
    </Badge>
  );
}

function LinkCards({
  links,
  showAccess,
}: {
  links: LinkSummary[];
  showAccess: boolean;
}) {
  const { t } = useI18n();
  return (
    <ul className="grid gap-2 md:hidden">
      {links.map((link) => {
        const name = link.title?.trim() || link.slug;
        const viewOnly = link.canEdit === false;
        return (
          <li key={link.id} className={cn(cardBevel, "rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10")}>
            <div className="flex items-start justify-between gap-3">
              <Link className="min-w-0 flex-1" to={`/links/${link.id}`}>
                <span
                  className={cn(
                    "block truncate font-medium",
                    viewOnly && "text-muted-foreground",
                  )}
                >
                  {name}
                </span>
                <span className="mt-1 block text-base text-muted-foreground">
                  {t("Clicks")} <span className="tabular-nums">{link.clicks}</span>
                </span>
                <span className="mt-1 block truncate font-mono text-base text-muted-foreground">{link.shortUrl}</span>
              </Link>
              <div className="grid justify-items-end gap-2">
                <Badge variant={link.status === "active" ? "secondary" : "outline"}>
                  {link.status === "active" ? t("Active") : t("Paused")}
                </Badge>
                {showAccess ? <AccessBadge canEdit={link.canEdit} /> : null}
                <a
                  className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                  href={link.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("Test {name}", { name })}
                >
                  <ExternalLink />
                </a>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LinksPage() {
  const { t } = useI18n();
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const aiAvailable = useAiAvailable();

  useEffect(() => {
    const current = ++requestId.current;
    const handle = setTimeout(() => {
      setLoading(true);
      void api<{ links: LinkSummary[]; total: number }>(
        `/api/links?q=${encodeURIComponent(query)}&limit=${linkPageSize}&offset=0`,
      )
        .then((result) => {
          if (current !== requestId.current) return;
          setLinks(result.links);
          setTotal(result.total);
          setFailed(false);
        })
        .catch((caught: unknown) => {
          if (current !== requestId.current) return;
          setFailed(true);
          toastCaught(caught, t("Could not load links"));
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, reload]);

  async function loadMore() {
    const current = requestId.current;
    const offset = links.length;
    setLoadingMore(true);
    try {
      const result = await api<{ links: LinkSummary[]; total: number }>(
        `/api/links?q=${encodeURIComponent(query)}&limit=${linkPageSize}&offset=${offset}`,
      );
      if (current !== requestId.current) return;
      setLinks((existing) => [...existing, ...result.links]);
      setTotal(result.total);
      setFailed(false);
    } catch (caught) {
      if (current === requestId.current) {
        setFailed(true);
        toastCaught(caught, t("Could not load links"));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const showAccess = links.some((link) => link.canEdit === false);

  return (
    <section>
      <PageHeader
        title={t("Links")}
        lede={t("The slug stays put when you edit where it goes.")}
        action={
          <div className="flex flex-wrap gap-2">
            {aiAvailable ? (
              <Button variant="outline" size="sm" type="button" onClick={() => setBulkOpen((open) => !open)}>
                {bulkOpen ? t("Close") : t("Add several")}
              </Button>
            ) : null}
            <Link className={buttonVariants({ size: "sm" })} to="/links/new">
              <Plus /> {t("New link")}
            </Link>
          </div>
        }
      />
      {aiAvailable && bulkOpen ? <BulkLinks onCreated={() => setReload((value) => value + 1)} /> : null}
      <Field label="Search">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Slug, title, or destination"
        />
      </Field>
      <div className="mt-4 min-w-0">
        {loading ? (
          <RowSkeleton label="Loading links…" />
        ) : links.length === 0 ? (
          <EmptyState
            action={
              failed || query.trim() ? null : (
                <Link
                  className={buttonVariants({ size: "sm" })}
                  to="/links/new"
                >
                  <Plus /> {t("New link")}
                </Link>
              )
            }
          >
            {failed
              ? t("Could not load links.")
              : query.trim()
                ? t("No links match.")
                : t("No links yet.")}
          </EmptyState>
        ) : (
          <>
          <LinkCards links={links} showAccess={showAccess} />
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Title")}</TableHead>
                {links.some((link) => "owner" in link) ? (
                  <TableHead>{t("Created by")}</TableHead>
                ) : null}
                <TableHead>{t("Short URL")}</TableHead>
                <TableHead>{t("Destination")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                {showAccess ? <TableHead>{t("Access")}</TableHead> : null}
                <TableHead>{t("Clicks")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("Test")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const name = link.title?.trim() || link.slug;
                const viewOnly = link.canEdit === false;
                return (
                  <ClickableTableRow
                    key={link.id}
                    to={`/links/${link.id}`}
                    label={name}
                  >
                    <TableCell
                      className={cn(
                        "font-medium",
                        viewOnly && "text-muted-foreground",
                      )}
                    >
                      {name}
                    </TableCell>
                    {links.some((item) => "owner" in item) ? (
                      <TableCell>
                        {link.owner?.username ?? t("Unknown")}
                      </TableCell>
                    ) : null}
                    <TableCell
                      className="font-mono text-muted-foreground"
                      title={link.shortUrl}
                    >
                      {link.shortUrl}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      title={link.destinationUrl}
                    >
                      {link.destinationUrl}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          link.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {link.status === "active" ? t("Active") : t("Paused")}
                      </Badge>
                    </TableCell>
                    {showAccess ? (
                      <TableCell>
                        <AccessBadge canEdit={link.canEdit} />
                      </TableCell>
                    ) : null}
                    <TableCell className="tabular-nums">
                      {link.clicks}
                    </TableCell>
                    <TableCell data-row-action>
                      <a
                        className={buttonVariants({
                          variant: "outline",
                          size: "icon-sm",
                        })}
                        href={link.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("Test {name}", { name })}
                      >
                        <ExternalLink />
                      </a>
                    </TableCell>
                  </ClickableTableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          </>
        )}
        {!loading && links.length < total ? (
          <Button
            className="mt-4"
            variant="outline"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore
              ? t("Loading…")
              : t("Load more ({shown} of {total})", {
                  shown: links.length,
                  total,
                })}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

const defaultRedirectDomain = "default";

function redirectDomainPayload(value: string): string | null {
  return value === defaultRedirectDomain ? null : value;
}

function RedirectDomainField({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [domains, setDomains] = useState<{ id: string; hostname: string }[]>(
    [],
  );
  const [defaultHost, setDefaultHost] = useState("Default");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ domains: { id: string; hostname: string }[] }>(
        "/api/redirect-domains",
      ),
      api<PublicSettings>("/api/settings/public"),
    ])
      .then(([list, settings]) => {
        if (cancelled) return;
        setDomains(list.domains);
        try {
          setDefaultHost(new URL(settings.shortUrlBase).host);
        } catch {
          setDefaultHost(settings.shortUrlBase);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Field label="Redirect domain">
      <Select
        value={value}
        options={[
          {
            value: defaultRedirectDomain,
            label: t("{host} (default)", { host: defaultHost }),
          },
          ...domains.map((domain) => ({
            value: domain.id,
            label: domain.hostname,
          })),
        ]}
        onValueChange={onValueChange}
      />
      <p className="text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
        {t(
          "The short URL uses this domain. A QR code downloaded later uses the domain saved on the link.",
        )}
      </p>
    </Field>
  );
}

export function LinkFormPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("https://");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [redirectType, setRedirectType] = useState<
    "301" | "302" | "307" | "308"
  >("302");
  const [utm, setUtm] = useState<UtmParams>(emptyUtm);
  const [redirectDomainId, setRedirectDomainId] = useState(
    defaultRedirectDomain,
  );
  const [pending, setPending] = useState(false);
  const aiAvailable = useAiAvailable();

  useEffect(() => {
    void api<PublicSettings>("/api/settings/public").then((value) => {
      setSettings(value);
      setRedirectType(value.defaultRedirectType);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const created = await api<ShortLink>("/api/links", {
        method: "POST",
        body: JSON.stringify({
          destinationUrl,
          title,
          slug,
          redirectType,
          redirectDomainId: redirectDomainPayload(redirectDomainId),
          utm,
        }),
      });
      await navigate(`/links/${created.id}`);
    } catch (caught) {
      toastCaught(caught, t("Could not create the link"));
    } finally {
      setPending(false);
    }
  }

  const conflicts = utmConflicts(destinationUrl, utm);
  return (
    <section>
      <h1 className="mb-5 font-heading text-2xl font-medium tracking-tight">
        {t("New link")}
      </h1>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <LinkSuggestFields
              aiAvailable={aiAvailable}
              destinationUrl={destinationUrl}
              slug={slug}
              title={title}
              slugLabel="Custom slug"
              titleFirst
              destinationInfo={
                conflicts.length > 0
                  ? t(
                      "Saving will replace {fields} already present on the destination.",
                      { fields: conflicts.join(", ") },
                    )
                  : undefined
              }
              onDestination={setDestinationUrl}
              onSlug={setSlug}
              onTitle={setTitle}
            >
              <RedirectDomainField
                value={redirectDomainId}
                onValueChange={setRedirectDomainId}
              />
            </LinkSuggestFields>
            <Field label="Redirect">
              <Select
                value={redirectType}
                options={[...redirectOptions]}
                onValueChange={setRedirectType}
              />
              {/* <p className="sr-only text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">{choiceNote(redirectOptions, redirectType)}</p> */}
            </Field>
            <UtmSuggest
              aiAvailable={aiAvailable}
              destinationUrl={destinationUrl}
              onApply={(next) => setUtm((current) => ({ ...current, ...next }))}
            />
            <UtmFields utm={utm} onChange={setUtm} />
            {settings ? (
              <p className="text-sm text-muted-foreground">
                {t("Preview: {url}", {
                  url: previewDestination(destinationUrl, utm),
                })}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              <Plus /> {pending ? t("Creating…") : t("Create link")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

export function LinkSuggestFields({
  aiAvailable,
  linkId,
  destinationUrl,
  slug,
  title,
  slugLabel = "Slug",
  titleFirst = false,
  destinationInfo,
  onDestination,
  onSlug,
  onTitle,
  children,
}: {
  aiAvailable: boolean;
  linkId?: string;
  destinationUrl: string;
  slug: string;
  title: string;
  slugLabel?: string;
  titleFirst?: boolean;
  destinationInfo?: string;
  onDestination: (value: string) => void;
  onSlug: (value: string) => void;
  onTitle: (value: string) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [suggesting, setSuggesting] = useState<"slug" | "title" | null>(null);
  const [slugHint, setSlugHint] = useState<"title" | "page" | null>(null);
  const [titleHint, setTitleHint] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [titleError, setTitleError] = useState("");
  async function suggest(field: "slug" | "title") {
    if (!destinationUrl.trim() || suggesting) return;
    setSuggesting(field);
    if (field === "slug") setSlugError("");
    else setTitleError("");
    try {
      const result = await api<{ slug: string | null; title: string; fromTitle: boolean }>("/api/ai/suggest-slug", {
        method: "POST",
        body: JSON.stringify({ destinationUrl, linkId }),
      });
      if (field === "slug") {
        if (!result.slug) {
          setSlugHint(null);
          setSlugError("Could not suggest a slug for that page.");
          return;
        }
        onSlug(result.slug);
        setSlugHint(result.fromTitle ? "title" : "page");
        return;
      }
      if (!result.title.trim()) {
        setTitleHint(false);
        setTitleError("Could not suggest a title for that page.");
        return;
      }
      onTitle(result.title);
      setTitleHint(true);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Could not suggest a slug for that page.";
      if (field === "slug") {
        setSlugHint(null);
        setSlugError(message);
      } else {
        setTitleHint(false);
        setTitleError(caught instanceof ApiError ? message : "Could not suggest a title for that page.");
      }
    } finally {
      setSuggesting(null);
    }
  }
  const ready = destinationSchema.safeParse(destinationUrl).success;
  const slugFields = (
    <>
      <Field label={slugLabel}>
        <div className="relative">
          <Input
            className={aiAvailable ? "pr-10" : undefined}
            value={slug}
            placeholder="Leave blank for a random slug"
            onChange={(event) => {
              onSlug(event.target.value);
              setSlugHint(null);
            }}
          />
          {aiAvailable ? (
            <SuggestButton
              label="Suggest a slug"
              hint={slugHint === "title" ? "Suggested from the page title." : slugHint === "page" ? "Suggested from the page." : null}
              disabled={!ready || suggesting === "slug"}
              onClick={() => void suggest("slug")}
            />
          ) : null}
        </div>
      </Field>
      {slugError ? <p className="text-sm text-destructive">{t(slugError)}</p> : null}
    </>
  );
  const titleFields = (
    <>
      <Field label="Title">
        <div className="relative">
          <Input
            className={aiAvailable ? "pr-10" : undefined}
            value={title}
            onChange={(event) => {
              onTitle(event.target.value);
              setTitleHint(false);
            }}
          />
          {aiAvailable ? (
            <SuggestButton
              label="Suggest a title"
              hint={titleHint ? "Suggested from the page title." : null}
              disabled={!ready || suggesting === "title"}
              onClick={() => void suggest("title")}
            />
          ) : null}
        </div>
      </Field>
      {titleError ? <p className="text-sm text-destructive">{t(titleError)}</p> : null}
    </>
  );
  return (
    <>
      <Field label="Destination" info={destinationInfo}>
        <Input value={destinationUrl} onChange={(event) => onDestination(event.target.value)} required />
      </Field>
      {titleFirst ? titleFields : slugFields}
      {titleFirst ? slugFields : children}
      {titleFirst ? children : titleFields}
    </>
  );
}

export function LinkDetailPage() {
  const { t, locale } = useI18n();
  const appName = useAppName();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [link, setLink] = useState<ShortLink | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [redirectType, setRedirectType] =
    useState<ShortLink["redirectType"]>("302");
  const [status, setStatus] = useState<ShortLink["status"]>("active");
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [utm, setUtm] = useState<UtmParams>(emptyUtm);
  const [routes, setRoutes] = useState<RoutingRule[]>([]);
  const [routingChoices, setRoutingChoices] = useState<RoutingChoices>(
    emptyRoutingChoices(),
  );
  const [redirectDomainId, setRedirectDomainId] = useState(
    defaultRedirectDomain,
  );
  const [qrCodes, setQrCodes] = useState<QrCode[]>([]);
  const [style, setStyle] = useState<QrStyle>(defaultQrStyle);
  const [qrName, setQrName] = useState("Default");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoInputKey, setLogoInputKey] = useState(0);
  const [activeQr, setActiveQr] = useState<QrCode | null>(null);
  const [variants, setVariants] = useState<LinkVariant[]>([]);
  const [trackingVariantId, setTrackingVariantId] = useState(noVariant);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const logoRequest = useRef(0);
  const aiAvailable = useAiAvailable();
  const earliest = link?.createdAt.slice(0, 10);
  const report = useReportRange(earliest);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLink(null);
    setDestinationUrl("");
    setSlug("");
    setTitle("");
    setExpiresAt("");
    setPassword("");
    setUtm(emptyUtm);
    setRoutes([]);
    setRoutingChoices(emptyRoutingChoices());
    setRedirectDomainId(defaultRedirectDomain);
    setQrCodes([]);
    setActiveQr(null);
    setAnalytics(null);
    setVariants([]);
    setTrackingVariantId(noVariant);
    setLogoUrl(null);
    setLogoFile(null);
    void (async () => {
      try {
        const [next, codes, variantData] = await Promise.all([
          api<ShortLink>(`/api/links/${id}`),
          api<{ qrCodes: QrCode[] }>(`/api/links/${id}/qr`),
          api<{ variants: LinkVariant[] }>(`/api/links/${id}/variants`),
        ]);
        if (cancelled) return;
        setLink(next);
        setDestinationUrl(next.destinationUrl);
        setSlug(next.slug);
        setTitle(next.title ?? "");
        setRedirectType(next.redirectType);
        setStatus(next.status);
        setExpiresAt(toDatetimeLocal(next.expiresAt));
        setUtm(next.utm);
        setRoutes(next.routingRules ?? []);
        setRoutingChoices(next.routingChoices ?? emptyRoutingChoices());
        setRedirectDomainId(next.redirectDomainId ?? defaultRedirectDomain);
        setQrCodes(codes.qrCodes);
        setVariants(variantData.variants);
        const saved = codes.qrCodes[0];
        if (saved) await showQr(saved, () => cancelled);
        else setTrackingVariantId(noVariant);
      } catch (caught) {
        if (!cancelled) toastCaught(caught, t("Could not load this link"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const path = aiAvailable
      ? `/api/links/${id}/analytics?from=${report.range.from}&to=${report.range.to}`
      : `/api/links/${id}/analytics`;
    void api<Analytics>(path)
      .then((stats) => {
        if (!cancelled) setAnalytics(stats);
      })
      .catch((caught: unknown) => {
        if (!cancelled) toastCaught(caught, t("Could not load this link"));
      });
    return () => {
      cancelled = true;
    };
  }, [id, aiAvailable, report.range.from, report.range.to]);

  useEffect(() => {
    if (!logoUrl?.startsWith("blob:")) return;
    const current = logoUrl;
    return () => URL.revokeObjectURL(current);
  }, [logoUrl]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null)
        window.clearTimeout(copiedTimer.current);
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (link?.canEdit === false) return;
    setSaving(true);
    try {
      const updated = await api<ShortLink>(`/api/links/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          destinationUrl,
          slug,
          title,
          redirectType,
          status,
          expiresAt: fromDatetimeLocal(expiresAt),
          password: password ? password : undefined,
          redirectDomainId: redirectDomainPayload(redirectDomainId),
          utm,
          routingRules: routes,
        }),
      });
      setLink(updated);
      setSlug(updated.slug);
      setRoutes(updated.routingRules ?? []);
      setRoutingChoices(updated.routingChoices ?? emptyRoutingChoices());
      setRedirectDomainId(updated.redirectDomainId ?? defaultRedirectDomain);
      setPassword("");
      toast.success(
        slug.trim()
          ? t("Saved. The short URL keeps this slug.")
          : t("Saved. A random slug replaced the empty one."),
      );
    } catch (caught) {
      toastCaught(caught, t("Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function clearPassword() {
    try {
      const updated = await api<ShortLink>(`/api/links/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: null }),
      });
      setLink(updated);
      setPassword("");
      toast.success(t("Password removed. The short link redirects directly."));
    } catch (caught) {
      toastCaught(caught, t("Could not remove the password"));
    }
  }

  async function copyShortUrl() {
    if (!link?.shortUrl) return;
    try {
      await copyText(link.shortUrl);
      setCopied(true);
      if (copiedTimer.current !== null)
        window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (caught) {
      setCopied(false);
      toastCaught(caught, t("Could not copy the short URL"));
    }
  }

  async function remove() {
    try {
      await api(`/api/links/${id}`, { method: "DELETE" });
      setConfirmDelete(false);
      await navigate("/links");
    } catch (caught) {
      toastCaught(caught, t("Could not delete this link"));
    }
  }

  async function showQr(code: QrCode, cancelled: () => boolean = () => false) {
    const requestId = ++logoRequest.current;
    setActiveQr(code);
    setStyle(code.style);
    setQrName(code.name);
    setTrackingVariantId(code.trackingVariantId ?? noVariant);
    setLogoFile(null);
    if (!code.hasLogo) {
      setLogoUrl(null);
      return;
    }
    const response = await fetch(`/api/qr/${code.id}/logo`, {
      credentials: "include",
    });
    if (cancelled() || logoRequest.current !== requestId) return;
    if (!response.ok) {
      setLogoUrl(null);
      return;
    }
    const blob = URL.createObjectURL(await response.blob());
    if (cancelled() || logoRequest.current !== requestId) {
      URL.revokeObjectURL(blob);
      return;
    }
    setLogoUrl(blob);
  }

  async function createQr(event: FormEvent) {
    event.preventDefault();
    if (link?.canEdit === false) return;
    setSavingQr(true);
    try {
      const variantId =
        trackingVariantId === noVariant ? null : trackingVariantId;
      const created = activeQr
        ? await api<QrCode>(`/api/qr/${activeQr.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: qrName,
              style,
              trackingVariantId: variantId,
            }),
          })
        : await api<QrCode>("/api/qr", {
            method: "POST",
            body: JSON.stringify({
              linkId: id,
              name: qrName,
              style,
              trackingVariantId: variantId,
            }),
          });
      if (logoFile) {
        const body = new FormData();
        body.set("file", logoFile);
        await api(`/api/qr/${created.id}/logo`, { method: "POST", body });
        created.hasLogo = true;
        setStyle((current) => ({ ...current, errorCorrectionLevel: "H" }));
      }
      setActiveQr(created);
      setLogoFile(null);
      setQrCodes((current) => [
        created,
        ...current.filter((code) => code.id !== created.id),
      ]);
      toast.success(t("QR code saved. Downloads use this code’s short URL."));
    } catch (caught) {
      toastCaught(caught, t("Could not save the QR code"));
    } finally {
      setSavingQr(false);
    }
  }

  async function removeCenterImage() {
    if (activeQr?.hasLogo) {
      try {
        await api(`/api/qr/${activeQr.id}/logo`, { method: "DELETE" });
        const next = { ...activeQr, hasLogo: false };
        setActiveQr(next);
        setQrCodes((current) =>
          current.map((code) => (code.id === next.id ? next : code)),
        );
      } catch (caught) {
        toastCaught(caught, t("Could not remove the center image"));
        return;
      }
    }
    setLogoFile(null);
    setLogoUrl(null);
    setLogoInputKey((key) => key + 1);
    toast.success(t("Center image removed."));
  }

  const locked = link?.canEdit === false;
  const conflicts = utmConflicts(destinationUrl, utm);
  const scanWarnings = qrWarnings(style, Boolean(logoUrl));
  const scanWarning = (key: QrWarning["key"]) =>
    scanWarnings.find((warning) => warning.key === key)?.message;
  const transparentWarning = scanWarning("transparent");
  const previewUrl = link
    ? qrPreviewUrl(link.shortUrl, activeQr?.id ?? null, trackingVariantId)
    : "";

  return (
    <section className="grid gap-4">
      <PageTitle
        title={link?.title?.trim() || link?.slug || "Link"}
        literal={Boolean(link?.title?.trim() || link?.slug)}
      />
      <div className="sticky top-12 z-20 -mx-5 flex min-w-0 flex-col items-stretch gap-4 border-b border-border bg-background px-5 py-3 md:top-0 md:-mx-7 md:flex-row md:items-end md:justify-between md:px-7">
        <div className="min-w-0 md:flex-1">
          <h1
            className="truncate font-heading text-3xl font-medium tracking-tight"
            title={link?.title?.trim() || link?.slug || undefined}
          >
            {link?.title?.trim() || link?.slug || t("Link")}
          </h1>
          {link ? (
            <>
              <a
                className="mt-1.5 block truncate font-mono text-base text-muted-foreground underline-offset-3 hover:text-primary md:text-sm"
                href={link.shortUrl}
                title={link.shortUrl}
                target="_blank"
                rel="noreferrer"
              >
                {link.shortUrl}
              </a>
              <div className="flex gap-3 items-center mt-2 sr-only">
                <p className="text-sm text-muted-foreground text-xs">
                  {t("Created by")} {link.owner?.username ?? t("Unknown")}
                </p>
                <p className="text-sm text-muted-foreground text-xs">
                  {t("Last changed by")}{" "}
                  {link.updatedBy?.username ?? t("Unknown")}
                </p>
              </div>
              {locked ? (
                <p className="mt-1 text-base text-muted-foreground md:text-sm">
                  {t("You can view this link but not change it.")}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {locked ? null : (
            <Button
              type="submit"
              size="sm"
              form="link-editor"
              disabled={saving || loading || !link}
            >
              <Save /> {saving ? t("Saving…") : t("Save")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!link?.shortUrl}
            onClick={() => void copyShortUrl()}
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
          {locked ? null : (
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> {t("Delete")}
            </Button>
          )}
        </div>
      </div>
      {loading ? (
        <DetailSkeleton label="Loading link…" />
      ) : (
      <>
      <Card className="overflow-visible">
        <CardContent>
          <form id="link-editor" onSubmit={(event) => void save(event)}>
            <fieldset
              disabled={locked}
              className="m-0 grid min-w-0 gap-3 border-0 p-0"
            >
              <LinkSuggestFields
                aiAvailable={aiAvailable}
                linkId={id}
                destinationUrl={destinationUrl}
                slug={slug}
                title={title}
                destinationInfo={
                  conflicts.length > 0
                    ? t("This will replace {fields} on the destination.", {
                        fields: conflicts.join(", "),
                      })
                    : undefined
                }
                onDestination={setDestinationUrl}
                onSlug={setSlug}
                onTitle={setTitle}
              >
                <RedirectDomainField
                  value={redirectDomainId}
                  onValueChange={setRedirectDomainId}
                />
              </LinkSuggestFields>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Redirect">
                  <Select
                    value={redirectType}
                    options={redirectOptions.map(({ value, label }) => ({
                      value,
                      label,
                    }))}
                    onValueChange={setRedirectType}
                  />
                  <p className="sr-only text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
                    {t(choiceNote(redirectOptions, redirectType))}
                  </p>
                </Field>
                <Field label="Status">
                  <Select
                    value={status}
                    options={[...statusOptions]}
                    onValueChange={setStatus}
                  />
                </Field>
              </div>
              <Field label="Expires">
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </Field>
              <Field
                label={link?.hasPassword ? "Replace password" : "Password"}
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    link?.hasPassword ? "Leave blank to keep it." : "Optional"
                  }
                  autoComplete="new-password"
                />
                <p className="text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
                  {t(
                    "Visitors must enter this password before the short link redirects.",
                  )}
                  {link?.hasPassword ? t(" A password is already saved.") : ""}
                </p>
              </Field>
              {link?.hasPassword && !locked ? (
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => void clearPassword()}
                >
                  <Trash2 /> {t("Remove password")}
                </Button>
              ) : null}
              <UtmSuggest
                aiAvailable={aiAvailable && !locked}
                destinationUrl={destinationUrl}
                onApply={(next) => setUtm((current) => ({ ...current, ...next }))}
              />
              <UtmFields utm={utm} onChange={setUtm} />
              <p className="text-sm text-muted-foreground truncate">
                {t("Tracked URL: {url}", {
                  url: previewDestination(destinationUrl, utm),
                })}
              </p>
              {aiAvailable && !locked ? (
                <RouteSuggest
                  onAppend={(drafts) =>
                    setRoutes((current) => [...current, ...drafts].slice(0, MAX_ROUTING_RULES))
                  }
                />
              ) : null}
              <RouteBuilder
                rules={routes}
                choices={routingChoices}
                utm={utm}
                locale={locale}
                onChange={setRoutes}
              />
              {locked ? null : (
                <Button type="submit" disabled={saving}>
                  <Save /> {saving ? t("Saving…") : t("Save link")}
                </Button>
              )}
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <Card className="overflow-visible">
        <CardContent>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1">
              <QrPreview
                url={previewUrl || "https://example.com"}
                style={style}
                logoUrl={logoUrl}
              />
            </div>
            <form
              className="grid min-w-0 gap-3 lg:col-start-1 lg:row-start-1"
              onSubmit={(event) => void createQr(event)}
            >
              <fieldset
                disabled={locked}
                className="m-0 grid min-w-0 gap-3 border-0 p-0"
              >
                <h2 className="text-lg font-medium">{t("QR code")}</h2>
                <Field label="Name">
                  <Input
                    value={qrName}
                    onChange={(event) => setQrName(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Campaign variant">
                  <Select
                    value={trackingVariantId}
                    placeholder="No variant"
                    options={[
                      { value: noVariant, label: t("No variant") },
                      ...variants.map((variant) => ({
                        value: variant.id,
                        label: variant.name,
                      })),
                    ]}
                    onValueChange={setTrackingVariantId}
                  />
                  <p className="text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
                    {t(
                      "The QR code uses this variant’s UTM values when someone scans it.",
                    )}
                  </p>
                </Field>
                <Field label="Modules">
                  <Select
                    value={style.dotsType}
                    options={[...moduleOptions]}
                    onValueChange={(dotsType) =>
                      setStyle({ ...style, dotsType })
                    }
                  />
                </Field>
                <Field label="Finder">
                  <Select
                    value={style.cornersSquareType}
                    options={[...finderOptions]}
                    onValueChange={(cornersSquareType) =>
                      setStyle({ ...style, cornersSquareType })
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Foreground" info={scanWarning("contrast")}>
                    <Input
                      type="color"
                      value={style.dotsColor}
                      onChange={(event) =>
                        setStyle({
                          ...style,
                          dotsColor: event.target.value,
                          cornersSquareColor: event.target.value,
                          cornersDotColor: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Background">
                    <Input
                      type="color"
                      value={style.backgroundColor}
                      onChange={(event) =>
                        setStyle({
                          ...style,
                          backgroundColor: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={style.backgroundTransparent}
                    onCheckedChange={(checked) =>
                      setStyle({
                        ...style,
                        backgroundTransparent: checked === true,
                      })
                    }
                  />{" "}
                  {t("Transparent background")}
                  {transparentWarning ? (
                    <FieldMessage tone="info" message={transparentWarning} />
                  ) : null}
                </label>
                <Field
                  label="Center image scale"
                  info={scanWarning("imageSize")}
                >
                  <Input
                    type="number"
                    min="0"
                    max="0.45"
                    step="0.01"
                    value={style.imageSize}
                    onChange={(event) =>
                      setStyle({
                        ...style,
                        imageSize: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Error correction"
                  info={scanWarning("errorCorrection")}
                >
                  <Select
                    value={style.errorCorrectionLevel}
                    options={[...correctionOptions]}
                    onValueChange={(errorCorrectionLevel) =>
                      setStyle({ ...style, errorCorrectionLevel })
                    }
                  />
                  <p className="text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
                    {t(
                      choiceNote(correctionOptions, style.errorCorrectionLevel),
                    )}
                  </p>
                </Field>
                <Field label="Quiet zone" info={scanWarning("margin")}>
                  <Input
                    type="number"
                    min="0"
                    max="16"
                    value={style.margin}
                    onChange={(event) =>
                      setStyle({ ...style, margin: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Center image">
                  <ImageUpload
                    key={logoInputKey}
                    previewUrl={logoUrl}
                    fileName={logoFile?.name}
                    onFile={(file) => {
                      setLogoFile(file);
                      setLogoUrl(URL.createObjectURL(file));
                    }}
                  />
                  {logoUrl && !locked ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => void removeCenterImage()}
                    >
                      <Trash2 /> {t("Remove center image")}
                    </Button>
                  ) : null}
                </Field>
                {locked ? null : (
                  <Button type="submit" disabled={savingQr}>
                    <Save /> {savingQr ? t("Saving…") : t("Save QR style")}
                  </Button>
                )}
              </fieldset>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    void downloadQr(
                      previewUrl,
                      style,
                      logoUrl,
                      "svg",
                      slug || appSlug(appName),
                    )
                  }
                >
                  <Download /> SVG
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    void downloadQr(
                      previewUrl,
                      style,
                      logoUrl,
                      "png",
                      slug || appSlug(appName),
                    )
                  }
                >
                  <Download /> PNG
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() =>
                    void downloadQr(
                      previewUrl,
                      { ...style, backgroundTransparent: false },
                      logoUrl,
                      "jpeg",
                      slug || appSlug(appName),
                    )
                  }
                >
                  <Download /> JPEG
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
      {qrCodes.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-lg font-medium">{t("Saved codes")}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("URL")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qrCodes.map((code) => {
                  const selected = activeQr?.id === code.id;
                  return (
                    <TableRow
                      key={code.id}
                      data-state={selected ? "selected" : undefined}
                    >
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          aria-pressed={selected}
                          className="text-left font-medium"
                          onClick={() => void showQr(code)}
                        >
                          {code.name}
                        </button>
                      </TableCell>
                      <TableCell
                        className="font-mono text-muted-foreground"
                        title={code.url}
                      >
                        {code.url}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <Card>
            <CardContent className="grid gap-4">
              {aiAvailable ? (
                <AnalyticsSummary
                  linkId={id}
                  earliest={earliest}
                  range={report.range}
                  onRange={(from, to) => report.setRange({ from, to })}
                />
              ) : null}
              <ClickChart series={analytics.series} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown
              title={t("QR codes")}
              rows={analytics.qrCodes.map((row) => ({
                name: row.name,
                clicks: row.clicks,
              }))}
            />
            <UtmBreakdowns analytics={analytics} />
          </div>
        </div>
      ) : null}
      </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this short link?"
        description="Type delete to remove the short link. Printed codes and saved URLs will stop working."
        confirmLabel="Delete link"
        destructive
        confirmDisabled={deleteText !== "delete"}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setDeleteText("");
        }}
        onConfirm={() => void remove()}
      >
        <Field label="Type delete">
          <Input
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
            autoComplete="off"
          />
        </Field>
      </ConfirmDialog>
    </section>
  );
}
