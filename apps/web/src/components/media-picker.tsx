import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { LoaderCircle, Search, Upload } from "lucide-react";
import { defaultFolderIcon } from "@sharry/shared";
import { cn } from "cn";
import { api, type MediaItem } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { AppIcon } from "./app-icon.tsx";
import { FolderCrumbs, type CrumbFolder } from "./folder-crumbs.tsx";
import { MediaThumb } from "./media-thumb.tsx";
import { draggedFiles, uploadMediaFile } from "./media-uploads.ts";
import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { toastCaught } from "./ui/toast.tsx";

type PickerFolder = CrumbFolder & { icon: string | null };

export function MediaPicker({
  open,
  onOpenChange,
  accept,
  acceptLabel,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** MIME types the caller can use. Other files are hidden and refused on upload. */
  accept: readonly string[];
  acceptLabel: string;
  onPick: (media: MediaItem) => void;
}) {
  const { t } = useI18n();
  const [folder, setFolder] = useState("root");
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<PickerFolder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<CrumbFolder[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const q = query.trim();
    const list = `/api/media?limit=200&folder=${encodeURIComponent(folder)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
    const timer = window.setTimeout(() => {
      void Promise.all([
        api<{ media?: MediaItem[] }>(list),
        q
          ? Promise.resolve({ folders: [], breadcrumb: [] })
          : api<{ folders?: PickerFolder[]; breadcrumb?: CrumbFolder[] }>(
              `/api/folders?kind=media&parent=${encodeURIComponent(folder)}`,
            ),
      ])
        .then(([listResult, level]) => {
          if (cancelled) return;
          setMedia(listResult.media ?? []);
          setFolders(level.folders ?? []);
          if (!q) setBreadcrumb(level.breadcrumb ?? []);
        })
        .catch((caught: unknown) => {
          if (!cancelled) toastCaught(caught, t("Could not load media"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, q ? 200 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, folder, query]);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setError(null);
    setDropActive(false);
  }, [open]);

  function pick(item: MediaItem) {
    onPick(item);
    onOpenChange(false);
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!accept.includes(file.type)) {
      setError(t("Use one of these file types: {types}", { types: acceptLabel }));
      return;
    }
    setError(null);
    setUploadProgress(0);
    try {
      const created = await uploadMediaFile(file, folder === "root" ? null : folder, setUploadProgress).promise;
      pick(created);
    } catch (caught) {
      setError(t(caught instanceof Error ? caught.message : "Upload failed"));
    } finally {
      setUploadProgress(null);
    }
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    void upload(event.target.files?.[0]);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLElement>) {
    if (!draggedFiles(event)) return;
    event.preventDefault();
    setDropActive(false);
    void upload(event.dataTransfer.files?.[0]);
  }

  const usable = media.filter((item) => accept.includes(item.mime));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Choose from library")}</DialogTitle>
          <DialogDescription>{t("Pick a file or drop a new one here. Allowed: {types}", { types: acceptLabel })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search media"
              aria-label={t("Search media")}
              className="pl-8"
            />
          </div>
          <Button type="button" variant="outline" disabled={uploadProgress !== null} onClick={() => fileInput.current?.click()}>
            {uploadProgress !== null ? <LoaderCircle className="animate-spin" /> : <Upload />} {t("Upload")}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={accept.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label={t("Upload")}
            onChange={pickFile}
          />
        </div>
        <div className="min-h-6">
          {searching ? (
            <p className="text-sm text-muted-foreground">{t("Searching all folders")}</p>
          ) : (
            <FolderCrumbs
              rootLabel={t("Media")}
              folder={folder}
              breadcrumb={breadcrumb}
              onOpen={(id) => setFolder(id ?? "root")}
              onDrop={() => undefined}
            />
          )}
        </div>
        <div
          className={cn(
            "relative h-80 overflow-y-auto rounded-md border border-dashed border-border p-2",
            dropActive && "border-primary bg-primary/5",
          )}
          data-testid="media-picker-drop"
          onDragOver={(event) => {
            if (!draggedFiles(event)) return;
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={drop}
        >
          {loading && media.length === 0 && folders.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">{t("Loading…")}</div>
          ) : folders.length === 0 && usable.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              {searching ? t("No files match this search.") : t("No matching files here yet. Drop one to upload it.")}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {folders.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-sm hover:bg-accent"
                    onClick={() => setFolder(item.id)}
                  >
                    <AppIcon name={item.icon ?? defaultFolderIcon} />
                    <span className="truncate font-medium">{item.name}</span>
                  </button>
                </li>
              ))}
              {usable.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="grid w-full gap-1.5 rounded-md border border-border p-2 text-left text-sm hover:bg-accent"
                    onClick={() => pick(item)}
                  >
                    <MediaThumb media={item} className="aspect-square size-auto w-full" />
                    <span className="truncate">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {uploadProgress !== null ? (
            <div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("Upload progress")}>
              <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
            </div>
          ) : null}
        </div>
        <p className="min-h-5 text-sm text-destructive" role={error ? "alert" : undefined}>
          {error}
        </p>
      </DialogContent>
    </Dialog>
  );
}
