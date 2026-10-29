import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, ExternalLink, FileText, Save, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { formatFileSize } from "@sharry/shared";
import { api, type MediaItem, type MediaUsage } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { mediaTypeLabel } from "./media-thumb.tsx";
import { RelativeTime } from "./relative-time.tsx";
import { Button } from "./ui/button.tsx";
import { copyText } from "./ui/copy.ts";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { toast, toastCaught } from "./ui/toast.tsx";

type Detail = MediaItem & { usage: MediaUsage };

const mediaSheetWidthKey = "sharry.media-sheet-width";
const mediaSheetDefaultWidth = 448;
const mediaSheetMinWidth = 320;
export const mediaSheetMaxWidth = 960;

export function clampMediaSheetWidth(value: number): number {
  if (!Number.isFinite(value)) return mediaSheetDefaultWidth;
  return Math.round(Math.min(mediaSheetMaxWidth, Math.max(mediaSheetMinWidth, value)));
}

export function loadMediaSheetWidth(): number {
  try {
    const raw = localStorage.getItem(mediaSheetWidthKey);
    if (raw === null || raw.trim() === "") return mediaSheetDefaultWidth;
    return clampMediaSheetWidth(Number(raw));
  } catch {
    return mediaSheetDefaultWidth;
  }
}

function saveMediaSheetWidth(width: number): void {
  try {
    localStorage.setItem(mediaSheetWidthKey, String(clampMediaSheetWidth(width)));
  } catch {
    // The chosen width still applies for this visit when storage is blocked.
  }
}

