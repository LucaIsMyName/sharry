// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiSettingsCard, type AiFormSettings } from "./ai-settings-card.tsx";

afterEach(() => {
  cleanup();
});

function settings(overrides: Partial<AiFormSettings> = {}): AiFormSettings {
  return {
    aiProvider: "openai",
    aiModel: "gpt-4.1-mini",
    aiBaseUrl: "",
    aiApiKeySet: false,
    ...overrides,
  };
}

function renderCard(props: { form?: AiFormSettings; apiKey?: string; clearKey?: boolean } = {}) {
  return render(
    <AiSettingsCard
      settings={props.form ?? settings()}
      apiKey={props.apiKey ?? ""}
      clearKey={props.clearKey ?? false}
      testing={false}
      onChange={() => {}}
      onApiKey={() => {}}
      onClearKey={() => {}}
      onTest={() => {}}
    />,
  );
}

describe("AI settings card", () => {
  it("enables Test connection when a key is typed and nothing is saved", () => {
    renderCard({ apiKey: "sk-live" });
    expect(screen.getByRole("button", { name: "Test connection" }).hasAttribute("disabled")).toBe(false);
  });

  it("keeps Test connection disabled until a key is available", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "Test connection" }).hasAttribute("disabled")).toBe(true);
  });

  it("enables Test connection for a saved key when the field is blank", () => {
    renderCard({ form: settings({ aiApiKeySet: true }) });
    expect(screen.getByRole("button", { name: "Test connection" }).hasAttribute("disabled")).toBe(false);
  });
});
