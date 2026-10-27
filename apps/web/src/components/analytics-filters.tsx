import { useState } from "react";
import type { AnalyticsOptions, LinkStat } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { FilterChip } from "./ui/filter-chip.tsx";
import { MultiSelect } from "./ui/multi-select.tsx";

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

const notSet = "Not set";

const labels: Record<(typeof filterKeys)[number], string> = {
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
  const [adding, setAdding] = useState<(typeof filterKeys)[number] | null>(null);
  const active = filterKeys.some((key) => params.get(key));

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
    setAdding(null);
  }

  const choices = optionMap(links, options);

  return (
    <div className="mb-4 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" aria-expanded={adding !== null} onClick={() => setAdding((current) => (current ? null : "link"))}>
          {t("Add filter")}
        </Button>
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
      {adding ? (
        <div className="flex flex-wrap items-end gap-2">
          {filterKeys.map((key) => (
            <Button key={key} type="button" size="sm" variant={adding === key ? "secondary" : "ghost"} onClick={() => setAdding(key)}>
              {t(labels[key])}
            </Button>
          ))}
          <MultiSelect
            label={t(labels[adding])}
            values={params.getAll(adding)}
            options={(choices[adding] ?? []).map((value) => ({
              value,
              label: adding === "link" ? linkLabel(links, value) : value === notSet ? t("Not set") : value,
            }))}
            onChange={(values) => setList(adding, values)}
          />
        </div>
      ) : null}
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
