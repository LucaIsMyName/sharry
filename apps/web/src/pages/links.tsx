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
  defaultFolderIcon,
  defaultLinkIcon,
  type IconName,
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
  rasterImageMimes,
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
import { BulkLinksDialog } from "../components/bulk-links.tsx";
import { RouteSuggest } from "../components/route-suggest.tsx";
import { SuggestButton } from "../components/suggest-button.tsx";
import { TagField, type EditorTag } from "../components/tag-field.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { UtmSuggest } from "../components/utm-suggest.tsx";
import { AppIcon } from "../components/app-icon.tsx";
import { IconPicker } from "../components/icon-picker.tsx";
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
import { FieldGroup, FieldGroupLine } from "../components/ui/field-group.tsx";
import { Section } from "../components/ui/section.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { MediaField, type MediaFieldValue } from "../components/media-field.tsx";
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
import { LinkOverview } from "./link-overview.tsx";

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

export function LinksPage() {
  return <LinkOverview />;
}


const defaultRedirectDomain = "default";

function redirectDomainPayload(value: string): string | null {
  return value === defaultRedirectDomain ? null : value;
}

function RedirectDomainField({
  value,
  onValueChange,
  srOnly = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  srOnly?: boolean;
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
    <Field label="Redirect domain" srOnly={srOnly}>
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
      <p className="sr-only text-sm leading-snug font-normal text-muted-foreground md:text-[13px]">
        {t(
          "The short URL uses this domain. A QR code downloaded later uses the domain saved on the link.",
        )}
      </p>
    </Field>
  );
}

type EditorFolder = { id: string; name: string; parentId?: string | null; icon?: string | null };

