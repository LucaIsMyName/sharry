// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import type { AiProposal } from "@sharry/shared";
import { setActiveLocale } from "../i18n/index.tsx";
import { ChatConversation, type ChatMessage } from "./chat.tsx";

afterEach(() => {
  cleanup();
  setActiveLocale("en");
});

function renderConversation(available: boolean, messages: ChatMessage[] = []) {
  return render(
    <MemoryRouter>
      <ChatConversation
        available={available}
        messages={messages}
        draft=""
        sending={false}
        onDraft={() => {}}
        onSubmit={(event) => event.preventDefault()}
        onStarter={() => {}}
        onConfirm={() => {}}
        onDismiss={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("chat conversation", () => {
  it("offers three starters on a blank chat", () => {
    renderConversation(true);
    expect(screen.getByRole("button", { name: "Create a short link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create a campaign" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Analytics report" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" }).hasAttribute("disabled")).toBe(false);
  });

  it("hides starters and disables the composer when AI is not available", () => {
    renderConversation(false);
    expect(screen.getByRole("heading", { name: "AI not available" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create a short link" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Message" }).hasAttribute("disabled")).toBe(true);
  });

  it("links a confirmed short link card to the new link", () => {
    const proposal: AiProposal = {
      id: "proposal-1",
      tool: "propose_link",
      args: { destinationUrl: "https://example.com" },
      status: "confirmed",
      result: { path: "/links/link-1", shortUrl: "http://127.0.0.1:3000/s/abc" },
    };
    renderConversation(false, [
      { id: "m1", role: "assistant", content: "Created.", proposal },
    ]);
    const link = screen.getByRole("link", { name: "Open link" });
    expect(link.getAttribute("href")).toBe("/links/link-1");
  });
});
