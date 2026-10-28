import { useEffect, useState } from "react";
import { defaultFolderIcon, fontOptions, type PageSettings } from "@sharry/shared";
import { api } from "../../api.ts";
import { useI18n } from "../../i18n/index.tsx";
import { RedirectDomainField, defaultRedirectDomain, redirectDomainPayload } from "../../pages/links.tsx";
import { AppIcon } from "../app-icon.tsx";
import { MediaField } from "../media-field.tsx";
import { Select } from "../ui/choice-select.tsx";
import { Field } from "../ui/field.tsx";
import { Input } from "../ui/input.tsx";
import { Section } from "../ui/section.tsx";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Toggle } from "../ui/toggle.tsx";
import { ColorControl, mediaRef, type MediaRefs } from "./field-editor.tsx";
import type { PageMediaRef } from "@sharry/shared";

export type PageDraft = {
  title: string;
  slug: string;
  folderId: string | null;
  redirectDomainId: string | null;
  hidden: boolean;
  settings: PageSettings;
};

type FolderOption = { id: string; name: string; parentId: string | null; icon: string | null };

const imageAccept = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function PageSettingsSheet({
  open,
  onOpenChange,
  draft,
  onChange,
  media,
  onMedia,
  url,
  published,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: PageDraft;
  onChange: (draft: PageDraft) => void;
  media: MediaRefs;
  onMedia: (ref: PageMediaRef) => void;
  url: string;
  published: boolean;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const settings = draft.settings;
  const setSettings = (next: Partial<PageSettings>) => onChange({ ...draft, settings: { ...settings, ...next } });
  const ogImage = settings.ogImageId ? media[settings.ogImageId] : undefined;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api<{ folders?: FolderOption[] }>("/api/folders?kind=page&tree=1")
      .then((result) => {
        if (!cancelled) setFolders(result.folders ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle>{t("Page settings")}</SheetTitle>
          <SheetDescription>{t("Saved with the page. Visitors see them after you publish.")}</SheetDescription>
        </SheetHeader>
        <fieldset disabled={readOnly} className="m-0 grid gap-5 border-0 px-4 pb-6">
          <div className="grid gap-3">
            <Field label="Title">
              <Input value={draft.title} maxLength={200} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
            </Field>
            <Field label="Slug" info={url}>
              <Input value={draft.slug} maxLength={64} onChange={(event) => onChange({ ...draft, slug: event.target.value })} />
            </Field>
            <Field label="Folder">
              <Select
                value={draft.folderId ?? "root"}
                options={folderOptions(folders)}
                onValueChange={(value) => onChange({ ...draft, folderId: value === "root" ? null : value })}
              />
            </Field>
            <RedirectDomainField
              value={draft.redirectDomainId ?? defaultRedirectDomain}
              onValueChange={(value) => onChange({ ...draft, redirectDomainId: redirectDomainPayload(value) })}
            />
            <div className="grid gap-1">
              <Toggle label="Hide from visitors" checked={draft.hidden} onChange={(hidden) => onChange({ ...draft, hidden })} />
              <p className="text-sm text-muted-foreground">
                {published
                  ? t("Visitors get a “not found” page while this is on. Publishing turns it off.")
                  : t("This page has never been published, so visitors cannot see it yet.")}
              </p>
            </div>
          </div>
          <Section title={t("Search engines")}>
            <Field label="Description">
              <Textarea value={settings.description} maxLength={300} rows={3} onChange={(event) => setSettings({ description: event.target.value })} />
            </Field>
            <Toggle label="Hide from search engines" checked={settings.noindex} onChange={(noindex) => setSettings({ noindex })} />
            <Field label="Language" info={t("Use a language code such as en or de-AT")}>
              <Input value={settings.language} maxLength={5} onChange={(event) => setSettings({ language: event.target.value })} />
            </Field>
          </Section>
          <Section title={t("Social sharing")}>
            <Field label="Share title" info={t("Leave blank to use the page title.")}>
              <Input value={settings.ogTitle} maxLength={200} onChange={(event) => setSettings({ ogTitle: event.target.value })} />
            </Field>
            <Field label="Share description" info={t("Leave blank to use the description.")}>
              <Textarea value={settings.ogDescription} maxLength={300} rows={2} onChange={(event) => setSettings({ ogDescription: event.target.value })} />
            </Field>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t("Share image")}</span>
              <MediaField
                value={settings.ogImageId ? { id: settings.ogImageId, url: ogImage?.path ?? "", name: ogImage ? t("Share image") : t("Missing file") } : null}
                accept={imageAccept}
                acceptLabel="JPEG, PNG, WebP, or GIF"
                removeLabel={t("Remove")}
                disabled={readOnly}
                onChange={(item) => {
                  if (item) onMedia(mediaRef(item));
                  setSettings({ ogImageId: item?.id ?? null });
                }}
              />
            </div>
          </Section>
          <Section title={t("Look")}>
            <ColorControl label="Background" value={settings.background} fallback="#ffffff" clearable={false} onChange={(value) => value && setSettings({ background: value })} />
            <ColorControl label="Text color" value={settings.textColor} fallback="#18181b" clearable={false} onChange={(value) => value && setSettings({ textColor: value })} />
            <Field label="Font">
              <Select
                value={settings.font}
                options={fontOptions.filter((option) => option.value !== "inherit").map((option) => ({ ...option }))}
                onValueChange={(font) => setSettings({ font })}
              />
            </Field>
          </Section>
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}

function folderOptions(folders: FolderOption[]) {
  const byParent = new Map<string | null, FolderOption[]>();
  for (const folder of folders) byParent.set(folder.parentId, [...(byParent.get(folder.parentId) ?? []), folder]);
  const options = [{ value: "root", label: "Pages", depth: 0, icon: <AppIcon name={defaultFolderIcon} /> }];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of byParent.get(parentId) ?? []) {
      options.push({ value: folder.id, label: folder.name, depth, icon: <AppIcon name={folder.icon ?? defaultFolderIcon} /> });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  return options;
}
