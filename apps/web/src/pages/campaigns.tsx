import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, Copy, ExternalLink, FolderInput, FolderPlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { defaultCampaignIcon, defaultFolderIcon, type UtmParams } from "@sharry/shared";
import { api, type ShortLink } from "../api.ts";
import { AppIcon } from "../components/app-icon.tsx";
import { FolderMoveDialog } from "../components/folder-move-dialog.tsx";
import { IconPicker } from "../components/icon-picker.tsx";
import { TagBadge, TagField, type EditorTag } from "../components/tag-field.tsx";
import { EmptyState } from "../components/empty-state.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { PageTitle } from "../components/page-title.tsx";
import { DetailSkeleton, RowSkeleton } from "../components/ui/skeleton.tsx";
import { useAiAvailable } from "../components/use-ai.ts";
import { UtmFields, utmSummary } from "../components/utm-fields.tsx";
import { VariantDrafts } from "../components/variant-drafts.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { DataTable, loadTableView, saveTableView, type DataColumn, type TableView } from "../components/ui/data-table.tsx";
import { Section } from "../components/ui/section.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { t, useI18n } from "../i18n/index.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

type FolderItem = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  childCount?: number;
};

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  variantCount: number;
  folderId?: string | null;
  icon?: string | null;
  tags?: EditorTag[];
  folderPath?: { id: string; name: string }[];
};

type CampaignRow = { kind: "folder"; folder: FolderItem } | { kind: "campaign"; campaign: Campaign };
type Variant = { id: string; name: string; linkId: string; utm: UtmParams };

const emptyUtm: UtmParams = {};

