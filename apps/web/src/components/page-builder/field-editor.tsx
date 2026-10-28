import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import {
  HEX_COLOR,
  defaultProps,
  mediaTypes,
  type ListField,
  type PageField,
  type PageMediaRef,
  type ScalarField,
} from "@sharry/shared";
import { api, type MediaItem } from "../../api.ts";
import { useI18n } from "../../i18n/index.tsx";
import { IconAction } from "../icon-action.tsx";
import { MediaField } from "../media-field.tsx";
import { Button } from "../ui/button.tsx";
import { Select } from "../ui/choice-select.tsx";
import { Field } from "../ui/field.tsx";
import { Input } from "../ui/input.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Toggle } from "../ui/toggle.tsx";
import { RichTextEditor } from "./rich-text-editor.tsx";

export type MediaRefs = Record<string, PageMediaRef>;

const acceptByKind = {
  image: [mediaTypes.jpeg.mime, mediaTypes.png.mime, mediaTypes.webp.mime, mediaTypes.gif.mime, mediaTypes.svg.mime],
  video: [mediaTypes.mp4.mime, mediaTypes.webm.mime],
} as const;
const acceptLabels = { image: "JPEG, PNG, WebP, GIF, or SVG", video: "MP4 or WebM" } as const;

export function mediaRef(item: MediaItem): PageMediaRef {
  return { id: item.id, path: item.path, mime: item.mime, alt: item.alt, width: item.width, height: item.height };
}

/** Renders one control per field spec. A block only declares fields; this decides how each kind is edited. */
export function FieldsEditor({
  fields,
  values,
  onChange,
  media,
  onMedia,
}: {
  fields: Record<string, PageField>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  media: MediaRefs;
  onMedia: (ref: PageMediaRef) => void;
}) {
  return (
    <div className="grid gap-3">
      {Object.entries(fields).map(([name, spec]) => (
        <FieldControl
          key={name}
          spec={spec}
          value={values[name] ?? spec.default}
          media={media}
          onMedia={onMedia}
          onChange={(next) => onChange({ ...values, [name]: next })}
        />
      ))}
    </div>
  );
}

function FieldControl({
  spec,
  value,
  onChange,
  media,
  onMedia,
}: {
  spec: PageField;
  value: unknown;
  onChange: (value: unknown) => void;
  media: MediaRefs;
  onMedia: (ref: PageMediaRef) => void;
}) {
  if (spec.kind === "list") return <ListControl spec={spec} value={value} onChange={onChange} media={media} onMedia={onMedia} />;
  return <ScalarControl spec={spec} value={value} onChange={onChange} media={media} onMedia={onMedia} />;
}

function ScalarControl({
  spec,
  value,
  onChange,
  media,
  onMedia,
}: {
  spec: ScalarField;
  value: unknown;
  onChange: (value: unknown) => void;
  media: MediaRefs;
  onMedia: (ref: PageMediaRef) => void;
}) {
  const { t } = useI18n();
  switch (spec.kind) {
    case "text":
      return (
        <Field label={spec.label} info={spec.help ? t(spec.help) : undefined}>
          {spec.multiline ? (
            <Textarea value={String(value ?? "")} maxLength={spec.max} rows={3} placeholder={spec.placeholder} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <Input value={String(value ?? "")} maxLength={spec.max} placeholder={spec.placeholder} onChange={(event) => onChange(event.target.value)} />
          )}
        </Field>
      );
    case "richtext":
      return (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t(spec.label)}</span>
          <RichTextEditor label={spec.label} value={String(value ?? "")} onChange={onChange} />
        </div>
      );
    case "url":
      return (
        <Field label={spec.label} info={spec.help ? t(spec.help) : undefined}>
          <UrlInput value={String(value ?? "")} placeholder={spec.placeholder} shortLinks={Boolean(spec.shortLinks)} onChange={onChange} />
        </Field>
      );
    case "color":
      return <ColorControl label={spec.label} value={typeof value === "string" ? value : null} fallback={spec.default} onChange={onChange} />;
    case "choice":
      return (
        <Field label={spec.label} info={spec.help ? t(spec.help) : undefined}>
          <Select value={String(value ?? spec.default)} options={spec.options.map((option) => ({ ...option }))} onValueChange={onChange} />
        </Field>
      );
    case "toggle":
      return <Toggle label={spec.label} checked={Boolean(value)} onChange={onChange} />;
    case "media": {
      const id = typeof value === "string" ? value : null;
      const ref = id ? media[id] : undefined;
      return (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t(spec.label)}</span>
          <MediaField
            value={id ? { id, url: ref && spec.accept === "image" ? ref.path : "", name: ref ? fileName(ref.path) : t("Missing file") } : null}
            accept={acceptByKind[spec.accept]}
            acceptLabel={acceptLabels[spec.accept]}
            removeLabel={t("Remove")}
            onChange={(item) => {
              if (item) onMedia(mediaRef(item));
              onChange(item?.id ?? null);
            }}
          />
        </div>
      );
    }
  }
}

