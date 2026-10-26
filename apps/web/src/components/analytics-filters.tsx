import type { AnalyticsOptions, LinkStat } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { MultiSelect } from "./ui/multi-select.tsx";

const filterKeys = [
  "link",
  "from",
  "to",
  "country",
  "browser",
  "os",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
] as const;

const notSet = "Not set";

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
  const active = filterKeys.some((key) => params.get(key));

  function setList(key: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    onChange(next);
  }

  function setDay(key: "from" | "to", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    onChange(next);
  }

  function clear() {
    const next = new URLSearchParams(params);
    for (const key of filterKeys) next.delete(key);
    onChange(next);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <MultiSelect
        label={t("Links")}
        values={params.getAll("link")}
        options={links.map((link) => ({ value: link.id, label: link.title?.trim() || link.slug }))}
        onChange={(values) => setList("link", values)}
      />
      <div className="w-40">
        <Field label="From">
          <Input type="date" value={params.get("from") ?? ""} onChange={(event) => setDay("from", event.target.value)} />
        </Field>
      </div>
      <div className="w-40">
        <Field label="To">
          <Input type="date" value={params.get("to") ?? ""} onChange={(event) => setDay("to", event.target.value)} />
        </Field>
      </div>
      <DimensionSelect label={t("Country")} param="country" params={params} values={options?.countries ?? []} onChange={setList} />
      <DimensionSelect label={t("Browser")} param="browser" params={params} values={options?.browsers ?? []} onChange={setList} />
      <DimensionSelect
        label={t("Operating system")}
        param="os"
        params={params}
        values={options?.operatingSystems ?? []}
        onChange={setList}
      />
      <DimensionSelect label="utm_source" param="utm_source" params={params} values={options?.utmSources ?? []} onChange={setList} />
      <DimensionSelect label="utm_medium" param="utm_medium" params={params} values={options?.utmMediums ?? []} onChange={setList} />
      <DimensionSelect label="utm_campaign" param="utm_campaign" params={params} values={options?.utmCampaigns ?? []} onChange={setList} />
      <DimensionSelect label="utm_id" param="utm_id" params={params} values={options?.utmIds ?? []} onChange={setList} />
      <DimensionSelect label="utm_term" param="utm_term" params={params} values={options?.utmTerms ?? []} onChange={setList} />
      <DimensionSelect label="utm_content" param="utm_content" params={params} values={options?.utmContents ?? []} onChange={setList} />
      {active ? (
        <Button type="button" variant="ghost" onClick={clear}>
          {t("Clear filters")}
        </Button>
      ) : null}
    </div>
  );
}

function DimensionSelect({
  label,
  param,
  params,
  values,
  onChange,
}: {
  label: string;
  param: string;
  params: URLSearchParams;
  values: string[];
  onChange: (key: string, values: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <MultiSelect
      label={label}
      values={params.getAll(param)}
      options={values.map((value) => ({ value, label: value === notSet ? t("Not set") : value }))}
      onChange={(next) => onChange(param, next)}
    />
  );
}
