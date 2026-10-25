import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import {
  applyUtm,
  defaultQrStyle,
  qrWarnings,
  utmConflicts,
  type QrStyle,
  type QrWarning,
  type UtmParams,
} from "@sharry/shared";
import {
  api,
  type Analytics,
  type LinkSummary,
  type PublicSettings,
  type QrCode,
  type ShortLink,
} from "../api.ts";
import { PageTitle } from "../components/page-title.tsx";
import { choiceNote, correctionOptions, redirectOptions } from "../choices.ts";
import { downloadQr, QrPreview } from "../components/qr-preview.tsx";
import { UtmFields } from "../components/utm-fields.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
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
  TableRow,
} from "../components/ui/table.tsx";
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

export function LinksPage() {
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

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
          toastCaught(caught, "Could not load links");
        })
        .finally(() => {
          if (current === requestId.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

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
        toastCaught(caught, "Could not load links");
      }
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            Links
          </h1>
          <p className="text-sm text-muted-foreground">
            The slug stays put when you edit where it goes.
          </p>
        </div>
        <Link className={buttonVariants({ size: "sm" })} to="/links/new">
          <Plus /> New link
        </Link>
      </div>
      <Field label="Search">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Slug, title, or destination"
        />
      </Field>
      <Card className="mt-4 min-w-0">
        <CardContent className="min-w-0">
          <Table className="min-w-full w-max">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>
                  <span className="sr-only">Test</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Loading links…
                  </TableCell>
                </TableRow>
              ) : links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {failed ? "Could not load links." : "No links match."}
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
                      className="truncate font-mono text-sm text-muted-foreground"
                      title={link.shortUrl}
                    >
                      {link.shortUrl}
                    </TableCell>
                    <TableCell
                      className="truncate text-muted-foreground"
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
                        {link.status === "active" ? "Active" : "Paused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {link.clicks}
                    </TableCell>
                    <TableCell>
                      <a
                        className={buttonVariants({
                          variant: "outline",
                          size: "icon-sm",
                        })}
                        href={link.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Test ${link.title?.trim() || link.slug}`}
                      >
                        <ExternalLink />
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {!loading && links.length < total ? (
            <Button
              className="mt-4"
              variant="outline"
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore
                ? "Loading…"
                : `Load more (${links.length} of ${total})`}
            </Button>
          ) : null}
        </CardContent>
      </Card>
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
  const [domains, setDomains] = useState<{ id: string; hostname: string }[]>([]);
  const [defaultHost, setDefaultHost] = useState("Default");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ domains: { id: string; hostname: string }[] }>("/api/redirect-domains"),
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
          { value: defaultRedirectDomain, label: `${defaultHost} (default)` },
          ...domains.map((domain) => ({ value: domain.id, label: domain.hostname })),
        ]}
        onValueChange={onValueChange}
      />
      <p className="text-[13px] leading-snug font-normal text-muted-foreground">
        The short URL uses this domain. A QR code downloaded later uses the domain saved on the link.
      </p>
    </Field>
  );
}

export function LinkFormPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("https://");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [redirectType, setRedirectType] = useState<
    "301" | "302" | "307" | "308"
  >("302");
  const [utm, setUtm] = useState<UtmParams>(emptyUtm);
  const [redirectDomainId, setRedirectDomainId] = useState(defaultRedirectDomain);
  const [pending, setPending] = useState(false);

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
      toastCaught(caught, "Could not create the link");
    } finally {
      setPending(false);
    }
  }

  const conflicts = utmConflicts(destinationUrl, utm);
  return (
    <section>
      <h1 className="mb-5 font-heading text-4xl font-medium tracking-tight">
        New link
      </h1>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <Field
              label="Destination"
              info={
                conflicts.length > 0
                  ? `Saving will replace ${conflicts.join(", ")} already present on the destination.`
                  : undefined
              }
            >
              <Input
                value={destinationUrl}
                onChange={(event) => setDestinationUrl(event.target.value)}
                required
              />
            </Field>
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Custom slug">
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="Leave blank for a random slug"
              />
            </Field>
            <RedirectDomainField value={redirectDomainId} onValueChange={setRedirectDomainId} />
            <Field label="Redirect">
              <Select
                value={redirectType}
                options={[...redirectOptions]}
                onValueChange={setRedirectType}
              />
              {/* <p className="sr-only text-[13px] leading-snug font-normal text-muted-foreground">{choiceNote(redirectOptions, redirectType)}</p> */}
            </Field>
            <UtmFields utm={utm} onChange={setUtm} />
            {settings ? (
              <p className="text-sm text-muted-foreground">
                Preview: {previewDestination(destinationUrl, utm)}
              </p>
            ) : null}
            <Button type="submit" disabled={pending}>
              <Plus /> {pending ? "Creating…" : "Create link"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

export function LinkDetailPage() {
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
  const [redirectDomainId, setRedirectDomainId] = useState(defaultRedirectDomain);
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
        const [next, codes, stats, variantData] = await Promise.all([
          api<ShortLink>(`/api/links/${id}`),
          api<{ qrCodes: QrCode[] }>(`/api/links/${id}/qr`),
          api<Analytics>(`/api/links/${id}/analytics`),
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
        setRedirectDomainId(next.redirectDomainId ?? defaultRedirectDomain);
        setQrCodes(codes.qrCodes);
        setAnalytics(stats);
        setVariants(variantData.variants);
        const saved = codes.qrCodes[0];
        if (saved) await showQr(saved, () => cancelled);
        else setTrackingVariantId(noVariant);
      } catch (caught) {
        if (!cancelled) toastCaught(caught, "Could not load this link");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
        }),
      });
      setLink(updated);
      setSlug(updated.slug);
      setRedirectDomainId(updated.redirectDomainId ?? defaultRedirectDomain);
      setPassword("");
      toast.success(
        slug.trim()
          ? "Saved. The short URL keeps this slug."
          : "Saved. A random slug replaced the empty one.",
      );
    } catch (caught) {
      toastCaught(caught, "Could not save");
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
      toast.success("Password removed. The short link redirects directly.");
    } catch (caught) {
      toastCaught(caught, "Could not remove the password");
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
      toastCaught(caught, "Could not copy the short URL");
    }
  }

  async function remove() {
    try {
      await api(`/api/links/${id}`, { method: "DELETE" });
      setConfirmDelete(false);
      await navigate("/links");
    } catch (caught) {
      toastCaught(caught, "Could not delete this link");
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
      toast.success("QR code saved. Downloads use this code’s short URL.");
    } catch (caught) {
      toastCaught(caught, "Could not save the QR code");
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
        toastCaught(caught, "Could not remove the center image");
        return;
      }
    }
    setLogoFile(null);
    setLogoUrl(null);
    setLogoInputKey((key) => key + 1);
    toast.success("Center image removed.");
  }

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
      <PageTitle title={link?.title?.trim() || link?.slug || "Link"} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            {link?.title?.trim() || link?.slug || "Link"}
          </h1>
          {link ? (
            <a
              className="mt-1.5 block font-mono text-sm break-all text-muted-foreground underline-offset-3 hover:text-primary"
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer"
            >
              {link.shortUrl}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="submit"
            size="sm"
            form="link-editor"
            disabled={saving || loading || !link}
          >
            <Save /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!link?.shortUrl}
            onClick={() => void copyShortUrl()}
          >
            {copied ? (
              <>
                <Check /> Copied
              </>
            ) : (
              <>
                <Copy /> Copy
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading link…</p>
      ) : null}
      <Card>
        <CardContent>
          <form
            id="link-editor"
            className="grid gap-3"
            onSubmit={(event) => void save(event)}
          >
            <Field
              label="Destination"
              info={
                conflicts.length > 0
                  ? `This will replace ${conflicts.join(", ")} on the destination.`
                  : undefined
              }
            >
              <Input
                value={destinationUrl}
                onChange={(event) => setDestinationUrl(event.target.value)}
                required
              />
            </Field>
            <Field label="Slug">
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="Leave blank for a random slug"
              />
            </Field>
            <RedirectDomainField value={redirectDomainId} onValueChange={setRedirectDomainId} />
            <Field label="Title">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
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
                <p className="sr-only text-[13px] leading-snug font-normal text-muted-foreground">
                  {choiceNote(redirectOptions, redirectType)}
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
            <Field label={link?.hasPassword ? "Replace password" : "Password"}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  link?.hasPassword ? "Leave blank to keep it." : "Optional"
                }
                autoComplete="new-password"
              />
              <p className="text-[13px] leading-snug font-normal text-muted-foreground">
                Visitors must enter this password before the short link
                redirects.
                {link?.hasPassword ? " A password is already saved." : ""}
              </p>
            </Field>
            {link?.hasPassword ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => void clearPassword()}
              >
                <Trash2 /> Remove password
              </Button>
            ) : null}
            <UtmFields utm={utm} onChange={setUtm} />
            <p className="text-sm text-muted-foreground truncate">
              Tracked URL: {previewDestination(destinationUrl, utm)}
            </p>
            <Button type="submit" disabled={saving}>
              <Save /> {saving ? "Saving…" : "Save link"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="lg:col-start-2 lg:row-start-1">
          <QrPreview
            url={previewUrl || "https://example.com"}
            style={style}
            logoUrl={logoUrl}
          />
        </div>
        <Card className="lg:col-start-1 lg:row-start-1">
          <CardContent>
            <form
              className="grid gap-3"
              onSubmit={(event) => void createQr(event)}
            >
              <h2 className="text-lg font-medium">QR code</h2>
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
                    { value: noVariant, label: "No variant" },
                    ...variants.map((variant) => ({
                      value: variant.id,
                      label: variant.name,
                    })),
                  ]}
                  onValueChange={setTrackingVariantId}
                />
                <p className="text-[13px] leading-snug font-normal text-muted-foreground">
                  The QR code uses this variant’s UTM values when someone scans
                  it.
                </p>
              </Field>
              <Field label="Modules">
                <Select
                  value={style.dotsType}
                  options={[...moduleOptions]}
                  onValueChange={(dotsType) => setStyle({ ...style, dotsType })}
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
                Transparent background
                {transparentWarning ? (
                  <FieldMessage tone="info" message={transparentWarning} />
                ) : null}
              </label>
              <Field label="Center image scale" info={scanWarning("imageSize")}>
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
              <Field label="Error correction" info={scanWarning("errorCorrection")}>
                <Select
                  value={style.errorCorrectionLevel}
                  options={[...correctionOptions]}
                  onValueChange={(errorCorrectionLevel) =>
                    setStyle({ ...style, errorCorrectionLevel })
                  }
                />
                <p className="text-[13px] leading-snug font-normal text-muted-foreground">
                  {choiceNote(correctionOptions, style.errorCorrectionLevel)}
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
                {logoUrl ? (
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => void removeCenterImage()}
                  >
                    <Trash2 /> Remove center image
                  </Button>
                ) : null}
              </Field>
              <Button type="submit" disabled={savingQr}>
                <Save /> {savingQr ? "Saving…" : "Save QR style"}
              </Button>
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
                      slug || "sharry",
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
                      slug || "sharry",
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
                      slug || "sharry",
                    )
                  }
                  >
                  <Download /> JPEG
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      {qrCodes.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="mb-2 text-lg font-medium">Saved codes</h2>
            <ul className="grid gap-2">
              {qrCodes.map((code) => (
                <li key={code.id} className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={activeQr?.id === code.id ? "default" : "outline"}
                    type="button"
                    aria-pressed={activeQr?.id === code.id}
                    onClick={() => void showQr(code)}
                  >
                    {code.name}
                  </Button>
                  <span className="font-mono text-sm break-all text-muted-foreground">
                    {code.url}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <Card>
            <CardContent>
              <ClickChart series={analytics.series} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown
              title="QR codes"
              rows={analytics.qrCodes.map((row) => ({
                name: row.name,
                clicks: row.clicks,
              }))}
            />
            <UtmBreakdowns analytics={analytics} />
          </div>
        </div>
      ) : null}
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
