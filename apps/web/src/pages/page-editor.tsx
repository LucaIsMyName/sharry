import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Eye, EyeOff, Save, Send, Settings, Trash2 } from "lucide-react";
import { useBlocker, useNavigate, useParams } from "react-router";
import {
  blockDefinition,
  createBlock,
  duplicateBlock,
  findBlock,
  insertBlock,
  insertProblem,
  removeBlock,
  shiftBlock,
  updateBlockProps,
  type PageBlock,
  type PageContent,
  type PageMediaRef,
} from "@sharry/shared";
import { ApiError, api, type LandingPage } from "../api.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { AddBlockDialog } from "../components/page-builder/add-block-dialog.tsx";
import { BlockIcon } from "../components/page-builder/block-icons.tsx";
import { BlockTree, type AddTarget } from "../components/page-builder/block-tree.tsx";
import { FieldsEditor, type MediaRefs } from "../components/page-builder/field-editor.tsx";
import { PagePreview } from "../components/page-builder/page-preview.tsx";
import { PageSettingsSheet, type PageDraft } from "../components/page-builder/page-settings-sheet.tsx";
import { PageStatusBadge } from "../components/page-builder/page-status.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { useI18n } from "../i18n/index.tsx";
import { cn } from "cn";

type Draft = PageDraft & { content: PageContent };
type Busy = "save" | "publish" | "hide" | "duplicate" | null;

function toDraft(page: LandingPage): Draft {
  return {
    title: page.title,
    slug: page.slug,
    folderId: page.folderId,
    redirectDomainId: page.redirectDomainId,
    hidden: page.hidden,
    settings: page.settings,
    content: page.content,
  };
}

