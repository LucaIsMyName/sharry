import { useState } from "react";
import type { FormEvent } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import type { UtmParams } from "@sharry/shared";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { utmSummary } from "./utm-fields.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";

export type VariantDraft = { name: string; utm: UtmParams };

export function VariantDrafts({
  campaignId,
  linkId,
  description,
  onDescription,
  onUse,
  onSaved,
}: {
  campaignId: string;
  linkId: string;
  description: string;
  onDescription: (value: string) => void;
  onUse: (draft: VariantDraft) => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState("");
  const [drafts, setDrafts] = useState<VariantDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filledDescription, setFilledDescription] = useState(false);
  const [error, setError] = useState("");
  async function suggest(event: FormEvent) {
    event.preventDefault();
    if (!instruction.trim() || pending) return;
    setPending(true);
    setError("");
    setFilledDescription(false);
    try {
      const result = await api<{ description: string; variants: VariantDraft[] }>("/api/ai/suggest-variants", {
        method: "POST",
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setDrafts(result.variants);
      if (!description.trim() && result.description.trim()) {
        onDescription(result.description);
        setFilledDescription(true);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not draft variants from that sentence.");
    } finally {
      setPending(false);
    }
  }
  async function addAll() {
    if (!linkId || saving || drafts.length === 0) return;
    setSaving(true);
    setError("");
    const remaining: VariantDraft[] = [];
    for (const draft of drafts) {
      try {
        await api(`/api/campaigns/${campaignId}/variants`, {
          method: "POST",
          body: JSON.stringify({ name: draft.name, linkId, utm: draft.utm }),
        });
      } catch (caught) {
        remaining.push(draft);
        setError(caught instanceof ApiError ? caught.message : "Could not save the variant");
      }
    }
    setDrafts(remaining);
    setSaving(false);
    if (remaining.length < drafts.length) await onSaved();
  }
  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <form className="grid gap-2" onSubmit={(event) => void suggest(event)}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-48 flex-1"
            aria-label="Describe the variants"
            value={instruction}
            placeholder="newsletter, Instagram, poster"
            onChange={(event) => setInstruction(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!instruction.trim() || pending}>
            <Sparkles /> {pending ? t("Drafting…") : t("Draft variants")}
          </Button>
        </div>
      </form>
      {filledDescription ? (
        <p className="text-sm text-muted-foreground">{t("Save the campaign to keep the description.")}</p>
      ) : null}
      {drafts.length > 0 ? (
        <ul className="grid gap-2">
          {drafts.map((draft, index) => (
            <li key={`${draft.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="font-medium">{draft.name}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{utmSummary(draft.utm)}</span>
              </span>
              <span className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onUse(draft)}>
                  {t("Use")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDrafts((current) => current.filter((_, item) => item !== index))}
                >
                  <X /> {t("Remove")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {drafts.length > 0 ? (
        <div>
          <Button type="button" disabled={!linkId || saving} onClick={() => void addAll()}>
            <Plus /> {saving ? t("Saving…") : t("Add these variants")}
          </Button>
          {!linkId ? <p className="mt-2 text-sm text-destructive">{t("Choose a link before adding these variants.")}</p> : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{t(error)}</p> : null}
    </div>
  );
}
