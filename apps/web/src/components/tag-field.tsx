import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import { isTagColor, randomTagColor, tagPalette, tagTextColor, type TagKind } from "@sharry/shared";
import { api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Badge } from "./ui/badge.tsx";
import { Field } from "./ui/field.tsx";
import { toastCaught } from "./ui/toast.tsx";

export type EditorTag = { id?: string; name: string; color: string };

export function TagBadge({
  name,
  color,
  onRemove,
  onColor,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  onColor?: (color: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fill = isTagColor(color) ? color : tagPalette[0];
  return (
    <span className="relative inline-flex max-w-full">
      <Badge
        className={cn(
          "max-w-full border-transparent",
          (onColor || onRemove) && "pointer-coarse:h-11 pointer-coarse:pr-0 pointer-coarse:pl-3 pointer-coarse:text-sm",
        )}
        style={{ backgroundColor: fill, color: tagTextColor(fill) }}
      >
        {onColor ? (
          <button
            type="button"
            className="max-w-40 truncate pointer-coarse:h-full"
            aria-label={t("Change {name} color", { name })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpen((current) => !current)}
          >
            {name}
          </button>
        ) : (
          <span className="max-w-40 truncate">{name}</span>
        )}
        {onRemove ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center pointer-coarse:size-11"
            aria-label={t("Remove {name}", { name })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onRemove}
          >
            <X className="size-3 pointer-coarse:size-4" />
          </button>
        ) : null}
      </Badge>
      {open && onColor ? (
        <span className="absolute top-full left-0 z-30 mt-1 flex w-44 flex-wrap gap-1 rounded-md border border-border bg-popover p-2 shadow-md pointer-coarse:w-64 pointer-coarse:gap-2">
          {tagPalette.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              className="size-5 rounded-full border border-black/10 pointer-coarse:size-11"
              style={{ backgroundColor: swatch }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onColor(swatch);
                setOpen(false);
              }}
            />
          ))}
          <input
            aria-label={t("Custom color")}
            type="color"
            className="size-5 cursor-pointer border-0 bg-transparent p-0 pointer-coarse:size-11"
            value={fill}
            onMouseDown={(event) => event.preventDefault()}
            onChange={(event) => onColor(event.target.value)}
          />
        </span>
      ) : null}
    </span>
  );
}

export function TagField({
  kind,
  tags,
  onChange,
  disabled = false,
}: {
  kind: TagKind;
  tags: EditorTag[];
  onChange: (tags: EditorTag[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [known, setKnown] = useState<EditorTag[]>([]);
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  useEffect(() => {
    let cancelled = false;
    void api<{ tags?: EditorTag[] }>(`/api/tags?kind=${kind}`)
      .then((result) => {
        if (!cancelled) setKnown(result.tags ?? []);
      })
      .catch(() => {
        if (!cancelled) setKnown([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const current = tagsRef.current;
    if (current.some((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("This tag is already in use.");
      return;
    }
    const existing = known.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase());
    const next = existing
      ? [...current, existing]
      : [...current, { name: trimmed, color: randomTagColor() }];
    tagsRef.current = next;
    onChange(next);
    setDraft("");
    setError("");
  }

  async function recolor(tag: EditorTag, color: string) {
    const next = tagsRef.current.map((item) =>
      item.name.toLowerCase() === tag.name.toLowerCase() ? { ...item, color } : item,
    );
    tagsRef.current = next;
    onChange(next);
    setKnown((items) => items.map((item) => (item.id === tag.id ? { ...item, color } : item)));
    if (!tag.id) return;
    try {
      await api(`/api/tags/${tag.id}`, { method: "PATCH", body: JSON.stringify({ color }) });
    } catch (caught) {
      toastCaught(caught, t("Could not change the tag color"));
    }
  }

  const matches = known.filter(
    (tag) =>
      draft.trim() &&
      tag.name.toLowerCase().includes(draft.trim().toLowerCase()) &&
      !tags.some((item) => item.name.toLowerCase() === tag.name.toLowerCase()),
  );

  return (
    <Field label="Tags">
      <div className="relative">
        <div className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-white px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          {tags.map((tag) => (
            <TagBadge
              key={tag.id ?? tag.name}
              name={tag.name}
              color={tag.color}
              onRemove={
                disabled
                  ? undefined
                  : () => {
                      const next = tagsRef.current.filter((item) => item.name.toLowerCase() !== tag.name.toLowerCase());
                      tagsRef.current = next;
                      onChange(next);
                    }
              }
              onColor={disabled ? undefined : (color) => void recolor(tag, color)}
            />
          ))}
          {disabled ? null : (
            <input
              value={draft}
              aria-label={t("Add a tag")}
              placeholder={t("Add a tag")}
              className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-coarse:h-11 pointer-coarse:text-base"
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commit(draft);
              }}
            />
          )}
        </div>
        {error ? (
          <p className="pointer-events-none absolute top-full left-0 z-20 mt-1 text-sm text-destructive" role="alert">
            {t(error)}
          </p>
        ) : null}
        {matches.length > 0 ? (
          <ul className="absolute top-full right-0 left-0 z-20 mt-1 grid gap-1 rounded-md border border-border bg-popover p-2 shadow-md">
            {matches.slice(0, 6).map((tag) => (
              <li key={tag.id ?? tag.name}>
                <button
                  type="button"
                  className="text-left"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(tag.name)}
                >
                  <TagBadge name={tag.name} color={tag.color} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
