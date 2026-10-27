import { useEffect, useRef, useState } from "react";
import { ExternalLink, FolderInput, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { defaultFolderIcon, defaultLinkIcon } from "@sharry/shared";
import { api, type LinkSummary } from "../api.ts";
import { AppIcon } from "../components/app-icon.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { BulkLinksDialog } from "../components/bulk-links.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { TagBadge } from "../components/tag-field.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { DataTable, loadTableView, saveTableView, type DataColumn, type TableView } from "../components/ui/data-table.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { t, useI18n } from "../i18n/index.tsx";
import { cn } from "cn";

const pageSize = 50;

type FolderItem = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  childCount?: number;
};

type OverviewRow =
  | { kind: "folder"; folder: FolderItem }
  | { kind: "link"; link: LinkSummary };

function AccessBadge({ canEdit }: { canEdit?: boolean }) {
  return (
    <Badge variant={canEdit === false ? "outline" : "secondary"}>
      {canEdit === false ? t("View only") : t("Editable")}
    </Badge>
  );
}

export function LinkOverview() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || "root";
  const [links, setLinks] = useState<LinkSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<FolderItem[]>([]);
  const [tree, setTree] = useState<FolderItem[]>([]);
  const [reload, setReload] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moveFor, setMoveFor] = useState<OverviewRow | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<TableView>(() => loadTableView("links"));
  const aiAvailable = useAiAvailable();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const status = view.filters.status ?? "";
    const tag = view.filters.tags ?? "";
    const sort = view.sort?.column ?? "";
    const dir = view.sort?.direction ?? "";
    const list = `/api/links?limit=${pageSize}&offset=0&folder=${encodeURIComponent(folder)}${
      status ? `&status=${encodeURIComponent(status)}` : ""
    }${tag ? `&tag=${encodeURIComponent(tag)}` : ""}${sort ? `&sort=${encodeURIComponent(sort)}&dir=${encodeURIComponent(dir)}` : ""}`;
    void Promise.all([
      api<{ links?: LinkSummary[]; total?: number }>(list),
      api<{ folders?: FolderItem[]; breadcrumb?: FolderItem[] }>(
        `/api/folders?kind=link&parent=${encodeURIComponent(folder)}`,
      ),
      api<{ folders?: FolderItem[] }>("/api/folders?kind=link&tree=1"),
    ])
      .then(([listResult, level, all]) => {
        if (cancelled) return;
        setLinks(listResult.links ?? []);
        setTotal(listResult.total ?? listResult.links?.length ?? 0);
        setFolders(level.folders ?? []);
        setBreadcrumb(level.breadcrumb ?? []);
        setTree(all.folders ?? []);
        setFailed(false);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailed(true);
        toastCaught(caught, t("Could not load links"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folder, reload, view.sort, view.filters.status, view.filters.tags]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await api<{ links?: LinkSummary[]; total?: number }>(
        `/api/links?limit=${pageSize}&offset=${links.length}&folder=${encodeURIComponent(folder)}`,
      );
      setLinks((existing) => [...existing, ...(result.links ?? [])]);
      setTotal(result.total ?? 0);
    } catch (caught) {
      toastCaught(caught, t("Could not load links"));
    } finally {
      setLoadingMore(false);
    }
  }

  function openFolder(id: string | null) {
    const next = new URLSearchParams(params);
    if (!id) next.delete("folder");
    else next.set("folder", id);
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
        body: JSON.stringify({ kind: "link", name, parentId: folder === "root" ? null : folder }),
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

  async function move(row: OverviewRow, parentId: string | null) {
    try {
      if (row.kind === "folder") {
        await api(`/api/folders/${row.folder.id}`, {
          method: "PATCH",
          body: JSON.stringify({ parentId }),
        });
      } else {
        await api(`/api/links/${row.link.id}`, {
          method: "PATCH",
          body: JSON.stringify({ folderId: parentId }),
        });
      }
      setMoveFor(null);
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not move that"));
    }
  }

  async function onDrop(payload: string, targetId: string) {
    const target = targetId.startsWith("folder:") ? targetId.slice("folder:".length) : null;
    if (!target) return;
    const [kind, id] = payload.split(":");
    if (!id || id === target) return;
    if (kind === "folder") await move({ kind: "folder", folder: { id, name: "", icon: null, parentId: null } }, target);
    if (kind === "link") {
      const link = links.find((item) => item.id === id);
      if (!link || link.canEdit === false) return;
      await move({ kind: "link", link }, target);
    }
  }

  function startRename(item: FolderItem) {
    setRenameId(item.id);
    setRenameValue(item.name);
  }

  async function removeLink(link: LinkSummary) {
    if (!window.confirm(t("Delete this link?"))) return;
    try {
      await api(`/api/links/${link.id}`, { method: "DELETE" });
      setSelected((current) => current.filter((id) => id !== `link:${link.id}`));
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not delete the link"));
    }
  }

  async function removeSelected() {
    if (selected.length === 0) return;
    if (!window.confirm(t("Delete the selected rows? Folders move their contents up one level."))) return;
    try {
      await Promise.all(
        selected.map((id) =>
          id.startsWith("folder:")
            ? api(`/api/folders/${id.slice("folder:".length)}`, { method: "DELETE" })
            : api(`/api/links/${id.slice("link:".length)}`, { method: "DELETE" }),
        ),
      );
      setSelected([]);
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not delete the selection"));
      setReload((value) => value + 1);
    }
  }

  async function removeFolder(item: FolderItem) {
    if (!window.confirm(t("Delete this folder? Its links move up one level."))) return;
    try {
      await api(`/api/folders/${item.id}`, { method: "DELETE" });
      setReload((value) => value + 1);
    } catch (caught) {
      toastCaught(caught, t("Could not delete the folder"));
    }
  }

  const showAccess = links.some((link) => link.canEdit === false);
  const rows: OverviewRow[] = [
    ...folders.map((folderItem) => ({ kind: "folder" as const, folder: folderItem })),
    ...links.map((link) => ({ kind: "link" as const, link })),
  ];
  const filtered = rows.filter((row) => {
    const title = view.filters.title?.toLowerCase() ?? "";
    const destination = view.filters.destination?.toLowerCase() ?? "";
    if (row.kind === "folder") {
      if (destination) return false;
      return !title || row.folder.name.toLowerCase().includes(title);
    }
    const name = (row.link.title?.trim() || row.link.slug).toLowerCase();
    if (title && !name.includes(title) && !row.link.slug.toLowerCase().includes(title)) return false;
    if (destination && !row.link.destinationUrl.toLowerCase().includes(destination)) return false;
    return true;
  });

  const columns: DataColumn<OverviewRow>[] = [
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
            <AppIcon name={row.link.icon ?? defaultLinkIcon} />
            <span className={cn("truncate", row.link.canEdit === false && "text-muted-foreground")}>
              {row.link.title?.trim() || row.link.slug}
            </span>
          </span>
        ),
    },
    {
      id: "shortUrl",
      header: "Short URL",
      cell: (row) =>
        row.kind === "link" ? (
          <span className="font-mono text-muted-foreground" title={row.link.shortUrl}>
            {row.link.shortUrl}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("{count} inside", { count: row.folder.childCount ?? 0 })}</span>
        ),
    },
    {
      id: "destination",
      header: "Destination",
      filter: "text",
      cell: (row) => (row.kind === "link" ? <span className="text-muted-foreground">{row.link.destinationUrl}</span> : null),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      filter: {
        options: [
          { value: "active", label: "Active" },
          { value: "disabled", label: "Paused" },
        ],
      },
      cell: (row) =>
        row.kind === "link" ? (
          <Badge variant={row.link.status === "active" ? "secondary" : "outline"}>
            {row.link.status === "active" ? t("Active") : t("Paused")}
          </Badge>
        ) : null,
    },
    ...(showAccess
      ? [
          {
            id: "access",
            header: "Access",
            cell: (row: OverviewRow) => (row.kind === "link" ? <AccessBadge canEdit={row.link.canEdit} /> : null),
          } satisfies DataColumn<OverviewRow>,
        ]
      : []),
    {
      id: "clicks",
      header: "Clicks",
      sortable: true,
      align: "right",
      cell: (row) => (row.kind === "link" ? row.link.clicks : null),
    },
    {
      id: "tags",
      header: "Tags",
      filter: "text",
      cell: (row) =>
        row.kind === "link"
          ? (row.link.tags ?? []).map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} />
            ))
          : null,
    },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        row.kind === "folder" ? (
          <span data-row-action className="inline-flex justify-end gap-1">
            <IconAction label={t("Rename")} onClick={() => startRename(row.folder)}>
              <Pencil />
            </IconAction>
            <IconAction label={t("Move to…")} onClick={() => setMoveFor(row)}>
              <FolderInput />
            </IconAction>
            <IconAction label={t("Delete")} onClick={() => void removeFolder(row.folder)}>
              <Trash2 />
            </IconAction>
          </span>
        ) : (
          <span data-row-action className="inline-flex justify-end gap-1">
            {row.link.canEdit === false ? null : (
              <IconAction label={t("Move to…")} onClick={() => setMoveFor(row)}>
                <FolderInput />
              </IconAction>
            )}
            <IconAction label={t("Open")} onClick={() => window.open(row.link.shortUrl, "_blank", "noopener")}>
              <ExternalLink />
            </IconAction>
            {row.link.canEdit === false ? null : (
              <IconAction label={t("Delete")} onClick={() => void removeLink(row.link)}>
                <Trash2 />
              </IconAction>
            )}
          </span>
        ),
    },
  ];

  return (
    <section>
      <PageHeader
        title={t("Links")}
        lede={t("The slug stays put when you edit where it goes.")}
        action={
          <div className="flex flex-wrap gap-2">
            {aiAvailable ? (
              <Button variant="outline" size="sm" type="button" onClick={() => setBulkOpen(true)}>
                {t("Add several")}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" type="button" onClick={() => void createFolder()}>
              <FolderPlus /> {t("Create folder")}
            </Button>
            {selected.length > 0 ? (
              <Button variant="destructive" size="sm" type="button" onClick={() => void removeSelected()}>
                <Trash2 /> {t("Delete")}
              </Button>
            ) : null}
            <Link className={buttonVariants({ size: "sm" })} to="/links/new">
              <Plus /> {t("New link")}
            </Link>
          </div>
        }
      />
      {aiAvailable ? (
        <BulkLinksDialog open={bulkOpen} onOpenChange={setBulkOpen} onCreated={() => setReload((value) => value + 1)} />
      ) : null}
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label={t("Folder")}>
        <Crumb label={t("Links")} active={folder === "root"} onOpen={() => openFolder(null)} onDrop={(payload) => void dropOn(payload, null)} />
        {breadcrumb.map((item, index) => (
          <span key={item.id} className="inline-flex items-center gap-1">
            <span className="text-muted-foreground">/</span>
            <Crumb
              label={item.name}
              active={index === breadcrumb.length - 1}
              onOpen={() => openFolder(item.id)}
              onDrop={(payload) => void dropOn(payload, item.id)}
            />
          </span>
        ))}
      </nav>
      {loading ? (
        <RowSkeleton label="Loading links…" />
      ) : failed ? (
        <EmptyState>{t("Could not load links.")}</EmptyState>
      ) : filtered.length === 0 && Object.keys(view.filters).length === 0 ? (
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
        <DataTable
          storageKey="links"
          mode="controlled"
          view={view}
          onViewChange={(next) => {
            setView(next);
            saveTableView("links", next);
          }}
          columns={columns}
          rows={filtered}
          selectable
          selectedIds={selected}
          onSelectedIds={setSelected}
          onRowDrop={(payload, targetId) => void onDrop(payload, targetId)}
          rowMenu={(row) =>
            row.kind === "link" && row.link.canEdit === false
              ? []
              : [
                  { id: "move", label: "Move to…", onSelect: () => setMoveFor(row) },
                  {
                    id: "delete",
                    label: "Delete",
                    destructive: true,
                    onSelect: () => void (row.kind === "folder" ? removeFolder(row.folder) : removeLink(row.link)),
                  },
                ]
          }
          getRow={(row) =>
            row.kind === "folder"
              ? {
                  id: `folder:${row.folder.id}`,
                  label: row.folder.name,
                  onSelect: () => {
                    if (renameId === row.folder.id) return;
                    openFolder(row.folder.id);
                  },
                  draggable: true,
                  droppable: true,
                  dragPayload: `folder:${row.folder.id}`,
                }
              : {
                  id: `link:${row.link.id}`,
                  label: row.link.title?.trim() || row.link.slug,
                  to: `/links/${row.link.id}`,
                  draggable: row.link.canEdit !== false,
                  dragPayload: `link:${row.link.id}`,
                  selectable: row.link.canEdit !== false,
                }
          }
        />
      )}
      {!loading && links.length < total ? (
        <Button className="mt-4" variant="outline" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? t("Loading…") : t("Load more ({shown} of {total})", { shown: links.length, total })}
        </Button>
      ) : null}
      {moveFor ? (
        <div className="mt-3 grid max-w-sm gap-1 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t("Move to…")}</p>
          <FolderMoveList folders={tree} rootLabel={t("Links")} onPick={(parentId) => void move(moveFor, parentId)} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setMoveFor(null)}>
            {t("Cancel")}
          </Button>
        </div>
      ) : null}
    </section>
  );

  async function dropOn(payload: string, parentId: string | null) {
    const [kind, id] = payload.split(":");
    if (!id) return;
    if (kind === "folder") await move({ kind: "folder", folder: { id, name: "", icon: null, parentId: null } }, parentId);
    if (kind === "link") {
      const link = links.find((item) => item.id === id);
      if (!link || link.canEdit === false) return;
      await move({ kind: "link", link }, parentId);
    }
  }
}

