// @vitest-environment happy-dom

import { useState } from "react";
import type { FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { AiProposal, ChatBlock } from "@sharry/shared";
import { setActiveLocale } from "../i18n/index.tsx";
import { ChatConversation, chatToOpen, type ChatMessage } from "./chat.tsx";

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

describe("chat to open", () => {
  it("restores the stored chat, then the newest, and leaves a new chat blank", () => {
    expect(chatToOpen(["older", "newest"], "older", false)).toBe("older");
    expect(chatToOpen(["older", "newest"], "missing", false)).toBe("older");
    expect(chatToOpen(["older"], "older", true)).toBeNull();
    expect(chatToOpen([], "older", false)).toBeNull();
  });
});

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
    const destination = screen.getByRole("textbox", { name: "Destination" });
    const slug = screen.getByRole("textbox", { name: "Custom slug" });
    const suggest = screen.getByRole("button", { name: "Suggest a slug" });
    expect(destination).toBeTruthy();
    expect(slug.parentElement).toBe(suggest.parentElement);
    expect(suggest.hasAttribute("disabled")).toBe(true);
    fireEvent.change(destination, { target: { value: "https://ipstack.com/pricing/" } });
    expect(suggest.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("checkbox", { name: "Create a QR code" })).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "Report" }));
    const oneLink = screen.getByRole("option", { name: "One link" });
    fireEvent.pointerDown(oneLink, { button: 0 });
    fireEvent.pointerUp(oneLink, { button: 0 });
    fireEvent.click(oneLink);
    const list = screen.getByRole("combobox", { name: "Link" });
    fireEvent.click(list);
    expect(screen.getByRole("option", { name: "Spring (spring)" })).toBeTruthy();
  });

  it("hides the slug suggestion when AI is off", () => {
    const linkForm: ChatBlock = { type: "form", id: "form-1", form: "link", status: "pending" };
    renderConversation(false, [{ id: "m1", role: "assistant", content: "", proposal: null, blocks: [linkForm] }]);
    expect(screen.queryByRole("button", { name: "Suggest a slug" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Custom slug" })).toBeTruthy();
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
    const heading = screen.getByRole("heading", { name: "Weekly clicks" });
    const card = heading.closest("[data-slot=card]");
    expect(card?.getAttribute("data-slot")).toBe("card");
    expect(card?.querySelector("[data-slot=card]")).toBeNull();
    expect(card?.textContent).toContain("Spring");
    expect(document.querySelectorAll("[data-slot=card]")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open analytics" }).getAttribute("href")).toBe("/analytics");
  });

  it("shows a hint under each starter and a translated placeholder", () => {
    renderConversation(true);
    expect(screen.getByText("Destination, optional slug, and a QR code.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Message" }).getAttribute("placeholder")).toBe(
      "Ask about links, campaigns, or analytics",
    );
    expect(screen.getByText("Ask about links, campaigns, or the last 30 days")).toBeTruthy();
  });

  it("links an administrator to settings when AI is off", () => {
    render(
      <MemoryRouter>
        <ChatConversation
          admin
          available={false}
          messages={[]}
          draft=""
          sending={false}
          submittingForm={null}
          onDraft={() => {}}
          onSubmit={(event) => event.preventDefault()}
          onStarter={() => {}}
          onConfirm={() => {}}
          onDismiss={() => {}}
          onSubmitForm={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Open settings" }).getAttribute("href")).toBe("/admin/settings");
  });

  it("shows a writing placeholder and Stop while a reply is in progress", () => {
    render(
      <MemoryRouter>
        <ChatConversation
          available
          messages={[{ id: "user-1", role: "user", content: "Hello", proposal: null }]}
          draft=""
          sending
          submittingForm={null}
          onDraft={() => {}}
          onSubmit={(event) => event.preventDefault()}
          onStop={() => {}}
          onStarter={() => {}}
          onConfirm={() => {}}
          onDismiss={() => {}}
          onSubmitForm={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(screen.getByText("Writing…")).toBeTruthy();
  });

  it("shows a transcript placeholder while a chat is loading", () => {
    render(
      <MemoryRouter>
        <ChatConversation
          available
          loading
          messages={[]}
          draft=""
          sending={false}
          submittingForm={null}
          onDraft={() => {}}
          onSubmit={(event) => event.preventDefault()}
          onStarter={() => {}}
          onConfirm={() => {}}
          onDismiss={() => {}}
          onSubmitForm={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading chat")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create a short link" })).toBeNull();
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
