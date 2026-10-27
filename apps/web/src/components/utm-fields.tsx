import { useEffect, useState } from "react";
import { UTM_KEYS, emptyUtmPresets, type UtmParams, type UtmPresets } from "@sharry/shared";
import { api, type PublicSettings } from "../api.ts";
import { t } from "../i18n/translate.ts";
import { Select } from "./ui/choice-select.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";

export function UtmFields({
  utm,
  onChange,
  presets,
}: {
  utm: UtmParams;
  onChange: (utm: UtmParams) => void;
  presets?: UtmPresets;
}) {
  const loaded = useUtmPresets(presets);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {UTM_KEYS.map((key) => {
        const options = loaded[key] ?? [];
        const current = utm[key] ?? "";
        const choices = current && !options.includes(current) ? [current, ...options] : options;
        return (
          <Field key={key} label={key}>
            {options.length > 0 ? (
              <Select
                value={current}
                placeholder="Not set"
                options={[{ value: "", label: t("Not set") }, ...choices.map((value) => ({ value, label: value }))]}
                onValueChange={(value) => onChange({ ...utm, [key]: value })}
              />
            ) : (
              <Input
                value={current}
                onChange={(event) => onChange({ ...utm, [key]: event.target.value })}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

function useUtmPresets(given: UtmPresets | undefined): UtmPresets {
  const [presets, setPresets] = useState<UtmPresets>(given ?? emptyUtmPresets());
  useEffect(() => {
    if (given) {
      setPresets(given);
      return;
    }
    let cancelled = false;
    void api<PublicSettings>("/api/settings/public")
      .then((settings) => {
        if (!cancelled && settings.utmPresets) setPresets(settings.utmPresets);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [given]);
  return presets;
}

export function utmSummary(utm: UtmParams): string {
  const parts = UTM_KEYS.flatMap((key) => {
    const value = utm[key];
    return typeof value === "string" && value.trim() ? [`${key}=${value.trim()}`] : [];
  });
  return parts.length > 0 ? parts.join(", ") : t("Inherits the link’s UTM values");
}