export function CampaignsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const folder = params.get("folder") || "root";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<FolderItem[]>([]);
  const [tree, setTree] = useState<FolderItem[]>([]);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [moveFor, setMoveFor] = useState<CampaignRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  async function load() {
    const [result, level, all] = await Promise.all([
      api<{ campaigns: Campaign[] }>("/api/campaigns"),
      api<{ folders?: FolderItem[]; breadcrumb?: FolderItem[] }>(
        `/api/folders?kind=campaign&parent=${encodeURIComponent(folder)}`,
      ),
      api<{ folders?: FolderItem[] }>("/api/folders?kind=campaign&tree=1"),
    ]);
    setCampaigns(result.campaigns);
    setFolders(level.folders ?? []);
    setBreadcrumb(level.breadcrumb ?? []);
    setTree(all.folders ?? []);
  }

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((caught: unknown) =>
        toastCaught(caught, t("Could not load campaigns")),
      )
      .finally(() => setLoading(false));
  }, [folder]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          folderId: folder === "root" ? null : folder,
        }),
      });
      setName("");
      setDescription("");
      setCreating(false);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not create the campaign"));
    } finally {
      setPending(false);
    }
  }

  const levelCampaigns = campaigns.filter(
    (campaign) => (campaign.folderId ?? null) === (folder === "root" ? null : folder),
  );
  const visibleRows: CampaignRow[] = [
    ...folders.map((item) => ({ kind: "folder" as const, folder: item })),
    ...levelCampaigns.map((campaign) => ({ kind: "campaign" as const, campaign })),
  ];

  return (
    <section className="grid gap-4">
      <PageHeader
        title={t("Campaigns")}
        lede={t(
          "A campaign groups tracked copies of your short links. Each variant keeps the same slug and adds its own UTM values. Share it with ?v= or attach it to a QR code.",
        )}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" type="button" onClick={() => void createFolder()}>
              <FolderPlus /> {t("Create folder")}
            </Button>
            {selected.length > 0 ? (
              <Button variant="destructive" size="sm" type="button" onClick={() => void removeSelected()}>
                <Trash2 /> {t("Delete")}
              </Button>
            ) : null}
            {!loading && campaigns.length > 0 ? (
              <Button type="button" size="sm" variant={creating ? "outline" : "default"} onClick={() => setCreating((open) => !open)}>
                {creating ? t("Cancel") : (
                  <>
                    <Plus /> {t("New campaign")}
                  </>
                )}
              </Button>
            ) : null}
          </div>
        }
      />
      {!loading && (campaigns.length === 0 || creating) ? (
      <Section title={t("New campaign")}>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              <Plus /> {pending ? t("Creating…") : t("Create campaign")}
            </Button>
          </form>
      </Section>
      ) : null}
      <CampaignFolderBar
        folder={folder}
        breadcrumb={breadcrumb}
        onOpen={openFolder}
        onDrop={(payload, parentId) => void dropCampaign(payload, parentId)}
      />
      {loading ? (
        <RowSkeleton label="Loading campaigns…" />
      ) : visibleRows.length === 0 ? (
        <EmptyState>{t("No campaigns yet. Create one in the form above.")}</EmptyState>
      ) : (
        <CampaignTable
          rows={visibleRows}
          renameId={renameId}
          renameValue={renameValue}
          onRenameValue={setRenameValue}
          onStartRename={(item) => {
            setRenameId(item.id);
            setRenameValue(item.name);
          }}
          onCommitRename={(item) => void commitRename(item)}
          onCancelRename={() => setRenameId(null)}
          selected={selected}
          onSelected={setSelected}
          onOpenFolder={(id) => {
            if (renameId === id) return;
            openFolder(id);
          }}
          onMove={setMoveFor}
          onDelete={(item) => void removeFolder(item)}
          onDeleteCampaign={(campaign) => void removeCampaignRow(campaign)}
          onDrop={(payload, targetId) => void dropCampaign(payload, targetId.startsWith("folder:") ? targetId.slice(7) : null)}
        />
      )}
      <FolderMoveDialog
        open={moveFor !== null}
        folders={tree}
        rootLabel={t("Campaigns")}
        onOpenChange={(open) => {
          if (!open) setMoveFor(null);
        }}
        onPick={(parentId) => {
          if (moveFor) void moveRow(moveFor, parentId);
        }}
      />
    </section>
  );

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
        body: JSON.stringify({ kind: "campaign", name, parentId: folder === "root" ? null : folder }),
      });
      setRenameId(created.id);
      setRenameValue(name);
      await load();
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
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not rename the folder"));
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
            : api(`/api/campaigns/${id.slice("campaign:".length)}`, { method: "DELETE" }),
        ),
      );
      setSelected([]);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the selection"));
      await load();
    }
  }

  async function removeCampaignRow(campaign: Campaign) {
    if (!window.confirm(t("Delete this campaign?"))) return;
    try {
      await api(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
      setSelected((current) => current.filter((id) => id !== `campaign:${campaign.id}`));
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the campaign"));
    }
  }

  async function removeFolder(item: FolderItem) {
    if (!window.confirm(t("Delete this folder? Its campaigns move up one level."))) return;
    try {
      await api(`/api/folders/${item.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the folder"));
    }
  }

  async function moveRow(row: CampaignRow, parentId: string | null) {
    try {
      if (row.kind === "folder") {
        await api(`/api/folders/${row.folder.id}`, { method: "PATCH", body: JSON.stringify({ parentId }) });
      } else {
        await api(`/api/campaigns/${row.campaign.id}`, { method: "PATCH", body: JSON.stringify({ folderId: parentId }) });
      }
      setMoveFor(null);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not move that"));
    }
  }

  async function dropCampaign(payload: string, parentId: string | null) {
    const [kind, id] = payload.split(":");
    if (!id || id === parentId) return;
    if (kind === "folder") await moveRow({ kind: "folder", folder: { id, name: "", icon: null, parentId: null } }, parentId);
    if (kind === "campaign") {
      const campaign = campaigns.find((item) => item.id === id);
      if (campaign) await moveRow({ kind: "campaign", campaign }, parentId);
    }
  }

}

function CampaignFolderBar({
  folder,
  breadcrumb,
  onOpen,
  onDrop,
}: {
  folder: string;
  breadcrumb: FolderItem[];
  onOpen: (id: string | null) => void;
  onDrop: (payload: string, parentId: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t("Folder")}>
      <Crumb label={t("Campaigns")} active={folder === "root"} onOpen={() => onOpen(null)} onDrop={(payload) => onDrop(payload, null)} />
      {breadcrumb.map((item, index) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">/</span>
          <Crumb
            label={item.name}
            active={index === breadcrumb.length - 1}
            onOpen={() => onOpen(item.id)}
            onDrop={(payload) => onDrop(payload, item.id)}
          />
        </span>
      ))}
    </nav>
  );
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
      className={active ? "rounded px-1.5 py-0.5 font-medium" : "rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground"}
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

function CampaignTable({
  rows,
  renameId,
  renameValue,
  onRenameValue,
  onStartRename,
  onCommitRename,
  onCancelRename,
  selected,
  onSelected,
  onOpenFolder,
  onMove,
  onDelete,
  onDeleteCampaign,
  onDrop,
}: {
  rows: CampaignRow[];
  renameId: string | null;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: (folder: FolderItem) => void;
  onCommitRename: (folder: FolderItem) => void;
  onCancelRename: () => void;
  selected: string[];
  onSelected: (ids: string[]) => void;
  onOpenFolder: (id: string) => void;
  onMove: (row: CampaignRow) => void;
  onDelete: (folder: FolderItem) => void;
  onDeleteCampaign: (campaign: Campaign) => void;
  onDrop: (payload: string, targetId: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState<TableView>(() => loadTableView("campaigns"));
  const columns: DataColumn<CampaignRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      filter: "text",
      sortValue: (row) => (row.kind === "folder" ? row.folder.name : row.campaign.name),
      filterValue: (row) => (row.kind === "folder" ? row.folder.name : row.campaign.name),
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="inline-flex min-w-0 items-center gap-2 font-medium">
            <AppIcon name={row.folder.icon ?? defaultFolderIcon} />
            {renameId === row.folder.id ? (
              <FolderNameInput
                value={renameValue}
                onChange={onRenameValue}
                onCommit={() => onCommitRename(row.folder)}
                onCancel={onCancelRename}
              />
            ) : (
              <span className="truncate">{row.folder.name}</span>
            )}
            <Badge variant="outline">{t("Folder")}</Badge>
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-2">
            <AppIcon name={row.campaign.icon ?? defaultCampaignIcon} />
            <span className="truncate">{row.campaign.name}</span>
          </span>
        ),
    },
    {
      id: "description",
      header: "Description",
      filter: "text",
      filterValue: (row) => (row.kind === "campaign" ? (row.campaign.description ?? "") : ""),
      cell: (row) =>
        row.kind === "folder" ? (
          <span className="text-muted-foreground">{t("{count} inside", { count: row.folder.childCount ?? 0 })}</span>
        ) : (
          <span className="text-muted-foreground">{row.campaign.description}</span>
        ),
    },
    {
      id: "variants",
      header: "Variants",
      sortable: true,
      align: "right",
      sortValue: (row) => (row.kind === "campaign" ? row.campaign.variantCount : 0),
      cell: (row) => (row.kind === "campaign" ? variantLabel(row.campaign.variantCount) : null),
    },
    {
      id: "tags",
      header: "Tags",
      filter: "text",
      filterValue: (row) => (row.kind === "campaign" ? (row.campaign.tags ?? []).map((tag) => tag.name).join(" ") : ""),
      cell: (row) =>
        row.kind === "campaign"
          ? (row.campaign.tags ?? []).map((tag) => (
              <TagBadge key={tag.id ?? tag.name} name={tag.name} color={tag.color} />
            ))
          : null,
    },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        row.kind === "folder" ? (
          <span data-row-action className="inline-flex justify-end gap-1">
            <IconAction label={t("Rename")} onClick={() => onStartRename(row.folder)}>
              <Pencil />
            </IconAction>
            <IconAction label={t("Move to…")} onClick={() => onMove(row)}>
              <FolderInput />
            </IconAction>
            <IconAction label={t("Delete")} onClick={() => onDelete(row.folder)}>
              <Trash2 />
            </IconAction>
          </span>
        ) : (
          <span data-row-action className="inline-flex justify-end gap-1">
            <IconAction label={t("Move to…")} onClick={() => onMove(row)}>
              <FolderInput />
            </IconAction>
            <IconAction label={t("Open")} onClick={() => navigate(`/campaigns/${row.campaign.id}`)}>
              <ExternalLink />
            </IconAction>
            <IconAction label={t("Delete")} onClick={() => onDeleteCampaign(row.campaign)}>
              <Trash2 />
            </IconAction>
          </span>
        ),
    },
  ];
  const ordered = useMemo(() => {
    const wanted = view.filters;
    const matches = (row: CampaignRow) =>
      columns.every((column) => {
        const filter = wanted[column.id];
        if (!filter || !column.filterValue) return true;
        return column.filterValue(row).toLowerCase().includes(filter.toLowerCase());
      });
    const sort = view.sort;
    const column = columns.find((item) => item.id === sort?.column);
    const byColumn = (left: CampaignRow, right: CampaignRow) => {
      if (!sort || !column?.sortValue) return 0;
      const direction = sort.direction === "asc" ? 1 : -1;
      const a = column.sortValue(left) ?? "";
      const b = column.sortValue(right) ?? "";
      if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
      return String(a).localeCompare(String(b)) * direction;
    };
    return [
      ...rows.filter((row) => row.kind === "folder" && matches(row)).sort(byColumn),
      ...rows.filter((row) => row.kind === "campaign" && matches(row)).sort(byColumn),
    ];
  }, [columns, rows, view]);
  return (
    <DataTable
      storageKey="campaigns"
      mode="controlled"
      view={view}
      onViewChange={(next) => {
        setView(next);
        saveTableView("campaigns", next);
      }}
      columns={columns}
      rows={ordered}
      empty={t("No rows match")}
      selectable
      selectedIds={selected}
      onSelectedIds={onSelected}
      onRowDrop={onDrop}
      rowMenu={(row) => [
        { id: "move", label: "Move to…", onSelect: () => onMove(row) },
        {
          id: "delete",
          label: "Delete",
          destructive: true,
          onSelect: () => (row.kind === "folder" ? onDelete(row.folder) : onDeleteCampaign(row.campaign)),
        },
      ]}
      getRow={(row) =>
        row.kind === "folder"
          ? {
              id: `folder:${row.folder.id}`,
              label: row.folder.name,
              onSelect: () => onOpenFolder(row.folder.id),
              draggable: true,
              droppable: true,
              dragPayload: `folder:${row.folder.id}`,
            }
          : {
              id: `campaign:${row.campaign.id}`,
              label: row.campaign.name,
              to: `/campaigns/${row.campaign.id}`,
              draggable: true,
              dragPayload: `campaign:${row.campaign.id}`,
            }
      }
    />
  );
}

export function CampaignDetailPage() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<
    (Campaign & { variants: Variant[] }) | null
  >(null);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [tags, setTags] = useState<EditorTag[]>([]);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const [name, setName] = useState("");
  const [linkId, setLinkId] = useState("");
  const [utm, setUtm] = useState<UtmParams>(emptyUtm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<Variant | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkTotal, setLinkTotal] = useState(0);
  const [knownLinks, setKnownLinks] = useState<ShortLink[]>([]);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const campaignLoad = useRef(0);
  const linkLoad = useRef(0);
  const aiAvailable = useAiAvailable();

  function rememberLinks(rows: ShortLink[]) {
    setKnownLinks((current) => {
      const byId = new Map(current.map((link) => [link.id, link]));
      for (const link of rows) byId.set(link.id, link);
      return [...byId.values()];
    });
  }

  async function loadCampaign() {
    const current = ++campaignLoad.current;
    const next = await api<Campaign & { variants: Variant[] }>(
      `/api/campaigns/${id}`,
    );
    if (current !== campaignLoad.current) return;
    const missing = (
      await Promise.all(
        next.variants.map(async (variant) => {
          try {
            return await api<ShortLink>(`/api/links/${variant.linkId}`);
          } catch {
            return null;
          }
        }),
      )
    ).filter((link): link is ShortLink => link !== null);
    if (current !== campaignLoad.current) return;
    setCampaign(next);
    setCampaignName(next.name);
    setCampaignDescription(next.description ?? "");
    setIcon(next.icon ?? null);
    setTags(next.tags ?? []);
    rememberLinks(missing);
    setLoading(false);
  }

  async function loadPicker(query: string) {
    const current = ++linkLoad.current;
    const linkData = await api<{ links: ShortLink[]; total: number }>(
      `/api/links?limit=100&q=${encodeURIComponent(query)}`,
    );
    if (current !== linkLoad.current) return;
    setLinks(linkData.links);
    setLinkTotal(linkData.total);
    rememberLinks(linkData.links);
    setLinkId((selected) => selected || linkData.links[0]?.id || "");
  }

  useEffect(() => {
    setCampaign(null);
    setLinks([]);
    setKnownLinks([]);
    setCampaignName("");
    setCampaignDescription("");
    setLinkQuery("");
    setLoading(true);
    void loadCampaign().catch((caught: unknown) => {
      toastCaught(caught, t("Could not load"));
      setLoading(false);
    });
    void loadPicker("").catch((caught: unknown) =>
      toastCaught(caught, t("Could not load links")),
    );
  }, [id]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadPicker(linkQuery).catch((caught: unknown) =>
        toastCaught(caught, t("Could not load links")),
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [linkQuery]);

  function resetVariantForm() {
    setEditingId(null);
    setName("");
    setUtm(emptyUtm);
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault();
    setSavingCampaign(true);
    try {
      await api(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: campaignName,
          description: campaignDescription,
          icon,
          tags: tagsRef.current.map((tag) => ({ name: tag.name, color: tag.color })),
        }),
      });
      await loadCampaign();
    } catch (caught) {
      toastCaught(caught, t("Could not save the campaign"));
    } finally {
      setSavingCampaign(false);
    }
  }

  async function removeCampaign() {
    try {
      await api(`/api/campaigns/${id}`, { method: "DELETE" });
      setConfirmDelete(false);
      await navigate("/campaigns");
    } catch (caught) {
      toastCaught(caught, t("Could not delete the campaign"));
    }
  }

  async function submitVariant(event: FormEvent) {
    event.preventDefault();
    setSavingVariant(true);
    try {
      if (editingId) {
        await api(`/api/variants/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ name, utm }),
        });
      } else {
        await api(`/api/campaigns/${id}/variants`, {
          method: "POST",
          body: JSON.stringify({ name, linkId, utm }),
        });
      }
      resetVariantForm();
      await loadCampaign();
    } catch (caught) {
      toastCaught(caught, t("Could not save the variant"));
    } finally {
      setSavingVariant(false);
    }
  }

  function editVariant(variant: Variant) {
    setEditingId(variant.id);
    setName(variant.name);
    setLinkId(variant.linkId);
    setUtm(variant.utm);
  }

  async function removeVariant() {
    if (!variantToDelete) return;
    try {
      await api(`/api/variants/${variantToDelete.id}`, { method: "DELETE" });
      if (editingId === variantToDelete.id) resetVariantForm();
      setVariantToDelete(null);
      await loadCampaign();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the variant"));
    }
  }

  async function copyVariant(variant: Variant) {
    const link = knownLinks.find((item) => item.id === variant.linkId);
    if (!link) return;
    try {
      await copyText(variantUrl(link.shortUrl, variant.id));
      setCopiedId(variant.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === variant.id ? "" : current)),
        2000,
      );
    } catch (caught) {
      toastCaught(caught, t("Could not copy the variant URL"));
    }
  }

  return (
    <section className="grid gap-4">
      <PageTitle
        title={campaign?.name ?? "Campaign"}
        literal={Boolean(campaign?.name)}
      />
      <div className="grid gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconPicker large value={icon} fallback={defaultCampaignIcon} onChange={setIcon} />
          <input
            aria-label={t("Name")}
            className="w-full min-w-0 bg-transparent font-heading text-3xl font-medium tracking-tight outline-none placeholder:text-muted-foreground"
            value={campaignName}
            placeholder={t("Campaign")}
            onChange={(event) => setCampaignName(event.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            "A variant is the same short link with extra UTM values. Blank fields keep the UTM values saved on the link.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="submit"
            size="sm"
            form="campaign-editor"
            disabled={savingCampaign || !campaign}
          >
            <Save /> {savingCampaign ? t("Saving…") : t("Save")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 /> {t("Delete")}
          </Button>
        </div>
      </div>
      {loading ? (
        <DetailSkeleton label="Loading campaign…" />
      ) : (
      <>
      <Section title={t("Campaign")}>
          <form
            id="campaign-editor"
            className="grid gap-3"
            onSubmit={(event) => void saveCampaign(event)}
          >
            <TagField
              kind="campaign"
              tags={tags}
              onChange={(next) => {
                tagsRef.current = next;
                setTags(next);
              }}
            />
            <Field label="Description">
              <Textarea
                value={campaignDescription}
                onChange={(event) => setCampaignDescription(event.target.value)}
              />
            </Field>
            <Button type="submit" disabled={savingCampaign}>
              <Save /> {savingCampaign ? t("Saving…") : t("Save campaign")}
            </Button>
          </form>
      </Section>
      <Section title={t("Variants")}>
          <form
            className="grid gap-3"
            onSubmit={(event) => void submitVariant(event)}
          >
            <h2 className="text-lg font-medium">
              {editingId ? t("Edit variant") : t("Add variant")}
            </h2>
            <Field label="Variant name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field label="Link">
              {editingId ? (
                <p className="font-mono text-sm break-all">
                  {knownLinks.find((link) => link.id === linkId)?.shortUrl}
                </p>
              ) : (
                <div className="grid gap-2">
                  <Input
                    value={linkQuery}
                    onChange={(event) => setLinkQuery(event.target.value)}
                    placeholder="Search by slug, title, or destination"
                  />
                  <Select
                    value={linkId}
                    placeholder="Choose a link"
                    options={pickerOptions(links, knownLinks, linkId)}
                    onValueChange={setLinkId}
                  />
                  {linkTotal > links.length ? (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Showing {shown} of {total}. Search to find another link.",
                        { shown: links.length, total: linkTotal },
                      )}
                    </p>
                  ) : null}
                </div>
              )}
            </Field>
            {editingId ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "The link stays with this variant. Create another variant to track a different link.",
                )}
              </p>
            ) : null}
            <UtmFields utm={utm} onChange={setUtm} />
            <div className="flex flex-wrap items-center gap-2.5">
              <Button type="submit" disabled={savingVariant}>
                {editingId ? <Save /> : <Plus />}{" "}
                {savingVariant
                  ? t("Saving…")
                  : editingId
                    ? t("Save variant")
                    : t("Add variant")}
              </Button>
              {editingId ? (
                <Button
                  variant="outline"
                  type="button"
                  onClick={resetVariantForm}
                >
                  <X /> {t("Cancel")}
                </Button>
              ) : null}
            </div>
          </form>
          {aiAvailable && !editingId ? (
            <VariantDrafts
              campaignId={id}
              linkId={linkId}
              description={campaignDescription}
              onDescription={setCampaignDescription}
              onUse={(draft) => {
                setName(draft.name);
                setUtm(draft.utm);
              }}
              onSaved={loadCampaign}
            />
          ) : null}
          {(campaign?.variants.length ?? 0) === 0 ? (
            <p className="text-base text-muted-foreground md:text-sm">{t("No variants yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("Short URL")}</TableHead>
                  <TableHead>{t("UTM")}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t("Actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign?.variants.map((variant) => {
                  const link = knownLinks.find(
                    (item) => item.id === variant.linkId,
                  );
                  const url = link ? variantUrl(link.shortUrl, variant.id) : "";
                  const copied = copiedId === variant.id;
                  return (
                    <TableRow key={variant.id}>
                      <TableCell className="font-medium">{variant.name}</TableCell>
                      <TableCell
                        className="font-mono text-muted-foreground"
                        title={url || undefined}
                      >
                        {url}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {utmSummary(variant.utm)}
                      </TableCell>
                      <TableCell data-row-action>
                        <div className="flex items-center gap-1">
                          <IconAction
                            label={t("Edit")}
                            onClick={() => editVariant(variant)}
                          >
                            <Pencil />
                          </IconAction>
                          <IconAction
                            label={copied ? t("Copied") : t("Copy")}
                            disabled={!url}
                            onClick={() => void copyVariant(variant)}
                          >
                            {copied ? <Check /> : <Copy />}
                          </IconAction>
                          <IconAction
                            label={t("Delete")}
                            onClick={() => setVariantToDelete(variant)}
                          >
                            <Trash2 />
                          </IconAction>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </Section>
      </>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this campaign?"
        description="Variants in this campaign are removed. Short links and their click history stay."
        confirmLabel="Delete campaign"
        destructive
        onOpenChange={setConfirmDelete}
        onConfirm={() => void removeCampaign()}
      />
      <ConfirmDialog
        open={variantToDelete !== null}
        title="Delete this variant?"
        description="Printed QR codes that use this variant keep the old address, and new clicks will no longer count toward it."
        confirmLabel="Delete variant"
        destructive
        onOpenChange={(open) => {
          if (!open) setVariantToDelete(null);
        }}
        onConfirm={() => void removeVariant()}
      />
    </section>
  );
}

function variantLabel(count: number): string {
  return count === 1 ? t("1 variant") : t("{count} variants", { count });
}

function pickerOptions(
  links: ShortLink[],
  knownLinks: ShortLink[],
  selectedId: string,
) {
  const selected = knownLinks.find((link) => link.id === selectedId);
  const rows =
    selected && !links.some((link) => link.id === selected.id)
      ? [selected, ...links]
      : links;
  return rows.map((link) => ({ value: link.id, label: link.shortUrl }));
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

function variantUrl(shortUrl: string, variantId: string): string {
  const url = new URL(shortUrl);
  url.searchParams.set("v", variantId);
  return url.toString();
}