function folderTreeOptions(folders: EditorFolder[]) {
  const byParent = new Map<string | null, EditorFolder[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  }
  const options: { value: string; label: string; depth: number; icon: ReactNode }[] = [
    { value: "root", label: "Links", depth: 0, icon: <AppIcon name={defaultFolderIcon} /> },
  ];
  function walk(parentId: string | null, depth: number) {
    for (const folder of byParent.get(parentId) ?? []) {
      options.push({
        value: folder.id,
        label: folder.name,
        depth,
        icon: <AppIcon name={folder.icon ?? defaultFolderIcon} />,
      });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 1);
  return options;
}

function LinkIdentity({
  icon,
  folderId,
  folders,
  tags,
  showIcon = true,
  disabled = false,
  onIcon,
  onFolder,
  onTags,
}: {
  icon: string | null;
  folderId: string;
  folders: EditorFolder[];
  tags: EditorTag[];
  showIcon?: boolean;
  disabled?: boolean;
  onIcon: (icon: IconName) => void;
  onFolder: (folderId: string) => void;
  onTags: (tags: EditorTag[]) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {showIcon ? <IconPicker value={icon} fallback={defaultLinkIcon} onChange={onIcon} /> : null}
        <div className="min-w-48 flex-1">
          <Field label="Folder">
            <Select
              value={folderId || "root"}
              options={folderTreeOptions(folders)}
              onValueChange={onFolder}
            />
          </Field>
        </div>
      </div>
      <TagField kind="link" tags={tags} onChange={onTags} disabled={disabled} />
    </div>
  );
}

function TitleSuggestButton({
  destinationUrl,
  linkId,
  onTitle,
}: {
  destinationUrl: string;
  linkId?: string;
  onTitle: (value: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const ready = destinationSchema.safeParse(destinationUrl).success;
  async function suggest() {
    if (!ready || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await api<{ title: string }>("/api/ai/suggest-slug", {
        method: "POST",
        body: JSON.stringify({ destinationUrl, linkId }),
      });
      if (!result.title.trim()) {
        setHint(false);
        setError("Could not suggest a title for that page.");
        return;
      }
      onTitle(result.title);
      setHint(true);
    } catch (caught) {
      setHint(false);
      setError(caught instanceof ApiError ? caught.message : "Could not suggest a title for that page.");
    } finally {
      setPending(false);
    }
  }
  return (
    <SuggestButton
      inline
      label="Suggest a title"
      hint={hint ? "Suggested from the page title." : null}
      error={error}
      disabled={!ready || pending}
      onClick={() => void suggest()}
    />
  );
}

function LinkTitleRow({
  icon,
  title,
  placeholder,
  disabled = false,
  aiAvailable,
  destinationUrl,
  linkId,
  onIcon,
  onTitle,
}: {
  icon: string | null;
  title: string;
  placeholder: string;
  disabled?: boolean;
  aiAvailable: boolean;
  destinationUrl: string;
  linkId?: string;
  onIcon: (icon: IconName) => void;
  onTitle: (title: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <IconPicker large value={icon} fallback={defaultLinkIcon} onChange={onIcon} />
      <input
        aria-label={t("Title")}
        className="min-w-0 max-w-full [field-sizing:content] truncate bg-transparent font-heading text-3xl font-medium tracking-tight outline-none placeholder:text-muted-foreground"
        value={title}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onTitle(event.target.value)}
      />
      {aiAvailable && !disabled ? (
        <TitleSuggestButton destinationUrl={destinationUrl} linkId={linkId} onTitle={onTitle} />
      ) : null}
    </div>
  );
}

export function LinkFormPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("https://");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [folderId, setFolderId] = useState("root");
  const [tags, setTags] = useState<EditorTag[]>([]);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const [folders, setFolders] = useState<EditorFolder[]>([]);
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
    void api<{ folders?: EditorFolder[] }>("/api/folders?kind=link&tree=1")
      .then((result) => setFolders(result.folders ?? []))
      .catch(() => setFolders([]));
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
          icon,
          folderId: folderId === "root" ? null : folderId,
          tags: tagsRef.current.map((tag) => ({ name: tag.name, color: tag.color })),
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
    <section className="grid gap-4">
      <div className="border-b border-border pb-4">
        <LinkTitleRow
          icon={icon}
          title={title}
          placeholder={t("Untitled")}
          aiAvailable={aiAvailable}
          destinationUrl={destinationUrl}
          onIcon={setIcon}
          onTitle={setTitle}
        />
      </div>
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <LinkIdentity
              icon={icon}
              folderId={folderId}
              folders={folders}
              tags={tags}
              showIcon={false}
              onIcon={setIcon}
              onFolder={setFolderId}
              onTags={(next) => {
                tagsRef.current = next;
                setTags(next);
              }}
            />
            <LinkSuggestFields
              aiAvailable={aiAvailable}
              destinationUrl={destinationUrl}
              slug={slug}
              title={title}
              hideTitle
              destinationFirst
              quietLabels
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
                srOnly
                value={redirectDomainId}
                onValueChange={setRedirectDomainId}
              />
            </LinkSuggestFields>
            <Section title={t("Settings")}>
              <Field label="Redirect">
                <Select
                  value={redirectType}
                  options={[...redirectOptions]}
                  onValueChange={setRedirectType}
                />
              </Field>
            </Section>
            <Section title={t("UTM")}>
              <UtmSuggest
                aiAvailable={aiAvailable}
                destinationUrl={destinationUrl}
                onApply={(next) => setUtm((current) => ({ ...current, ...next }))}
              />
              <UtmFields utm={utm} onChange={setUtm} />
            </Section>
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
  hideTitle = false,
  destinationFirst = false,
  quietLabels = false,
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
  hideTitle?: boolean;
  destinationFirst?: boolean;
  quietLabels?: boolean;
  destinationInfo?: string;
  onDestination: (value: string) => void;
  onSlug: (value: string) => void;
  onTitle: (value: string) => void;
  children?: ReactNode;
}) {
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
      <Field label={slugLabel} srOnly={quietLabels}>
        <div className="relative">
          <Input
            className={aiAvailable ? "pr-10" : undefined}
            value={slug}
            placeholder="Leave blank for a random slug"
            onChange={(event) => {
              onSlug(event.target.value);
              setSlugHint(null);
              setSlugError("");
            }}
          />
          {aiAvailable ? (
            <SuggestButton
              label="Suggest a slug"
              hint={slugHint === "title" ? "Suggested from the page title." : slugHint === "page" ? "Suggested from the page." : null}
              error={slugError}
              disabled={!ready || suggesting === "slug"}
              onClick={() => void suggest("slug")}
            />
          ) : null}
        </div>
      </Field>
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
              setTitleError("");
            }}
          />
          {aiAvailable ? (
            <SuggestButton
              label="Suggest a title"
              hint={titleHint ? "Suggested from the page title." : null}
              error={titleError}
              disabled={!ready || suggesting === "title"}
              onClick={() => void suggest("title")}
            />
          ) : null}
        </div>
      </Field>
    </>
  );
  const destinationField = (
    <Field label="Destination" info={destinationInfo}>
      <Input value={destinationUrl} onChange={(event) => onDestination(event.target.value)} required />
    </Field>
  );
  return (
    <>
      {titleFirst && !hideTitle ? titleFields : null}
      {destinationFirst ? destinationField : null}
      <FieldGroup label="Short link">
        <FieldGroupLine className={quietLabels ? "items-center" : undefined}>
          <div className="min-w-0 flex-1">{children}</div>
          <span className={cn("px-2 font-mono text-muted-foreground", quietLabels ? "self-center" : "pb-2.5")} aria-hidden>
            /
          </span>
          <div className="min-w-0 flex-[1.4]">{slugFields}</div>
        </FieldGroupLine>
        {destinationFirst ? null : (
          <FieldGroupLine>
            <div className="min-w-0 flex-1">{destinationField}</div>
          </FieldGroupLine>
        )}
      </FieldGroup>
      {!hideTitle && !titleFirst ? titleFields : null}
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
  const [icon, setIcon] = useState<string | null>(null);
  const [folderId, setFolderId] = useState("root");
  const [tags, setTags] = useState<EditorTag[]>([]);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const [folders, setFolders] = useState<EditorFolder[]>([]);
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
  const [logo, setLogo] = useState<MediaFieldValue | null>(null);
  const [activeQr, setActiveQr] = useState<QrCode | null>(null);
  const [variants, setVariants] = useState<LinkVariant[]>([]);
  const [trackingVariantId, setTrackingVariantId] = useState(noVariant);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingQr, setSavingQr] = useState(false);
  const [copied, setCopied] = useState(false);
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
    setIcon(null);
    setFolderId("root");
    setTags([]);
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
    setLogo(null);
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
        setIcon(next.icon ?? null);
        setFolderId(next.folderId ?? "root");
        setTags(next.tags ?? []);
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
        if (saved) showQr(saved);
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
    void api<{ folders?: EditorFolder[] }>("/api/folders?kind=link&tree=1")
      .then((result) => setFolders(result.folders ?? []))
      .catch(() => setFolders([]));
  }, []);

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
          icon,
          folderId: folderId === "root" ? null : folderId,
          tags: tagsRef.current.map((tag) => ({ name: tag.name, color: tag.color })),
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

  function showQr(code: QrCode) {
    setActiveQr(code);
    setStyle(code.style);
    setQrName(code.name);
    setTrackingVariantId(code.trackingVariantId ?? noVariant);
    setLogo(
      code.logoMediaId && code.logoUrl
        ? { id: code.logoMediaId, url: code.logoUrl, name: logoName(code.logoUrl) }
        : null,
    );
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
              logoMediaId: logo?.id ?? null,
            }),
          })
        : await api<QrCode>("/api/qr", {
            method: "POST",
            body: JSON.stringify({
              linkId: id,
              name: qrName,
              style,
              trackingVariantId: variantId,
              logoMediaId: logo?.id ?? null,
            }),
          });
      setActiveQr(created);
      setStyle(created.style);
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
        const next = { ...activeQr, hasLogo: false, logoMediaId: null, logoUrl: null };
        setActiveQr(next);
        setQrCodes((current) =>
          current.map((code) => (code.id === next.id ? next : code)),
        );
      } catch (caught) {
        toastCaught(caught, t("Could not remove the center image"));
        return;
      }
    }
    setLogo(null);
    toast.success(t("Center image removed."));
  }

  const locked = link?.canEdit === false;
  const conflicts = utmConflicts(destinationUrl, utm);
  const logoUrl = logo?.url ?? null;
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
      <div className="grid gap-3 border-b border-border pb-4">
        <LinkTitleRow
          icon={icon}
          title={title}
          placeholder={link?.slug || t("Untitled")}
          disabled={locked}
          aiAvailable={aiAvailable}
          destinationUrl={destinationUrl}
          linkId={id}
          onIcon={setIcon}
          onTitle={setTitle}
        />
        {link ? (
          <>
            <a
              className="block truncate font-mono text-base text-muted-foreground underline-offset-3 hover:text-primary md:text-sm"
              href={link.shortUrl}
              title={link.shortUrl}
              target="_blank"
              rel="noreferrer"
            >
              {link.shortUrl}
            </a>
            <div className="sr-only">
              <p>
                {t("Created by")} {link.owner?.username ?? t("Unknown")}
              </p>
              <p>
                {t("Last changed by")} {link.updatedBy?.username ?? t("Unknown")}
              </p>
            </div>
            {locked ? (
              <p className="text-base text-muted-foreground md:text-sm">
                {t("You can view this link but not change it.")}
              </p>
            ) : null}
          </>
        ) : null}
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
      <form id="link-editor" className="grid gap-4" onSubmit={(event) => void save(event)}>
            <fieldset
              disabled={locked}
              className="m-0 grid min-w-0 gap-3 border-0 p-0"
            >
              <LinkIdentity
                icon={icon}
                folderId={folderId}
                folders={folders}
                tags={tags}
                showIcon={false}
                disabled={locked}
                onIcon={setIcon}
                onFolder={setFolderId}
                onTags={(next) => {
                  tagsRef.current = next;
                  setTags(next);
                }}
              />
              <LinkSuggestFields
                aiAvailable={aiAvailable}
                linkId={id}
                hideTitle
                destinationFirst
                quietLabels
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
                  srOnly
                  value={redirectDomainId}
                  onValueChange={setRedirectDomainId}
                />
              </LinkSuggestFields>
              <Section title={t("Settings")}>
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
              </Section>
              <Section title={t("UTM")}>
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
              </Section>
              <Section title={t("Routing")}>
              <RouteBuilder
                rules={routes}
                choices={routingChoices}
                utm={utm}
                locale={locale}
                onChange={setRoutes}
                leading={
                  aiAvailable && !locked ? (
                    <RouteSuggest
                      onAppend={(drafts) =>
                        setRoutes((current) => [...current, ...drafts].slice(0, MAX_ROUTING_RULES))
                      }
                    />
                  ) : null
                }
              />
              </Section>
              {locked ? null : (
                <Button type="submit" disabled={saving}>
                  <Save /> {saving ? t("Saving…") : t("Save link")}
                </Button>
              )}
            </fieldset>
          </form>
      <Section title={t("QR code")}>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="lg:col-start-2 lg:row-start-1">
              <Card>
                <CardContent>
              <QrPreview
                url={previewUrl || "https://example.com"}
                style={style}
                logoUrl={logoUrl}
              />
                </CardContent>
              </Card>
            </div>
            <form
              className="grid min-w-0 gap-3 lg:col-start-1 lg:row-start-1"
              onSubmit={(event) => void createQr(event)}
            >
              <fieldset
                disabled={locked}
                className="m-0 grid min-w-0 gap-3 border-0 p-0"
              >
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
                  <MediaField
                    value={logo}
                    accept={rasterImageMimes}
                    acceptLabel={t("PNG, JPEG, or WebP")}
                    disabled={locked}
                    removeLabel={t("Remove center image")}
                    onChange={(media) => {
                      if (!media) {
                        void removeCenterImage();
                        return;
                      }
                      setLogo({ id: media.id, url: media.path, name: media.name });
                      setStyle((current) => ({ ...current, errorCorrectionLevel: "H" }));
                    }}
                  />
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
      </Section>
      {qrCodes.length > 0 ? (
        <Section title={t("Saved codes")}>
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
                          onClick={() => showQr(code)}
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
        </Section>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <Section title={t("Clicks")}>
              {aiAvailable ? (
                <AnalyticsSummary
                  linkId={id}
                  earliest={earliest}
                  range={report.range}
                  onRange={(from, to) => report.setRange({ from, to })}
                />
              ) : null}
              <ClickChart series={analytics.series} />
          </Section>
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

function logoName(url: string): string {
  return decodeURIComponent(url.split("/").at(-1) ?? "");
}
