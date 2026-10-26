import { useState } from "react";
import { Sparkles } from "lucide-react";
import { destinationSchema, type UtmParams } from "@sharry/shared";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { Field } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";

export function UtmSuggest({
  aiAvailable,
  destinationUrl,
  onApply,
}: {
  aiAvailable: boolean;
  destinationUrl: string;
  onApply: (utm: UtmParams) => void;
}) {
  const { t } = useI18n();
  const [placement, setPlacement] = useState("");
  const [pending, setPending] = useState(false);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  if (!aiAvailable) return null;
  const ready = destinationSchema.safeParse(destinationUrl).success;
  async function suggest() {
    if (!ready || pending) return;
    setPending(true);
    setError("");
    setHint(false);
    try {
      const result = await api<{ utm: UtmParams }>("/api/ai/suggest-utm", {
        method: "POST",
        body: JSON.stringify({
          destinationUrl,
          ...(placement.trim() ? { placement: placement.trim() } : {}),
        }),
      });
      onApply(result.utm);
      setHint(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not suggest UTM values for that page.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label="Where will you share this?">
            <Input
              value={placement}
              placeholder="October newsletter"
              onChange={(event) => {
                setPlacement(event.target.value);
                setHint(false);
              }}
            />
          </Field>
        </div>
        <Button type="button" variant="outline" disabled={!ready || pending} onClick={() => void suggest()}>
          <Sparkles /> {pending ? t("Suggesting…") : t("Suggest UTM")}
        </Button>
      </div>
      {hint ? <p className="text-sm text-muted-foreground">{t("Suggested from the page.")}</p> : null}
      {error ? <p className="text-sm text-destructive">{t(error)}</p> : null}
    </div>
  );
}