export function MediaDetailSheet({
  mediaId,
  initial,
  onOpenChange,
  onSaved,
  onDelete,
}: {
  mediaId: string | null;
  initial: MediaItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (media: MediaItem) => void;
  onDelete: (media: MediaItem) => void;
}) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState("");
  const [alt, setAlt] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(loadMediaSheetWidth);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;
  const shown: MediaItem | null = detail ?? initial;

  function applyWidth(next: number) {
    const clamped = clampMediaSheetWidth(next);
    widthRef.current = clamped;
    setWidth(clamped);
    saveMediaSheetWidth(clamped);
  }

  useEffect(() => {
    setDetail(null);
    if (!mediaId) return;
    let cancelled = false;
    void api<Detail>(`/api/media/${mediaId}`)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        setName(loaded.name);
        setAlt(loaded.alt ?? "");
        setTitle(loaded.title ?? "");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        toastCaught(caught, t("Could not load this file"));
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const editable = shown?.canEdit !== false;
  const changed =
    detail !== null && (name.trim() !== detail.name || alt.trim() !== (detail.alt ?? "") || title.trim() !== (detail.title ?? ""));
  const inUse = (detail?.usage.qrCodes.length ?? 0) + (detail?.usage.pages.length ?? 0) > 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!detail || !changed) return;
    setSaving(true);
    try {
      const updated = await api<MediaItem>(`/api/media/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), alt: alt.trim() || null, title: title.trim() || null }),
      });
      setDetail({ ...detail, ...updated });
      setName(updated.name);
      onSaved(updated);
      toast.success(t("File saved."));
    } catch (caught) {
      toastCaught(caught, t("Could not save"));
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    if (!shown) return;
    try {
      await copyText(shown.url);
      toast.success(t("URL copied."));
    } catch (caught) {
      toastCaught(caught, t("Could not copy the URL"));
    }
  }

  return (
    <Sheet open={mediaId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 overflow-y-auto"
        style={{ width, maxWidth: "100%", transition: dragging ? "none" : undefined }}
      >
        <span
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={mediaSheetMinWidth}
          aria-valuemax={mediaSheetMaxWidth}
          aria-valuenow={width}
          aria-label={t("Resize the file details")}
          tabIndex={0}
          className="absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-border pointer-coarse:w-3 pointer-coarse:bg-border/40"
          onKeyDown={(event) => {
            const step = event.shiftKey ? 80 : 16;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              applyWidth(width + step);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              applyWidth(width - step);
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const startX = event.clientX;
            const startWidth = widthRef.current;
            setDragging(true);
            function move(next: PointerEvent) {
              const resized = clampMediaSheetWidth(startWidth + startX - next.clientX);
              widthRef.current = resized;
              setWidth(resized);
            }
            function up() {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
              window.removeEventListener("pointercancel", up);
              setDragging(false);
              saveMediaSheetWidth(widthRef.current);
            }
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            window.addEventListener("pointercancel", up);
          }}
        />
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate">{shown?.name ?? t("File")}</SheetTitle>
          <SheetDescription>
            {shown
              ? [mediaTypeLabel(shown), formatFileSize(shown.size), shown.width && shown.height ? `${shown.width} × ${shown.height}` : null]
                  .filter(Boolean)
                  .join(" · ")
              : t("Loading…")}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-4">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {!shown ? (
              <Skeleton className="size-full" />
            ) : shown.kind === "image" ? (
              <img src={shown.path} alt={shown.alt ?? ""} className="size-full object-contain" />
            ) : shown.kind === "video" ? (
              <video src={shown.path} controls preload="metadata" className="size-full bg-black object-contain" />
            ) : (
              <a href={shown.path} target="_blank" rel="noopener" className="grid justify-items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <FileText className="size-8" aria-hidden />
                {t("Open the PDF")}
              </a>
            )}
          </div>
          <form className="grid gap-3" onSubmit={(event) => void save(event)}>
            <fieldset disabled={!editable || !detail} className="m-0 grid gap-3 border-0 p-0">
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
              </Field>
              {shown?.kind !== "document" ? (
                <Field label="Alt text" info={t("Describe what the image shows for people who cannot see it.")}>
                  <Textarea value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={500} rows={3} />
                </Field>
              ) : null}
              <Field label="Title">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
              </Field>
            </fieldset>
            {editable ? (
              <Button type="submit" disabled={!changed || saving} className="justify-self-start">
                <Save /> {saving ? t("Save file") : t("Save file")}
              </Button>
            ) : null}
          </form>
          <Field label="Public URL">
            <div className="flex gap-2">
              <Input value={shown?.url ?? ""} readOnly className="font-mono" onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" size="icon" aria-label={t("Copy URL")} onClick={() => void copyUrl()}>
                <Copy />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("Open")}
                disabled={!shown}
                onClick={() => shown && window.open(shown.path, "_blank", "noopener")}
              >
                <ExternalLink />
              </Button>
            </div>
          </Field>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">{t("Used by")}</span>
            {!detail ? (
              <Skeleton className="h-5 w-40" />
            ) : inUse ? (
              <ul className="grid gap-1">
                {detail.usage.qrCodes.map((code) => (
                  <li key={code.id}>
                    <Link className="hover:underline" to={`/links/${code.linkId}`}>
                      {t("QR code {name} on {slug}", { name: code.name, slug: code.linkSlug })}
                    </Link>
                  </li>
                ))}
                {detail.usage.pages.map((page) => (
                  <li key={page.id}>
                    <Link className="hover:underline" to={`/pages/${page.id}`}>
                      {t("Landing page {title}", { title: page.title })}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">{t("Not used anywhere yet.")}</span>
            )}
          </div>
          {shown ? (
            <p className="text-sm text-muted-foreground">
              {shown.owner ? t("Uploaded by {name}", { name: shown.owner.username }) : t("Uploaded")}{" "}
              <RelativeTime value={shown.createdAt} />
            </p>
          ) : null}
          {editable && shown ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start text-destructive"
              disabled={inUse || !detail}
              title={inUse ? t("Remove it from the QR codes and pages that use it first.") : undefined}
              onClick={() => onDelete(shown)}
            >
              <Trash2 /> {t("Delete file")}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