function Crumb({
  label,
  active,
  onOpen,
  onDrop,
}: {
  label: string;
  active: boolean;
  onOpen: () => void;
  onDrop: (payload: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn("rounded px-1.5 py-0.5", active ? "font-medium" : "text-muted-foreground hover:text-foreground")}
      onClick={onOpen}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const payload = event.dataTransfer.getData("text/plain");
        if (payload) onDrop(payload);
      }}
    >
      {label}
    </button>
  );
}

function FolderNameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const skip = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);
  return (
    <input
      ref={ref}
      aria-label={t("Folder name")}
      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (skip.current) return;
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          skip.current = true;
          onCancel();
        }
      }}
    />
  );
}

function FolderMoveList({
  folders,
  rootLabel,
  onPick,
}: {
  folders: FolderItem[];
  rootLabel: string;
  onPick: (id: string | null) => void;
}) {
  const byParent = new Map<string | null, FolderItem[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  }
  const rows: { item: FolderItem; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const item of byParent.get(parentId) ?? []) {
      rows.push({ item, depth });
      walk(item.id, depth + 1);
    }
  }
  walk(null, 1);
  return (
    <>
      <button type="button" className="flex items-center gap-2 text-left text-sm hover:underline" onClick={() => onPick(null)}>
        <AppIcon name={defaultFolderIcon} />
        {rootLabel}
      </button>
      {rows.map(({ item, depth }) => (
        <button
          key={item.id}
          type="button"
          className="flex items-center gap-2 text-left text-sm hover:underline"
          style={{ paddingInlineStart: depth * 14 }}
          onClick={() => onPick(item.id)}
        >
          <AppIcon name={item.icon ?? defaultFolderIcon} />
          {item.name}
        </button>
      ))}
    </>
  );
}
