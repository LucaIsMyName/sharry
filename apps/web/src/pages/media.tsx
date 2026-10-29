import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Copy, ExternalLink, FolderInput, FolderPlus, LoaderCircle, Pencil, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { defaultFolderIcon, formatFileSize, mediaAccept } from "@sharry/shared";
import { api, type MediaItem } from "../api.ts";
import { AppIcon } from "../components/app-icon.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import { FolderCrumbs } from "../components/folder-crumbs.tsx";
import { FolderMoveDialog } from "../components/folder-move-dialog.tsx";
import { FolderNameInput } from "../components/folder-name-input.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { MediaDetailSheet } from "../components/media-detail-sheet.tsx";
import { MediaThumb, mediaTypeLabel } from "../components/media-thumb.tsx";
import { draggedFiles, useMediaUploads, type UploadEntry } from "../components/media-uploads.ts";
import { PageHeader } from "../components/page-header.tsx";
import { RelativeTime } from "../components/relative-time.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { ConfirmDialog, useConfirm } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
import { DataTable, loadTableView, saveTableView, type DataColumn, type TableView } from "../components/ui/data-table.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { t, useI18n } from "../i18n/index.tsx";
import { cn } from "cn";

const pageSize = 100;

type FolderItem = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  childCount?: number;
};

type MediaRow =
  | { kind: "upload"; upload: UploadEntry }
  | { kind: "folder"; folder: FolderItem }
  | { kind: "media"; media: MediaItem };

type Placement = { id: string; parentId: string | null };

const kindLabels = { image: "Image", video: "Video", document: "Document" } as const;

