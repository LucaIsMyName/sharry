import { useEffect, useState } from "react";
import { aiIsAvailable, aiModelCatalog, customAiModel, type AiProvider } from "@sharry/shared";
import { api } from "../api.ts";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { useI18n } from "../i18n/index.tsx";
import { ClickChart } from "./analytics.tsx";

export type AiFormSettings = {
  aiProvider: "" | AiProvider;
  aiModel: string;
  aiBaseUrl: string;
  aiApiKeySet: boolean;
  aiEnabled: boolean;
};

export function AiSettingsCard<T extends AiFormSettings>({
  settings,
  apiKey,
  clearKey,
  testing,
  onChange,
  onApiKey,
  onClearKey,
  onTest,
}: {
  settings: T;
  apiKey: string;
  clearKey: boolean;
  testing: boolean;
  onChange: (settings: T) => void;
  onApiKey: (value: string) => void;
  onClearKey: (value: boolean) => void;
  onTest: () => void;
}) {
  const { t } = useI18n();
  const provider = settings.aiProvider;
  const catalog =
    provider === "openai" || provider === "anthropic" || provider === "google" || provider === "mistral"
      ? aiModelCatalog[provider]
      : [];
  const modelIsKnown = catalog.some((item) => item.id === settings.aiModel);
  const modelChoice = modelIsKnown ? settings.aiModel : customAiModel;
  const canTest = aiIsAvailable({
    provider,
    model: settings.aiModel,
    baseUrl: settings.aiBaseUrl,
    apiKeySet: Boolean(apiKey.trim()) || (settings.aiApiKeySet && !clearKey),
  });
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-lg font-medium">{t("AI")}</h2>
        {provider ? (
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={settings.aiEnabled}
                aria-label={t("AI active")}
                onCheckedChange={(checked) => onChange({ ...settings, aiEnabled: checked === true })}
              />
              <span className="text-sm">{t("AI active")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("Turn this off to pause AI everywhere. The provider, model, and API key stay saved.")}
            </p>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {t(
            "The assistant uses this provider for every signed-in user. The API key is encrypted and is not shown again. Test connection checks the values in this form and does not save them.",
          )}
        </p>
        <Field label="Provider">
          <Select
            value={provider || "off"}
            onValueChange={(value) => {
              const aiProvider = value === "off" ? "" : (value as AiProvider);
              const aiModel =
                aiProvider === "openai" ||
                aiProvider === "anthropic" ||
                aiProvider === "google" ||
                aiProvider === "mistral"
                  ? (aiModelCatalog[aiProvider][0]?.id ?? "")
                  : "";
              onChange({
                ...settings,
                aiProvider,
                aiModel,
                aiBaseUrl: aiProvider === "openai_compatible" ? settings.aiBaseUrl : "",
              });
              onApiKey("");
              onClearKey(false);
            }}
            options={[
              { value: "off", label: "Off" },
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
              { value: "google", label: "Google Gemini" },
              { value: "mistral", label: "Mistral" },
              { value: "openai_compatible", label: "OpenAI-compatible" },
            ]}
          />
        </Field>
        {provider === "openai_compatible" ? (
          <Field label="Base URL">
            <Input
              value={settings.aiBaseUrl}
              onChange={(event) => onChange({ ...settings, aiBaseUrl: event.target.value })}
              placeholder="https://example.com/v1"
              autoComplete="off"
            />
          </Field>
        ) : null}
        {catalog.length > 0 ? (
          <Field label="Model">
            <Select
              value={modelChoice}
              onValueChange={(value) =>
                onChange({
                  ...settings,
                  aiModel: value === customAiModel ? (modelIsKnown ? "" : settings.aiModel) : value,
                })
              }
              options={[
                ...catalog.map((item) => ({ value: item.id, label: item.label })),
                { value: customAiModel, label: "Custom model" },
              ]}
            />
          </Field>
        ) : null}
        {provider && (provider === "openai_compatible" || modelChoice === customAiModel) ? (
          <Field label="Model id">
            <Input
              value={settings.aiModel}
              onChange={(event) => onChange({ ...settings, aiModel: event.target.value })}
              autoComplete="off"
            />
          </Field>
        ) : null}
        {provider ? (
          <Field label="API key">
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => {
                onApiKey(event.target.value);
                onClearKey(false);
              }}
              autoComplete="new-password"
              placeholder={
                clearKey
                  ? t("The saved key will be removed.")
                  : settings.aiApiKeySet
                    ? t("Saved. Leave blank to keep it.")
                    : t("Required")
              }
            />
          </Field>
        ) : null}
        {provider && settings.aiApiKeySet ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClearKey(!clearKey);
              onApiKey("");
            }}
          >
            {clearKey ? t("Keep saved key") : t("Clear saved key")}
          </Button>
        ) : null}
        {provider ? (
          <Button type="button" variant="outline" disabled={!canTest || testing} onClick={onTest}>
            {testing ? t("Testing…") : t("Test connection")}
          </Button>
        ) : null}
        <AiUsagePanel />
      </CardContent>
    </Card>
  );
}

const featureLabels: Record<string, string> = {
  chat: "Chat",
  "suggest-utm": "Suggest UTM",
  "suggest-routes": "Draft routes",
  summarize: "Summarize",
  "suggest-variants": "Draft variants",
  "suggest-links": "Add several",
};

function AiUsagePanel() {
  const { t } = useI18n();
  const [usage, setUsage] = useState<{
    totalTokens: number;
    series: { date: string; clicks: number }[];
    features: { name: string; tokens: number }[];
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api<{
      totalTokens: number;
      series: { date: string; clicks: number }[];
      features: { name: string; tokens: number }[];
    }>("/api/admin/ai-usage")
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!usage) return null;
  return (
    <div className="grid gap-3 border-t border-border pt-3">
      <h3 className="font-medium">{t("Tokens")}</h3>
      <p className="text-sm text-muted-foreground">{t("{count} tokens", { count: usage.totalTokens })}</p>
      <ClickChart series={usage.series} metric="Tokens" />
      {usage.features.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="font-medium">{t("Tokens by feature")}</h3>
          {usage.features.map((feature) => (
            <div key={feature.name} className="flex items-center justify-between gap-3 text-sm">
              <span>{t(featureLabels[feature.name] ?? feature.name)}</span>
              <b className="tabular-nums">{feature.tokens}</b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
