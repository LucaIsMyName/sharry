import { useEffect, useState, type FormEvent } from "react";
import {
  Copy,
  ExternalLink,
  FolderInput,
  FolderPlus,
  LayoutTemplate,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { defaultFolderIcon } from "@sharry/shared";
import {
  ApiError,
  api,
  type LandingPage,
  type LandingPageSummary,
} from "../api.ts";
import { AppIcon } from "../components/app-icon.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import { FolderCrumbs } from "../components/folder-crumbs.tsx";
import { FolderMoveDialog } from "../components/folder-move-dialog.tsx";
import { FolderNameInput } from "../components/folder-name-input.tsx";
import { IconAction } from "../components/icon-action.tsx";
import {
  PageStatusBadge,
  pageStatusOptions,
} from "../components/page-builder/page-status.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { RelativeTime } from "../components/relative-time.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { ConfirmDialog, useConfirm } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
import {
  DataTable,
  loadTableView,
  saveTableView,
  type DataColumn,
  type TableView,
} from "../components/ui/data-table.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { useI18n } from "../i18n/index.tsx";
import { cn } from "cn";

const pageSize = 100;

type FolderItem = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  childCount?: number;
};

type PageRow =
  | { kind: "folder"; folder: FolderItem }
  | { kind: "page"; page: LandingPageSummary };

type Placement = { id: string; parentId: string | null };

