import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, Copy, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import type { UtmParams } from "@sharry/shared";
import { api, type ShortLink } from "../api.ts";
import { PageTitle } from "../components/page-title.tsx";
import { UtmFields, utmSummary } from "../components/utm-fields.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { t, useI18n } from "../i18n/index.tsx";
import { Textarea } from "../components/ui/textarea.tsx";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  variantCount: number;
};
type Variant = { id: string; name: string; linkId: string; utm: UtmParams };

const emptyUtm: UtmParams = {};

export function CampaignsPage() {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  async function load() {
    const result = await api<{ campaigns: Campaign[] }>("/api/campaigns");
    setCampaigns(result.campaigns);
  }

  useEffect(() => {
    void load()
      .catch((caught: unknown) =>
        toastCaught(caught, t("Could not load campaigns")),
      )
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      setName("");
      setDescription("");
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not create the campaign"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          {t("Campaigns")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t(
            "A campaign groups tracked copies of your short links. Each variant keeps the same slug and adds its own UTM values. Share it with ?v= or attach it to a QR code.",
          )}
        </p>
      </div>
      <Card>
        <CardContent>
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
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("Loading campaigns…")}</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No campaigns yet.")}</p>
          ) : (
            <ul>
              {campaigns.map((campaign) => (
                <li
                  key={campaign.id}
                  className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <Link
                      className="font-medium hover:text-primary"
                      to={`/campaigns/${campaign.id}`}
                    >
                      {campaign.name}
                    </Link>
                    {campaign.description ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {campaign.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {variantLabel(campaign.variantCount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">
            {loading
              ? t("Loading campaign…")
              : (campaign?.name ?? t("Campaign"))}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t(
              "A variant is the same short link with extra UTM values. Blank fields keep the UTM values saved on the link.",
            )}
          </p>
        </div>
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
      <Card>
        <CardContent>
          <form
            id="campaign-editor"
            className="grid gap-3"
            onSubmit={(event) => void saveCampaign(event)}
          >
            <Field label="Name">
              <Input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                required
              />
            </Field>
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
        </CardContent>
      </Card>
      <Card>
        <CardContent>
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
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {(campaign?.variants.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{t("No variants yet.")}</p>
          ) : (
            <ul className="grid gap-4">
              {campaign?.variants.map((variant) => {
                const link = knownLinks.find(
                  (item) => item.id === variant.linkId,
                );
                const url = link ? variantUrl(link.shortUrl, variant.id) : "";
                return (
                  <li key={variant.id} className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-medium">{variant.name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => editVariant(variant)}
                      >
                        <Pencil /> {t("Edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={!url}
                        onClick={() => void copyVariant(variant)}
                      >
                        {copiedId === variant.id ? (
                          <>
                            <Check /> {t("Copied")}
                          </>
                        ) : (
                          <>
                            <Copy /> {t("Copy")}
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => setVariantToDelete(variant)}
                      >
                        <Trash2 /> {t("Delete")}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {utmSummary(variant.utm)}
                    </p>
                    {url ? (
                      <p className="font-mono text-sm break-all text-muted-foreground">
                        {url}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
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

function variantUrl(shortUrl: string, variantId: string): string {
  const url = new URL(shortUrl);
  url.searchParams.set("v", variantId);
  return url.toString();
}