export function MediaPage() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || "root";
  const folderId = folder === "root" ? null : folder;
  const openFileId = params.get("file");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<FolderItem[]>([]);
  const [tree, setTree] = useState<FolderItem[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<TableView>(() => loadTableView("media"));
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [deleteMedia, setDeleteMedia] = useState<MediaItem | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderRef = useRef(folderId);
  folderRef.current = folderId;

  const uploads = useMediaUploads((created) => {
    if (created.folderId === folderRef.current) {
      setMedia((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setTotal((count) => count + 1);
    } else {
      setReload((value) => value + 1);
    }
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const kind = view.filters.kind ?? "";
    const sort = view.sort?.column ?? "";
    const dir = view.sort?.direction ?? "";
    const list = `/api/media?limit=${pageSize}&offset=0&folder=${encodeURIComponent(folder)}${
      kind ? `&kind=${encodeURIComponent(kind)}` : ""
    }${sort ? `&sort=${encodeURIComponent(sort)}&dir=${encodeURIComponent(dir)}` : ""}`;
    void Promise.all([
      api<{ media?: MediaItem[]; total?: number }>(list),
      api<{ folders?: FolderItem[]; breadcrumb?: FolderItem[] }>(`/api/folders?kind=media&parent=${encodeURIComponent(folder)}`),
      api<{ folders?: FolderItem[] }>("/api/folders?kind=media&tree=1"),
    ])
      .then(([listResult, level, all]) => {
        if (cancelled) return;
        setMedia(listResult.media ?? []);
        setTotal(listResult.total ?? 0);
        setFolders(level.folders ?? []);
        setBreadcrumb(level.breadcrumb ?? []);
        setTree(all.folders ?? []);
        setFailed(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailed(true);
        toastCaught(caught, t("Could not load media"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, reload, view.sort, view.filters.kind]);

  useEffect(() => {
    function reset() {
      dragDepth.current = 0;
      setDropActive(false);
    }
    function keepFilesOnPage(event: globalThis.DragEvent) {
      if (draggedFiles(event)) event.preventDefault();
    }
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    window.addEventListener("dragover", keepFilesOnPage);
    window.addEventListener("drop", keepFilesOnPage);
    return () => {
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
      window.removeEventListener("dragover", keepFilesOnPage);
      window.removeEventListener("drop", keepFilesOnPage);
    };
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await api<{ media?: MediaItem[]; total?: number }>(
        `/api/media?limit=${pageSize}&offset=${media.length}&folder=${encodeURIComponent(folder)}`,
      );
      setMedia((existing) => [...existing, ...(result.media ?? [])]);
      setTotal(result.total ?? 0);
    } catch (caught) {
      toastCaught(caught, t("Could not load media"));
    } finally {
      setLoadingMore(false);
    }
  }

  function openFolder(id: string | null) {
    const next = new URLSearchParams(params);
    if (!id) next.delete("folder");
    else next.set("folder", id);
    next.delete("file");
    setSelected([]);
    setParams(next);
  }

  function openFile(id: string | null) {
    const next = new URLSearchParams(params);
    if (id) next.set("file", id);
    else next.delete("file");
    setParams(next, { replace: true });
  }

  function upload(files: File[], target: string | null) {
    if (files.length === 0) return;
    uploads.enqueue(files, target);
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    upload(Array.from(event.target.files ?? []), folderId);
    event.target.value = "";
  }

  async function createFolder() {
    const base = t("New folder");
    const taken = new Set(folders.map((item) => item.name.toLowerCase()));
    let name = base;
    let count = 2;
    while (taken.has(name.toLowerCase())) {
      name = `${base} ${count}`;
      count += 1;
    }
    try {
      const created = await api<{ id: string }>("/api/folders", {
        method: "POST",
        body: JSON.stringify({ kind: "media", name, parentId: folderId }),
      });
      setRenameId(created.id);
      setRenameValue(name);
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not create the folder"));
    }
  }

  async function commitRename(item: FolderItem) {
    const name = renameValue.trim();
    setRenameId(null);
    if (!name || name === item.name) return;
    try {
      await api(`/api/folders/${item.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not rename the folder"));
    }
  }

  function placementOf(id: string): Placement | null {
    const [kind, rawId] = id.split(":");
    if (!rawId) return null;
    if (kind === "folder") {
      const found = folders.find((item) => item.id === rawId) ?? tree.find((item) => item.id === rawId);
      return found ? { id, parentId: found.parentId } : null;
    }
    if (kind === "media") {
      const found = media.find((item) => item.id === rawId);
      if (!found || found.canEdit === false) return null;
      return { id, parentId: found.folderId };
    }
    return null;
  }

  async function place(items: Placement[]) {
    await Promise.all(
      items.map(({ id, parentId }) => {
        const [kind, rawId] = id.split(":");
        return kind === "folder"
          ? api(`/api/folders/${rawId}`, { method: "PATCH", body: JSON.stringify({ parentId }) })
          : api(`/api/media/${rawId}`, { method: "PATCH", body: JSON.stringify({ folderId: parentId }) });
      }),
    );
  }

  async function moveItems(ids: string[], target: string | null) {
    const before = ids
      .map(placementOf)
      .filter((item): item is Placement => item !== null)
      .filter((item) => item.parentId !== target && item.id !== `folder:${target}`);
    if (before.length === 0) return;
    try {
      await place(before.map((item) => ({ id: item.id, parentId: target })));
      setSelected([]);
      setMoveIds(null);
      setReload((value) => value + 1);
      toast.success(before.length === 1 ? t("Moved 1 item.") : t("Moved {count} items.", { count: before.length }), {
        label: t("Undo"),
        onClick: () => {
          void place(before)
            .then(() => setReload((value) => value + 1))
            .catch((caught: unknown) => toastCaught(caught, t("Could not move that")));
        },
      });
    } catch (caught) {
      toastCaught(caught, t("Could not move that"));
      setReload((value) => value + 1);
    }
  }

  function dropPayload(payload: string, target: string | null) {
    void moveItems(payload.split(",").filter(Boolean), target);
  }

  async function removeMedia() {
    if (!deleteMedia) return;
    try {
      await api(`/api/media/${deleteMedia.id}`, { method: "DELETE" });
      setSelected((current) => current.filter((id) => id !== `media:${deleteMedia.id}`));
      if (openFileId === deleteMedia.id) openFile(null);
      setDeleteMedia(null);
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not delete the file"));
    }
  }

  async function removeFolder(item: FolderItem) {
    const confirmed = await confirm({
      title: "Delete this folder?",
      description: "Its files move up one level.",
      confirmLabel: "Delete folder",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await api(`/api/folders/${item.id}`, { method: "DELETE" });
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not delete the folder"));
    }
  }

  async function removeSelected() {
    if (selected.length === 0) return;
    const confirmed = await confirm({
      title: t("Delete {count} selected rows?", { count: selected.length }),
      description: "Folders move their contents up one level.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
    const results = await Promise.allSettled(
      selected.map((id) =>
        id.startsWith("folder:")
          ? api(`/api/folders/${id.slice("folder:".length)}`, { method: "DELETE" })
          : api(`/api/media/${id.slice("media:".length)}`, { method: "DELETE" }),
      ),
    );
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) toastCaught(failure.reason, t("Could not delete the selection"));
    setSelected([]);
    setReload((value) => value + 1);
  }

  async function copyUrl(item: MediaItem) {
    try {
      await copyText(item.url);
      toast.success(t("URL copied."));
    } catch (caught) {
      toastCaught(caught, t("Could not copy the URL"));
    }
  }

  function onPageDragEnter(event: DragEvent<HTMLElement>) {
    if (!draggedFiles(event)) return;
    dragDepth.current += 1;
    setDropActive(true);
  }

  function onPageDragLeave(event: DragEvent<HTMLElement>) {
    if (!draggedFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropActive(false);
  }

  function onPageDrop(event: DragEvent<HTMLElement>) {
    if (!draggedFiles(event)) return;
    event.preventDefault();
    upload(Array.from(event.dataTransfer.files ?? []), folderId);
  }

  const nameFilter = view.filters.name?.toLowerCase() ?? "";
  const altFilter = view.filters.alt ?? "";
  const rows: MediaRow[] = [
    ...uploads.entries.map((entry) => ({ kind: "upload" as const, upload: entry })),
    ...folders
      .filter((item) => !altFilter && (!nameFilter || item.name.toLowerCase().includes(nameFilter)))
      .map((item) => ({ kind: "folder" as const, folder: item })),
    ...media
      .filter((item) => !nameFilter || item.name.toLowerCase().includes(nameFilter))
      .filter((item) => {
        if (altFilter === "missing") return item.kind === "image" && !item.alt?.trim();
        if (altFilter === "present") return Boolean(item.alt?.trim());
        return true;
      })
      .map((item) => ({ kind: "media" as const, media: item })),
  ];
  const currentFolderName = breadcrumb.at(-1)?.name ?? t("Media");
  const activeFile = openFileId ? (media.find((item) => item.id === openFileId) ?? null) : null;

  const columns: DataColumn<MediaRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      filter: "text",
      cell: (row) => {
        if (row.kind === "upload") {
          return (
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                {row.upload.status === "failed" ? (
                  <TriangleAlert className="size-4 text-destructive" />
                ) : (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
              </span>
              <span className="grid min-w-0 gap-1">
                <span className="truncate">{row.upload.name}</span>
                {row.upload.status === "failed" ? (
                  <span className="truncate text-xs text-destructive">{row.upload.error}</span>
                ) : (
                  <span className="h-1 w-40 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={t("Upload progress")} aria-valuenow={Math.round(row.upload.progress * 100)}>
                    <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.round(row.upload.progress * 100)}%` }} />
                  </span>
                )}
              </span>
            </span>
          );
        }
        if (row.kind === "folder") {
          return (
            <span className="inline-flex min-w-0 items-center gap-2 font-medium">
              <span className="flex size-9 shrink-0 items-center justify-center">
                <AppIcon name={row.folder.icon ?? defaultFolderIcon} />
              </span>
              {renameId === row.folder.id ? (
                <FolderNameInput
                  value={renameValue}
                  onChange={setRenameValue}
                  onCommit={() => void commitRename(row.folder)}
                  onCancel={() => setRenameId(null)}
                />
              ) : (
                <span className="truncate">{row.folder.name}</span>
              )}
              <Badge variant="outline">{t("Folder")}</Badge>
            </span>
          );
        }
        return (
          <span className="inline-flex min-w-0 items-center gap-2">
            <MediaThumb media={row.media} />
            <span className={cn("truncate", row.media.canEdit === false && "text-muted-foreground")}>{row.media.name}</span>
          </span>
        );
      },
    },
    {
      id: "kind",
      header: "Type",
      sortable: true,
      filter: {
        options: [
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
          { value: "document", label: "Document" },
        ],
      },
      cell: (row) =>
        row.kind === "media" ? (
          <span className="text-muted-foreground">
            {t(kindLabels[row.media.kind])} · {mediaTypeLabel(row.media)}
          </span>
        ) : row.kind === "folder" ? (
          <span className="text-muted-foreground">{t("{count} inside", { count: row.folder.childCount ?? 0 })}</span>
        ) : null,
    },
    {
      id: "size",
      header: "Size",
      sortable: true,
      align: "right",
      cell: (row) =>
        row.kind === "media" ? formatFileSize(row.media.size) : row.kind === "upload" ? formatFileSize(row.upload.size) : null,
    },
    {
      id: "dimensions",
      header: "Dimensions",
      cell: (row) =>
        row.kind === "media" && row.media.width && row.media.height ? (
          <span className="text-muted-foreground tabular-nums">
            {row.media.width} × {row.media.height}
          </span>
        ) : null,
    },
    {
      id: "alt",
      header: "Alt text",
      filter: {
        options: [
          { value: "missing", label: "Missing" },
          { value: "present", label: "Added" },
        ],
      },
      cell: (row) => {
        if (row.kind !== "media" || row.media.kind !== "image") return null;
        return row.media.alt?.trim() ? (
          <span className="text-muted-foreground">{row.media.alt}</span>
        ) : (
          <Badge variant="outline">{t("Missing")}</Badge>
        );
      },
    },
    {
      id: "usage",
      header: "Used by",
      cell: (row) =>
        row.kind === "media" && (row.media.usageCount ?? 0) > 0 ? (
          <Badge variant="secondary">
            {row.media.usageCount === 1 ? t("1 use") : t("{count} uses", { count: row.media.usageCount ?? 0 })}
          </Badge>
        ) : null,
    },
    {
      id: "createdAt",
      header: "Added",
      sortable: true,
      cell: (row) =>
        row.kind === "media" ? (
          <span className="text-muted-foreground">
            <RelativeTime value={row.media.createdAt} />
          </span>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        if (row.kind === "upload") {
          return (
            <span data-row-action className="inline-flex justify-end gap-1">
              <IconAction label={row.upload.status === "failed" ? t("Dismiss") : t("Cancel upload")} onClick={() => uploads.dismiss(row.upload.id)}>
                <X />
              </IconAction>
            </span>
          );
        }
        if (row.kind === "folder") {
          return (
            <span data-row-action className="inline-flex justify-end gap-1">
              <IconAction label={t("Rename")} onClick={() => startRename(row.folder)}>
                <Pencil />
              </IconAction>
              <IconAction label={t("Move to…")} onClick={() => setMoveIds([`folder:${row.folder.id}`])}>
                <FolderInput />
              </IconAction>
              <IconAction label={t("Delete")} onClick={() => void removeFolder(row.folder)}>
                <Trash2 />
              </IconAction>
            </span>
          );
        }
        const editable = row.media.canEdit !== false;
        return (
          <span data-row-action className="inline-flex justify-end gap-1">
            <IconAction label={t("Copy URL")} onClick={() => void copyUrl(row.media)}>
              <Copy />
            </IconAction>
            {editable ? (
              <IconAction label={t("Move to…")} onClick={() => setMoveIds([`media:${row.media.id}`])}>
                <FolderInput />
              </IconAction>
            ) : null}
            <IconAction label={t("Open")} onClick={() => window.open(row.media.path, "_blank", "noopener")}>
              <ExternalLink />
            </IconAction>
            {editable ? (
              <IconAction label={t("Delete")} onClick={() => setDeleteMedia(row.media)}>
                <Trash2 />
              </IconAction>
            ) : null}
          </span>
        );
      },
    },
  ];

  function startRename(item: FolderItem) {
    setRenameId(item.id);
    setRenameValue(item.name);
  }

  return (
    <section onDragEnter={onPageDragEnter} onDragLeave={onPageDragLeave} onDragOver={(event) => draggedFiles(event) && event.preventDefault()} onDrop={onPageDrop}>
      <PageHeader
        title={t("Media")}
        lede={t("Drop files anywhere on this page to upload them into the open folder.")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => void createFolder()}>
              <FolderPlus /> {t("Create folder")}
            </Button>
            {selected.length > 0 ? (
              <>
                <Button variant="outline" size="sm" type="button" onClick={() => setMoveIds(selected)}>
                  <FolderInput /> {t("Move to…")}
                </Button>
                <Button variant="destructive" size="sm" type="button" onClick={() => void removeSelected()}>
                  <Trash2 /> {t("Delete")}
                </Button>
              </>
            ) : null}
            <Button size="sm" type="button" onClick={() => fileInput.current?.click()}>
              <Upload /> {t("Upload")}
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={mediaAccept}
              className="sr-only"
              tabIndex={-1}
              aria-label={t("Upload")}
              onChange={pickFiles}
            />
          </div>
        }
      />
      <FolderCrumbs
        className="mb-3"
        rootLabel={t("Media")}
        folder={folder}
        breadcrumb={breadcrumb}
        onOpen={openFolder}
        onDrop={dropPayload}
        onFilesDrop={upload}
      />
      <div className="relative">
        {loading && rows.length === 0 ? (
          <RowSkeleton label="Loading media…" />
        ) : failed ? (
          <EmptyState>{t("Could not load media.")}</EmptyState>
        ) : rows.length === 0 && Object.keys(view.filters).length === 0 ? (
          <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
            <div className="grid justify-items-center gap-3">
              <Upload className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-base text-muted-foreground md:text-sm">{t("Drop images, videos, or PDFs here, or choose files.")}</p>
              <Button size="sm" type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                {t("Choose files")}
              </Button>
            </div>
          </div>
        ) : (
          <DataTable
            storageKey="media"
            mode="controlled"
            view={view}
            onViewChange={(next) => {
              setView(next);
              saveTableView("media", next);
            }}
            columns={columns}
            rows={rows}
            selectable
            selectOnClick
            selectedIds={selected}
            onSelectedIds={setSelected}
            dragSelection
            onRowDrop={(payload, targetId) => {
              if (targetId.startsWith("folder:")) dropPayload(payload, targetId.slice("folder:".length));
            }}
            onFilesDrop={(files, targetId) => {
              if (targetId.startsWith("folder:")) upload(files, targetId.slice("folder:".length));
            }}
            rowMenu={(row) => {
              if (row.kind === "upload") return [];
              if (row.kind === "folder") {
                return [
                  { id: "rename", label: "Rename", onSelect: () => startRename(row.folder) },
                  { id: "move", label: "Move to…", onSelect: () => setMoveIds([`folder:${row.folder.id}`]) },
                  { id: "delete", label: "Delete", destructive: true, onSelect: () => void removeFolder(row.folder) },
                ];
              }
              if (row.media.canEdit === false) return [{ id: "copy", label: "Copy URL", onSelect: () => void copyUrl(row.media) }];
              return [
                { id: "copy", label: "Copy URL", onSelect: () => void copyUrl(row.media) },
                { id: "move", label: "Move to…", onSelect: () => setMoveIds([`media:${row.media.id}`]) },
                { id: "delete", label: "Delete", destructive: true, onSelect: () => setDeleteMedia(row.media) },
              ];
            }}
            getRow={(row) => {
              if (row.kind === "upload") {
                return { id: `upload:${row.upload.id}`, label: row.upload.name, selectable: false, onSelect: () => undefined };
              }
              if (row.kind === "folder") {
                return {
                  id: `folder:${row.folder.id}`,
                  label: row.folder.name,
                  onSelect: () => {
                    if (renameId === row.folder.id) return;
                    openFolder(row.folder.id);
                  },
                  draggable: true,
                  droppable: true,
                  dragPayload: `folder:${row.folder.id}`,
                };
              }
              return {
                id: `media:${row.media.id}`,
                label: row.media.name,
                onSelect: () => openFile(row.media.id),
                draggable: row.media.canEdit !== false,
                dragPayload: `media:${row.media.id}`,
                selectable: row.media.canEdit !== false,
              };
            }}
          />
        )}
        <div
          aria-hidden={!dropActive}
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-start justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 pt-16 transition-opacity",
            dropActive ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm">
            {t("Drop files to upload to {folder}", { folder: currentFolderName })}
          </span>
        </div>
      </div>
      {!loading && media.length < total ? (
        <Button className="mt-4" variant="outline" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? t("Loading…") : t("Load more ({shown} of {total})", { shown: media.length, total })}
        </Button>
      ) : null}
      <FolderMoveDialog
        open={moveIds !== null}
        folders={tree}
        rootLabel={t("Media")}
        onOpenChange={(open) => {
          if (!open) setMoveIds(null);
        }}
        onPick={(parentId) => {
          if (moveIds) void moveItems(moveIds, parentId);
        }}
      />
      <MediaDetailSheet
        mediaId={openFileId}
        initial={activeFile}
        onOpenChange={(open) => {
          if (!open) openFile(null);
        }}
        onSaved={(updated) => {
          setMedia((current) =>
            updated.folderId === folderId
              ? current.map((item) => (item.id === updated.id ? updated : item))
              : current.filter((item) => item.id !== updated.id),
          );
        }}
        onDelete={(item) => setDeleteMedia(item)}
      />
      <ConfirmDialog
        open={deleteMedia !== null}
        title="Delete this file?"
        description="Anything that links to its URL will show a missing file."
        confirmLabel="Delete file"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteMedia(null);
        }}
        onConfirm={() => void removeMedia()}
      />
      {confirmDialog}
    </section>
  );
}