function ListControl({
  spec,
  value,
  onChange,
  media,
  onMedia,
}: {
  spec: ListField;
  value: unknown;
  onChange: (value: unknown) => void;
  media: MediaRefs;
  onMedia: (ref: PageMediaRef) => void;
}) {
  const { t } = useI18n();
  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  function move(index: number, delta: -1 | 1) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{t(spec.label)}</span>
      {items.map((item, index) => (
        <div key={index} role="group" aria-label={`${t(spec.itemLabel)} ${index + 1}`} className="grid gap-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {t(spec.itemLabel)} {index + 1}
            </span>
            <span className="inline-flex gap-1">
              <IconAction label={t("Move up")} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp />
              </IconAction>
              <IconAction label={t("Move down")} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown />
              </IconAction>
              <IconAction
                label={t("Remove")}
                disabled={items.length <= spec.min}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                <Trash2 />
              </IconAction>
            </span>
          </div>
          <FieldsEditor
            fields={spec.item}
            values={item}
            media={media}
            onMedia={onMedia}
            onChange={(next) => onChange(items.map((current, position) => (position === index ? next : current)))}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={items.length >= spec.max}
        onClick={() => onChange([...items, defaultProps(spec.item)])}
      >
        <Plus /> {t("Add {item}", { item: t(spec.itemLabel) })}
      </Button>
    </div>
  );
}

export function ColorControl({
  label,
  value,
  fallback,
  onChange,
  clearable = true,
}: {
  label: string;
  value: string | null;
  fallback: string | null;
  onChange: (value: string | null) => void;
  clearable?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t("Pick {label}", { label: t(label) })}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-white p-1"
          value={value ?? fallback ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          value={text}
          placeholder={t("Not set")}
          maxLength={7}
          className="font-mono"
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(next);
            if (!next && clearable) onChange(null);
            else if (HEX_COLOR.test(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setText(value ?? "")}
        />
        {clearable ? (
          <IconAction label={t("Clear color")} disabled={value === null} onClick={() => onChange(null)}>
            <X />
          </IconAction>
        ) : null}
      </div>
    </Field>
  );
}

let shortLinkCache: Promise<string[]> | null = null;

function loadShortLinks(): Promise<string[]> {
  shortLinkCache ??= api<{ links?: { shortUrl: string }[] }>("/api/links?limit=200")
    .then((result) => (result.links ?? []).map((link) => link.shortUrl))
    .catch(() => {
      shortLinkCache = null;
      return [];
    });
  return shortLinkCache;
}

function UrlInput({
  value,
  placeholder,
  shortLinks,
  onChange,
}: {
  value: string;
  placeholder?: string;
  shortLinks: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!shortLinks) return;
    let cancelled = false;
    void loadShortLinks().then((urls) => {
      if (!cancelled) setOptions(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [shortLinks]);
  return (
    <>
      <Input value={value} placeholder={placeholder} list={shortLinks ? listId : undefined} inputMode="url" onChange={(event) => onChange(event.target.value)} />
      {shortLinks ? (
        <datalist id={listId}>
          {options.map((url) => (
            <option key={url} value={url} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function fileName(path: string): string {
  const last = path.split("/").pop() ?? path;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
