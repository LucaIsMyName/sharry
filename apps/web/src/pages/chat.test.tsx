// @vitest-environment happy-dom

import { useState } from "react";
import type { FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { AiProposal, ChatBlock } from "@sharry/shared";
import { setActiveLocale } from "../i18n/index.tsx";
import { ChatConversation, type ChatMessage } from "./chat.tsx";

afterEach(() => {
  cleanup();
  setActiveLocale("en");
});

function renderConversation(
  available: boolean,
  messages: ChatMessage[] = [],
  draft = "",
  onSubmit: (event: FormEvent<HTMLFormElement>) => void = (event) => event.preventDefault(),
) {
  return render(
    <MemoryRouter>
      <ChatConversation
        available={available}
        messages={messages}
        draft={draft}
        sending={false}
        submittingForm={null}
        onDraft={() => {}}
        onSubmit={onSubmit}
        onStarter={() => {}}
        onConfirm={() => {}}
        onDismiss={() => {}}
        onSubmitForm={() => {}}
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

  it("shows the short-link form and an analytics link list", () => {
    const linkForm: ChatBlock = { type: "form", id: "form-1", form: "link", status: "pending" };
    const analyticsForm: ChatBlock = {
      type: "form",
      id: "form-2",
      form: "analytics",
      status: "pending",
      links: [{ id: "link-1", title: "Spring", slug: "spring" }],
    };
    renderConversation(true, [
      { id: "m1", role: "assistant", content: "", proposal: null, blocks: [linkForm] },
      { id: "m2", role: "assistant", content: "", proposal: null, blocks: [analyticsForm] },
    ]);
    expect(screen.getByRole("textbox", { name: "Destination" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Custom slug" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Create a QR code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "One link" }));
    const list = screen.getByRole("combobox", { name: "Link" });
    expect(list.textContent).toContain("Spring");
  });

  it("renders a heading and a table in the answer", () => {
    const table: ChatBlock = {
      type: "table",
      title: "Links",
      columns: ["Name", "Clicks"],
      rows: [["Spring", "3"]],
      path: "/analytics",
    };
    renderConversation(true, [
      {
        id: "m1",
        role: "assistant",
        content: "## Weekly clicks",
        proposal: null,
        blocks: [table],
      },
    ]);
    expect(screen.getByRole("heading", { name: "Weekly clicks" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Spring" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open analytics" }).getAttribute("href")).toBe("/analytics");
  });

  it("sends on Enter and keeps Shift+Enter in the composer", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
    function Harness() {
      const [draft, setDraft] = useState("Hello");
      return (
        <MemoryRouter>
          <ChatConversation
            available
            messages={[]}
            draft={draft}
            sending={false}
            submittingForm={null}
            onDraft={setDraft}
            onSubmit={onSubmit}
            onStarter={() => {}}
            onConfirm={() => {}}
            onDismiss={() => {}}
            onSubmitForm={() => {}}
          />
        </MemoryRouter>
      );
    }
    render(<Harness />);
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
