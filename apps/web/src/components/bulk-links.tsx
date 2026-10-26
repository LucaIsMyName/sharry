import { useState } from "react";
import { bulkLinkLimit } from "@sharry/shared";
import { ApiError, api, type ShortLink } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { Textarea } from "./ui/textarea.tsx";

type DraftRow = {
  destinationUrl: string;
  title: string;
  slug: string;
  keep: boolean;
  error: string;
};

export function BulkLinks({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(0);
  function parseLines(): string[] | null {
    const urls = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setError("Paste one destination URL per line.");
      return null;
    }
    if (urls.length > bulkLinkLimit) {
      setError("Paste at most 20 links.");
      return null;
    }
    return urls;
  }
  async function review() {
    const urls = parseLines();
    if (!urls || pending) return;
    setPending(true);
    setError("");
    setCreated(0);
    try {
      const result = await api<{ rows: { destinationUrl: string; title: string; slug: string; error?: string }[] }>(
        "/api/ai/suggest-links",
        { method: "POST", body: JSON.stringify({ urls }) },
      );
      setRows(
        result.rows.map((row) => ({
          destinationUrl: row.destinationUrl,
          title: row.title,
          slug: row.slug,
          keep: true,
          error: row.error ?? "",
        })),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not read those pages.");
    } finally {
      setPending(false);
    }
  }
  function update(index: number, patch: Partial<DraftRow>) {
    setRows((current) => current?.map((row, item) => (item === index ? { ...row, ...patch } : row)) ?? current);
  }
  async function createKept() {
    if (!rows || creating) return;
    const kept = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.keep);
    if (kept.length === 0) {
      setError("Choose at least one link.");
      return;
    }
    setCreating(true);
    setError("");
    let made = 0;
    const next = [...rows];
    for (const item of kept) {
      try {
        await api<ShortLink>("/api/links", {
          method: "POST",
          body: JSON.stringify({
            destinationUrl: item.row.destinationUrl,
            ...(item.row.title.trim() ? { title: item.row.title.trim() } : {}),
            ...(item.row.slug.trim() ? { slug: item.row.slug.trim() } : {}),
          }),
        });
        next[item.index] = { ...item.row, keep: false, error: "" };
        made += 1;
      } catch (caught) {
        next[item.index] = {
          ...item.row,
          error: caught instanceof ApiError ? caught.message : "Could not create the link",
        };
      }
    }
    setRows(next);
    setCreated(made);
    setCreating(false);
    if (made > 0) onCreated();
  }
  return (
    <div className="mt-4 grid gap-3">
      <Field label="Destinations">
        <Textarea
          value={text}
          placeholder="One destination URL per line"
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => void review()}>
          {pending ? t("Reviewing…") : t("Review")}
        </Button>
        {rows && rows.some((row) => row.keep) ? (
          <Button type="button" disabled={creating} onClick={() => void createKept()}>
            {creating ? t("Creating…") : t("Create links")}
          </Button>
        ) : null}
      </div>
      {created > 0 ? <p className="text-sm text-muted-foreground">{t("Created {count} links.", { count: created })}</p> : null}
      {error ? <p className="text-sm text-destructive">{t(error)}</p> : null}
      {rows ? (
        <ul className="grid gap-3">
          {rows.map((row, index) => (
            <li key={`${row.destinationUrl}-${index}`} className="grid gap-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={row.keep}
                  aria-label={t("Keep {url}", { url: row.destinationUrl })}
                  onCheckedChange={(checked) => update(index, { keep: checked === true })}
                />
                <span className="truncate font-mono text-sm">{row.destinationUrl}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Title">
                  <Input value={row.title} onChange={(event) => update(index, { title: event.target.value })} />
                </Field>
                <Field label="Slug">
                  <Input value={row.slug} onChange={(event) => update(index, { slug: event.target.value })} />
                </Field>
              </div>
              {row.error ? <p className="text-sm text-destructive">{t(row.error)}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
