import { useEffect, useId, useRef, useState } from "react";
import type { AnalyticsOptions, LinkStat } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { FilterChip } from "./ui/filter-chip.tsx";
import { Input } from "./ui/input.tsx";

const filterKeys = [
  "link",
  "country",
  "browser",
  "os",
  "referrer",
  "device",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
] as const;

type FilterKey = (typeof filterKeys)[number];

const notSet = "Not set";

const labels: Record<FilterKey, string> = {
  link: "Links",
  country: "Country",
  browser: "Browser",
  os: "Operating system",
  referrer: "Referrers",
  device: "Devices",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_id: "utm_id",
  utm_term: "utm_term",
  utm_content: "utm_content",
};

export function AnalyticsFilters({
  params,
  links,
  options,
  onChange,
}: {
  params: URLSearchParams;
  links: LinkStat[];
  options?: AnalyticsOptions;
  onChange: (next: URLSearchParams) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FilterKey>("link");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = filterKeys.some((key) => params.get(key));

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function setList(key: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    onChange(next);
  }

  function remove(key: string, value: string) {
    setList(key, params.getAll(key).filter((item) => item !== value));
  }

  function clear() {
    const next = new URLSearchParams(params);
    for (const key of filterKeys) next.delete(key);
    onChange(next);
    setOpen(false);
  }

  function toggle(value: string, checked: boolean) {
    const current = params.getAll(category);
    const next = checked ? [...current, value] : current.filter((item) => item !== value);
    setList(category, [...new Set(next)]);
  }

  const choices = optionMap(links, options);
  const values = params.getAll(category);
  const shown = (choices[category] ?? [])
    .map((value) => ({
      value,
      label: category === "link" ? linkLabel(links, value) : value === notSet ? t("Not set") : value,
    }))
    .filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="mb-4 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative" ref={root}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            {t("Add filter")}
          </Button>
          {open ? (
            <div
              id={panelId}
              role="dialog"
              aria-label={t("Add filter")}
              className="absolute top-full left-0 z-30 mt-2 grid w-80 gap-2 rounded-md bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            >
              <div className="flex flex-wrap gap-1">
                {filterKeys.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={category === key ? "secondary" : "ghost"}
                    onClick={() => {
                      setCategory(key);
                      setQuery("");
                    }}
                  >
                    {t(labels[key])}
                  </Button>
                ))}
              </div>
              <Input
                value={query}
                placeholder="Search"
                aria-label={t("Search")}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="grid max-h-56 gap-1 overflow-auto">
                {shown.length === 0 ? (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("No data yet.")}</p>
                ) : (
                  shown.map((option) => (
                    <div key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <Checkbox
                        checked={values.includes(option.value)}
                        aria-label={option.label}
                        onCheckedChange={(checked) => toggle(option.value, checked === true)}
                      />
                      <span className="truncate text-sm">{option.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
        {filterKeys.flatMap((key) =>
          params.getAll(key).map((value) => (
            <FilterChip
              key={`${key}:${value}`}
              label={`${t(labels[key])}: ${chipLabel(key, value, links, t)}`}
              onRemove={() => remove(key, value)}
            />
          )),
        )}
        {active ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            {t("Clear filters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function optionMap(links: LinkStat[], options?: AnalyticsOptions): Record<string, string[]> {
  return {
    link: links.map((link) => link.id),
    country: options?.countries ?? [],
    browser: options?.browsers ?? [],
    os: options?.operatingSystems ?? [],
    referrer: options?.referrers ?? [],
    device: options?.devices ?? [],
    utm_source: options?.utmSources ?? [],
    utm_medium: options?.utmMediums ?? [],
    utm_campaign: options?.utmCampaigns ?? [],
    utm_id: options?.utmIds ?? [],
    utm_term: options?.utmTerms ?? [],
    utm_content: options?.utmContents ?? [],
  };
}

function linkLabel(links: LinkStat[], id: string): string {
  const link = links.find((item) => item.id === id);
  return link?.title?.trim() || link?.slug || id;
}

function chipLabel(key: string, value: string, links: LinkStat[], translate: (message: string) => string): string {
  if (key === "link") return linkLabel(links, value);
  if (value === notSet) return translate("Not set");
  return value;
}