function sameDraft(left: Draft, right: Draft): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function PageEditorPage() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [media, setMedia] = useState<MediaRefs>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adding, setAdding] = useState<AddTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const leaving = useRef(false);

  const dirty = Boolean(page && draft && !sameDraft(toDraft(page), draft));
  const editable = page?.canEdit !== false;

  const accept = useCallback((next: LandingPage, keepDraft = false) => {
    setPage(next);
    setMedia((current) => ({ ...current, ...next.media }));
    if (!keepDraft) setDraft(toDraft(next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    setDraft(null);
    setFailed(false);
    void api<LandingPage>(`/api/pages/${id}`)
      .then((loaded) => {
        if (cancelled) return;
        setMedia(loaded.media);
        accept(loaded);
        setSelectedId(loaded.content.blocks[0]?.id ?? null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFailed(true);
        toastCaught(caught, t("Could not load the page"));
      });
    return () => {
      cancelled = true;
    };
  }, [id, accept]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function send(kind: "save" | "publish") {
    if (!draft || busy) return;
    setBusy(kind);
    const body = { ...draft, title: draft.title.trim() };
    try {
      const next =
        kind === "save"
          ? await api<LandingPage>(`/api/pages/${id}`, { method: "PATCH", body: JSON.stringify(body) })
          : await api<LandingPage>(`/api/pages/${id}/publish`, { method: "POST", body: JSON.stringify({ ...body, hidden: undefined }) });
      accept(next);
      toast.success(kind === "save" ? t("Page saved.") : t("Page published."));
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "slug_taken") setSettingsOpen(true);
      toastCaught(caught, kind === "save" ? t("Could not save the page") : t("Could not publish the page"));
    } finally {
      setBusy(null);
    }
  }

  const saveRef = useRef(send);
  saveRef.current = send;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveRef.current("save");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function hide() {
    setBusy("hide");
    try {
      const next = await api<LandingPage>(`/api/pages/${id}/hide`, { method: "POST" });
      setPage(next);
      setDraft((current) => (current ? { ...current, hidden: true } : current));
      toast.success(t("Page hidden. Visitors now get a “not found” page."));
    } catch (caught) {
      toastCaught(caught, t("Could not hide the page"));
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    setBusy("duplicate");
    try {
      const copy = await api<LandingPage>(`/api/pages/${id}/duplicate`, { method: "POST" });
      toast.success(t("Copy created from the last saved version."));
      void navigate(`/pages/${copy.id}`);
    } catch (caught) {
      toastCaught(caught, t("Could not duplicate the page"));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    try {
      await api(`/api/pages/${id}`, { method: "DELETE" });
      leaving.current = true;
      toast.success(t("Page deleted."));
      void navigate("/pages");
    } catch (caught) {
      toastCaught(caught, t("Could not delete the page"));
    }
  }

  function setBlocks(update: (blocks: PageBlock[]) => PageBlock[]) {
    setDraft((current) => (current ? { ...current, content: { blocks: update(current.content.blocks) } } : current));
  }

  function addBlock(type: string) {
    if (!draft || !adding) return;
    const block = createBlock(type);
    const blocks = draft.content.blocks;
    const parent = adding.parentId ? findBlock(blocks, adding.parentId) : null;
    const index = adding.parentId === null ? blocks.length : (parent?.slots?.[adding.slot ?? ""]?.length ?? 0);
    const place = { ...adding, index };
    const problem = insertProblem(blocks, place, block);
    if (problem) {
      toastCaught(new Error(t(problem)), t("Could not add the block"));
      return;
    }
    setBlocks((current) => insertBlock(current, place, block));
    setSelectedId(block.id);
    setAdding(null);
  }

  function duplicateSelected(blockId: string) {
    if (!draft) return;
    const result = duplicateBlock(draft.content.blocks, blockId);
    if (!result.copyId) {
      toastCaught(new Error(t("A page can hold at most 300 blocks")), t("Could not duplicate the block"));
      return;
    }
    setBlocks(() => result.blocks);
    setSelectedId(result.copyId);
  }

  function removeSelected(blockId: string) {
    setBlocks((current) => removeBlock(current, blockId));
    if (selectedId && draft && (selectedId === blockId || !findBlock(removeBlock(draft.content.blocks, blockId), selectedId))) setSelectedId(null);
  }

  if (failed) return <EmptyState>{t("Could not load the page.")}</EmptyState>;
  if (!page || !draft) return <RowSkeleton label="Loading page…" />;

  const selected = selectedId ? findBlock(draft.content.blocks, selectedId) : null;
  const definition = selected ? blockDefinition(selected.type) : undefined;
  const live = page.status === "published" || page.status === "changed";
  const publishLabel = page.publishedAt ? t("Publish changes") : t("Publish");

  return (
    <section>
      <PageHeader
        title={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-3">
            <span className="truncate">{draft.title.trim() || t("Untitled page")}</span>
            <PageStatusBadge status={page.status} />
            <Badge variant="outline" className={cn(!dirty && "invisible")} aria-hidden={!dirty}>
              {t("Unsaved")}
            </Badge>
          </span>
        }
        lede={page.url}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <IconAction label={t("View live")} disabled={!live} onClick={() => window.open(page.url, "_blank", "noopener")}>
              <ExternalLink />
            </IconAction>
            {editable ? (
              <IconAction label={t("Hide from visitors")} disabled={!live || busy !== null} onClick={() => void hide()}>
                <EyeOff />
              </IconAction>
            ) : null}
            <IconAction label={t("Duplicate page")} disabled={busy !== null} onClick={() => void duplicate()}>
              <Copy />
            </IconAction>
            {editable ? (
              <IconAction label={t("Delete page")} onClick={() => setDeleting(true)}>
                <Trash2 />
              </IconAction>
            ) : null}
            <Button variant="outline" size="sm" type="button" onClick={() => setSettingsOpen(true)}>
              <Settings /> {t("Settings")}
            </Button>
            <Button variant="outline" size="sm" type="button" title={t("Opens the last saved draft")} onClick={() => window.open(`/api/pages/${page.id}/preview`, "_blank", "noopener")}>
              <Eye /> {t("Preview")}
            </Button>
            {editable ? (
              <>
                <Button variant="outline" size="sm" type="button" disabled={!dirty || busy !== null} onClick={() => void send("save")}>
                  <Save /> {busy === "save" ? t("Saving…") : t("Save")}
                </Button>
                <Button size="sm" type="button" disabled={busy !== null || (!dirty && page.status === "published")} onClick={() => void send("publish")}>
                  <Send /> {busy === "publish" ? t("Publishing…") : publishLabel}
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {!editable ? <p className="mb-4 text-sm text-muted-foreground">{t("You can view this page but not change it.")}</p> : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-2">
            <h2 className="text-sm font-medium">{t("Blocks")}</h2>
            <BlockTree
              blocks={draft.content.blocks}
              selectedId={selectedId}
              disabled={!editable}
              onSelect={setSelectedId}
              onChange={(blocks) => setBlocks(() => blocks)}
              onAdd={setAdding}
              onShift={(blockId, delta) => setBlocks((current) => shiftBlock(current, blockId, delta))}
              onDuplicate={duplicateSelected}
              onRemove={removeSelected}
            />
          </div>
          <div className="grid min-w-0 gap-3 border-t border-border pt-4" inert={!editable}>
            {selected && definition ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <BlockIcon name={definition.icon} />
                  </span>
                  <span className="grid gap-0.5">
                    <h2 className="text-sm font-medium">{t(definition.label)}</h2>
                    <span className="text-sm text-muted-foreground">{t(definition.description)}</span>
                  </span>
                </div>
                <FieldsEditor
                  key={selected.id}
                  fields={definition.fields}
                  values={selected.props}
                  media={media}
                  onMedia={(ref: PageMediaRef) => setMedia((current) => ({ ...current, [ref.id]: ref }))}
                  onChange={(props) => setBlocks((current) => updateBlockProps(current, selected.id, props))}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("Select a block to change its content and style.")}</p>
            )}
          </div>
        </div>
        <div className="min-w-0 lg:sticky lg:top-5">
          <PagePreview title={draft.title} settings={draft.settings} content={draft.content} media={media} />
        </div>
      </div>
      <AddBlockDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        onPick={addBlock}
      />
      <PageSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        draft={draft}
        onChange={(next) => setDraft((current) => (current ? { ...current, ...next } : current))}
        media={media}
        onMedia={(ref) => setMedia((current) => ({ ...current, [ref.id]: ref }))}
        url={page.url}
        published={Boolean(page.publishedAt)}
        readOnly={!editable}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete this page?"
        description="Its address stops working right away. This cannot be undone."
        confirmLabel="Delete page"
        destructive
        onOpenChange={setDeleting}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        description="Your changes to this page are not saved yet."
        confirmLabel="Leave page"
        destructive
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      />
    </section>
  );
}
