import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { RoutingRule } from "@sharry/shared";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";

export function RouteSuggest({ onAppend }: { onAppend: (rules: RoutingRule[]) => void }) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!instruction.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await api<{ rules: RoutingRule[] }>("/api/ai/suggest-routes", {
        method: "POST",
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      if (result.rules.length === 0) {
        setError("Could not draft routes from that sentence.");
        return;
      }
      onAppend(result.rules);
      setInstruction("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not draft routes from that sentence.");
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Input
        className="min-w-48 flex-1 basis-64"
        aria-label="Describe who should go where"
        value={instruction}
        placeholder="iPhone visitors go to https://apps.example.com, Germany goes to https://example.com/de"
        onChange={(event) => setInstruction(event.target.value)}
      />
      <Button type="button" variant="outline" disabled={!instruction.trim() || pending} onClick={() => void submit()}>
        <Sparkles /> {pending ? t("Drafting…") : t("Draft routes")}
      </Button>
      {error ? <p className="basis-full text-sm text-destructive">{t(error)}</p> : null}
    </>
  );
}