export function LandingPagesPage() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || "root";
  const folderId = folder === "root" ? null : folder;
  const [pages, setPages] = useState<LandingPageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<FolderItem[]>([]);
  const [tree, setTree] = useState<FolderItem[]>([]);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<TableView>(() => loadTableView("pages"));
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [deletePage, setDeletePage] = useState<LandingPageSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const status = view.filters.status ?? "";
  const query = view.filters.title?.trim() ?? "";

  function listUrl(offset: number) {
    const sort = view.sort?.column ?? "";
    const dir = view.sort?.direction ?? "";
    const search = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      folder,
    });
    if (status) search.set("status", status);
    if (query) search.set("q", query);
    if (sort) {
      search.set("sort", sort);
      search.set("dir", dir);
    }
    return `/api/pages?${search.toString()}`;
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api<{ pages?: LandingPageSummary[]; total?: number }>(listUrl(0)),
      api<{ folders?: FolderItem[]; breadcrumb?: FolderItem[] }>(
        `/api/folders?kind=page&parent=${encodeURIComponent(folder)}`,
      ),
      api<{ folders?: FolderItem[] }>("/api/folders?kind=page&tree=1"),
    ])
      .then(([list, level, all]) => {
        if (cancelled) return;
        setPages(list.pages ?? []);
        setTotal(list.total ?? 0);
        setFolders(level.folders ?? []);
        setBreadcrumb(level.breadcrumb ?? []);
        setTree(all.folders ?? []);
        setFailed(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailed(true);
        toastCaught(caught, t("Could not load pages"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, reload, view.sort, status, query]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await api<{
        pages?: LandingPageSummary[];
        total?: number;
      }>(listUrl(pages.length));
      setPages((existing) => [...existing, ...(result.pages ?? [])]);
      setTotal(result.total ?? 0);
    } catch (caught) {
      toastCaught(caught, t("Could not load pages"));
    } finally {
      setLoadingMore(false);
    }
  }

  function openFolder(id: string | null) {
    const next = new URLSearchParams(params);
    if (!id) next.delete("folder");
    else next.set("folder", id);
    setSelected([]);
    setParams(next);
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
        body: JSON.stringify({ kind: "page", name, parentId: folderId }),
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
      await api(`/api/folders/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not rename the folder"));
    }
  }

  function placementOf(id: string): Placement | null {
    const [kind, rawId] = id.split(":");
    if (!rawId) return null;
    if (kind === "folder") {
      const found =
        folders.find((item) => item.id === rawId) ??
        tree.find((item) => item.id === rawId);
      return found ? { id, parentId: found.parentId } : null;
    }
    const found = pages.find((item) => item.id === rawId);
    if (!found || !found.canEdit) return null;
    return { id, parentId: found.folderId };
  }

  async function place(items: Placement[]) {
    await Promise.all(
      items.map(({ id, parentId }) => {
        const [kind, rawId] = id.split(":");
        return kind === "folder"
          ? api(`/api/folders/${rawId}`, {
              method: "PATCH",
              body: JSON.stringify({ parentId }),
            })
          : api(`/api/pages/${rawId}`, {
              method: "PATCH",
              body: JSON.stringify({ folderId: parentId }),
            });
      }),
    );
  }

  async function moveItems(ids: string[], target: string | null) {
    const before = ids
      .map(placementOf)
      .filter((item): item is Placement => item !== null)
      .filter(
        (item) => item.parentId !== target && item.id !== `folder:${target}`,
      );
    if (before.length === 0) return;
    try {
      await place(before.map((item) => ({ id: item.id, parentId: target })));
      setSelected([]);
      setMoveIds(null);
      setReload((value) => value + 1);
      toast.success(
        before.length === 1
          ? t("Moved 1 item.")
          : t("Moved {count} items.", { count: before.length }),
        {
          label: t("Undo"),
          onClick: () => {
            void place(before)
              .then(() => setReload((value) => value + 1))
              .catch((caught: unknown) =>
                toastCaught(caught, t("Could not move that")),
              );
          },
        },
      );
    } catch (caught) {
      toastCaught(caught, t("Could not move that"));
      setReload((value) => value + 1);
    }
  }

  function dropPayload(payload: string, target: string | null) {
    void moveItems(payload.split(",").filter(Boolean), target);
  }

  async function removePage() {
    if (!deletePage) return;
    try {
      await api(`/api/pages/${deletePage.id}`, { method: "DELETE" });
      setSelected((current) =>
        current.filter((id) => id !== `page:${deletePage.id}`),
      );
      setDeletePage(null);
      setReload((value) => value + 1);
      toast.success(t("Page deleted."));
    } catch (caught) {
      toastCaught(caught, t("Could not delete the page"));
    }
  }

  async function removeFolder(item: FolderItem) {
    const confirmed = await confirm({
      title: "Delete this folder?",
      description: "Its pages move up one level.",
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
          ? api(`/api/folders/${id.slice("folder:".length)}`, {
              method: "DELETE",
            })
          : api(`/api/pages/${id.slice("page:".length)}`, { method: "DELETE" }),
      ),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure)
      toastCaught(failure.reason, t("Could not delete the selection"));
    setSelected([]);
    setReload((value) => value + 1);
  }

  async function copyUrl(page: LandingPageSummary) {
    try {
      await copyText(page.url);
      toast.success(t("URL copied."));
    } catch (caught) {
      toastCaught(caught, t("Could not copy the URL"));
    }
  }

  function startRename(item: FolderItem) {
    setRenameId(item.id);
    setRenameValue(item.name);
  }

  const filtering = Boolean(status || query);
  const rows: PageRow[] = [
    ...(filtering
      ? []
      : folders.map((item) => ({ kind: "folder" as const, folder: item }))),
    ...pages.map((item) => ({ kind: "page" as const, page: item })),
  ];

  const columns: DataColumn<PageRow>[] = [
    {
      id: "title",
      header: "Title",
      sortable: true,
      filter: "text",
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="inline-flex min-w-0 items-center gap-2 font-medium">
            <AppIcon name={row.folder.icon ?? defaultFolderIcon} />
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
        ) : (
          <span className="inline-flex min-w-0 items-center gap-2">
            <LayoutTemplate
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span
              className={cn(
                "truncate font-medium",
                !row.page.canEdit && "text-muted-foreground",
              )}
            >
              {row.page.title}
            </span>
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      filter: { options: pageStatusOptions },
      cell: (row) =>
        row.kind === "page" ? (
          <PageStatusBadge status={row.page.status} />
        ) : (
          <span className="text-muted-foreground">
            {t("{count} inside", { count: row.folder.childCount ?? 0 })}
          </span>
        ),
    },
    {
      id: "slug",
      header: "Address",
      sortable: true,
      cell: (row) =>
        row.kind === "page" ? (
          <span className="font-mono text-muted-foreground">
            {row.page.url.replace(/^https?:\/\//, "")}
          </span>
        ) : null,
    },
    {
      id: "owner",
      header: "Owner",
      cell: (row) =>
        row.kind === "page" ? (
          <span className="text-muted-foreground">
            {row.page.owner?.username ?? ""}
          </span>
        ) : null,
    },
    {
      id: "updatedAt",
      header: "Updated",
      sortable: true,
      cell: (row) =>
        row.kind === "page" ? (
          <span className="text-muted-foreground">
            <RelativeTime value={row.page.updatedAt} />
          </span>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      cell: (row) => {
        if (row.kind === "folder") {
          return (
            <span data-row-action className="inline-flex justify-end gap-1">
              <IconAction
                label={t("Rename")}
                onClick={() => startRename(row.folder)}
              >
                <Pencil />
              </IconAction>
              <IconAction
                label={t("Move to…")}
                onClick={() => setMoveIds([`folder:${row.folder.id}`])}
              >
                <FolderInput />
              </IconAction>
              <IconAction
                label={t("Delete")}
                onClick={() => void removeFolder(row.folder)}
              >
                <Trash2 />
              </IconAction>
            </span>
          );
        }
        const live =
          row.page.status === "published" || row.page.status === "changed";
        return (
          <span data-row-action className="inline-flex justify-end gap-1">
            <IconAction
              label={t("Copy URL")}
              onClick={() => void copyUrl(row.page)}
            >
              <Copy />
            </IconAction>
            <IconAction
              label={t("View live")}
              disabled={!live}
              onClick={() => window.open(row.page.url, "_blank", "noopener")}
            >
              <ExternalLink />
            </IconAction>
            {row.page.canEdit ? (
              <>
                <IconAction
                  label={t("Move to…")}
                  onClick={() => setMoveIds([`page:${row.page.id}`])}
                >
                  <FolderInput />
                </IconAction>
                <IconAction
                  label={t("Delete")}
                  onClick={() => setDeletePage(row.page)}
                >
                  <Trash2 />
                </IconAction>
              </>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader
        title={t("Pages")}
        lede={t(
          "Build landing pages from blocks. Changes stay private until you publish them.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => void createFolder()}
            >
              <FolderPlus /> {t("Create folder")}
            </Button>
            {selected.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setMoveIds(selected)}
                >
                  <FolderInput /> {t("Move to…")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => void removeSelected()}
                >
                  <Trash2 /> {t("Delete")}
                </Button>
              </>
            ) : null}
            <Button size="sm" type="button" onClick={() => setCreating(true)}>
              <Plus /> {t("New page")}
            </Button>
          </div>
        }
      />
      <FolderCrumbs
        className="mb-3"
        rootLabel={t("Pages")}
        folder={folder}
        breadcrumb={breadcrumb}
        onOpen={openFolder}
        onDrop={dropPayload}
      />
      {loading && rows.length === 0 ? (
        <RowSkeleton label="Loading pages…" />
      ) : failed ? (
        <EmptyState>{t("Could not load pages.")}</EmptyState>
      ) : rows.length === 0 && !filtering ? (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
          <div className="grid justify-items-center gap-3">
            <LayoutTemplate
              className="size-6 text-muted-foreground"
              aria-hidden
            />
            <p className="text-base text-muted-foreground md:text-sm">
              {t("No pages yet. Create one to start building.")}
            </p>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => setCreating(true)}
            >
              {t("New page")}
            </Button>
          </div>
        </div>
      ) : (
        <DataTable
          storageKey="pages"
          mode="controlled"
          view={view}
          onViewChange={(next) => {
            setView(next);
            saveTableView("pages", next);
          }}
          columns={columns}
          rows={rows}
          selectable
          selectOnClick
          selectedIds={selected}
          onSelectedIds={setSelected}
          dragSelection
          onRowDrop={(payload, targetId) => {
            if (targetId.startsWith("folder:"))
              dropPayload(payload, targetId.slice("folder:".length));
          }}
          rowMenu={(row) => {
            if (row.kind === "folder") {
              return [
                {
                  id: "rename",
                  label: "Rename",
                  onSelect: () => startRename(row.folder),
                },
                {
                  id: "move",
                  label: "Move to…",
                  onSelect: () => setMoveIds([`folder:${row.folder.id}`]),
                },
                {
                  id: "delete",
                  label: "Delete",
                  destructive: true,
                  onSelect: () => void removeFolder(row.folder),
                },
              ];
            }
            const copy = {
              id: "copy",
              label: "Copy URL",
              onSelect: () => void copyUrl(row.page),
            };
            if (!row.page.canEdit) return [copy];
            return [
              {
                id: "edit",
                label: "Edit",
                onSelect: () => void navigate(`/pages/${row.page.id}`),
              },
              copy,
              {
                id: "move",
                label: "Move to…",
                onSelect: () => setMoveIds([`page:${row.page.id}`]),
              },
              {
                id: "delete",
                label: "Delete",
                destructive: true,
                onSelect: () => setDeletePage(row.page),
              },
            ];
          }}
          getRow={(row) =>
            row.kind === "folder"
              ? {
                  id: `folder:${row.folder.id}`,
                  label: row.folder.name,
                  onSelect: () => {
                    if (renameId !== row.folder.id) openFolder(row.folder.id);
                  },
                  draggable: true,
                  droppable: true,
                  dragPayload: `folder:${row.folder.id}`,
                }
              : {
                  id: `page:${row.page.id}`,
                  label: row.page.title,
                  to: `/pages/${row.page.id}`,
                  draggable: row.page.canEdit,
                  dragPayload: `page:${row.page.id}`,
                  selectable: row.page.canEdit,
                }
          }
        />
      )}
      {!loading && pages.length < total ? (
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
                shown: pages.length,
                total,
              })}
        </Button>
      ) : null}
      <NewPageDialog
        open={creating}
        folderId={folderId}
        onOpenChange={setCreating}
        onCreated={(page) => void navigate(`/pages/${page.id}`)}
      />
      <FolderMoveDialog
        open={moveIds !== null}
        folders={tree}
        rootLabel={t("Pages")}
        onOpenChange={(open) => {
          if (!open) setMoveIds(null);
        }}
        onPick={(parentId) => {
          if (moveIds) void moveItems(moveIds, parentId);
        }}
      />
      <ConfirmDialog
        open={deletePage !== null}
        title="Delete this page?"
        description="Its address stops working right away. This cannot be undone."
        confirmLabel="Delete page"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeletePage(null);
        }}
        onConfirm={() => void removePage()}
      />
      {confirmDialog}
    </section>
  );
}

export function NewPageDialog({
  open,
  folderId,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  folderId: string | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (page: LandingPage) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setError("");
  }, [open]);

  useEffect(() => {
    if (slugTouched || !title.trim()) return;
    const timer = window.setTimeout(() => {
      void api<{ slug: string | null }>(
        `/api/pages/suggest-slug?title=${encodeURIComponent(title)}`,
      )
        .then((result) => {
          if (!slugTouched) setSlug(result.slug ?? "");
        })
        .catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [title, slugTouched]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api<LandingPage>("/api/pages", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim() || undefined,
          folderId,
        }),
      });
      onOpenChange(false);
      onCreated(created);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "slug_taken")
        setError(caught.message);
      else toastCaught(caught, t("Could not create the page"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {t("New page")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "The page starts hidden, so you can build it before anyone sees it.",
              )}
            </DialogDescription>
          </DialogHeader>
          <Field label="Title">
            <Input
              value={title}
              maxLength={200}
              required
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Slug" error={error ? t(error) : undefined}>
            <Input
              value={slug}
              maxLength={64}
              placeholder={t("Leave blank for a random slug")}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
                setError("");
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {t("Create page")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
