// @vitest-environment happy-dom

import { useState } from "react";
import type { FormEvent } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { AiProposal, ChatBlock } from "@sharry/shared";
import { api } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { addDays, dayNumber, initialWindow, utcToday } from "./analytics-range.ts";
import { ChatConversation, ChatList, chatToOpen, type ChatMessage } from "./chat.tsx";

vi.mock("../api.ts", async () => {
  const actual = await vi.importActual<typeof import("../api.ts")>("../api.ts");
  return { ...actual, api: vi.fn() };
});

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.clearAllMocks();
});

function renderConversation(
  available: boolean,
  messages: ChatMessage[] = [],
  draft = "",
  onSubmit: (event: FormEvent<HTMLFormElement>) => void = (event) => event.preventDefault(),
  onSubmitForm: (formId: string, body: Record<string, unknown>) => void = () => {},
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
        onSubmitForm={onSubmitForm}
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

describe("chat list", () => {
  const chats = [
    { id: "c1", title: "Spring launch", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    { id: "c2", title: "New chat", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ];

  function renderList(tone: "page" | "sidebar", onDelete: (id: string) => void = () => {}) {
    return render(
      <MemoryRouter initialEntries={["/chat/c1"]}>
        <ChatList chats={chats} loading={false} tone={tone} onNew={() => {}} onPick={() => {}} onDelete={onDelete} />
      </MemoryRouter>,
    );
  }

  it("shows chats as divided rows without card styling and marks the open chat", () => {
    renderList("page");
    const rows = document.querySelectorAll("[data-slot=chat-row]");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.className).toContain("border-b");
      expect(row.className).not.toContain("rounded");
      expect(row.className).not.toContain("shadow");
    }
    expect(rows[0]?.className).toContain("bg-muted");
    expect(rows[1]?.className).not.toContain("bg-muted ");
    expect(screen.getByRole("link", { name: /New chat/ })).toBeTruthy();
  });

  it("uses sidebar borders in the sheet and deletes the picked chat", () => {
    const onDelete = vi.fn();
    renderList("sidebar", onDelete);
    const rows = document.querySelectorAll("[data-slot=chat-row]");
    expect(rows[0]?.className).toContain("border-sidebar-border");
    expect(rows[0]?.className).toContain("bg-sidebar-accent");
    const deletes = screen.getAllByRole("button", { name: "Delete chat" });
    expect(deletes).toHaveLength(2);
    fireEvent.click(deletes[1]!);
    expect(onDelete).toHaveBeenCalledWith("c2");
  });

  it("shows a skeleton instead of rows while loading", () => {
    render(
      <MemoryRouter>
        <ChatList chats={chats} loading tone="page" onNew={() => {}} onPick={() => {}} onDelete={() => {}} />
      </MemoryRouter>,
    );
    expect(document.querySelectorAll("[data-slot=chat-row]")).toHaveLength(0);
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

  it("renames the open chat and keeps the field when saving fails", async () => {
    const onRename = vi.fn(async (title: string) => {
      if (title === "Nope") throw new Error("no");
    });
    render(
      <MemoryRouter>
        <ChatConversation
          title="Spring launch"
          name="Spring launch"
          available
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
          onRename={onRename}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    const field = screen.getByRole("textbox", { name: "Chat name" });
    expect(field).toHaveProperty("value", "Spring launch");
    fireEvent.change(field, { target: { value: "Autumn plan" } });
    fireEvent.blur(field);
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Autumn plan"));
    expect(screen.queryByRole("textbox", { name: "Chat name" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    const again = screen.getByRole("textbox", { name: "Chat name" });
    fireEvent.change(again, { target: { value: "   " } });
    fireEvent.blur(again);
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox", { name: "Chat name" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename chat" }));
    const failing = screen.getByRole("textbox", { name: "Chat name" });
    fireEvent.change(failing, { target: { value: "Nope" } });
    fireEvent.blur(failing);
    await waitFor(() => expect(onRename).toHaveBeenCalledWith("Nope"));
    expect(screen.getByRole("textbox", { name: "Chat name" })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Chat name" }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "Chat name" })).toBeNull();
    expect(onRename).toHaveBeenCalledTimes(2);
  });

  it("lists starters as plain rows and scrolls the truncated title with the thread", () => {
    render(
      <MemoryRouter>
        <ChatConversation
          title={"A very long chat title ".repeat(10)}
          available
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
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.className).toContain("truncate");
    expect(title.closest("[aria-live=polite]")).not.toBeNull();
    const starter = screen.getByRole("button", { name: "Create a short link" });
    expect(starter.closest("li")?.className).toContain("border-b");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(document.querySelector("[data-slot=card]")).toBeNull();
  });

  it("shows the AI notice without a card", () => {
    renderConversation(false);
    expect(screen.getByRole("heading", { name: "AI not available" }).closest("[data-slot=card]")).toBeNull();
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
    expect(link.className.includes("underline")).toBe(false);
    expect(link.className.includes("inline-flex")).toBe(true);
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
    const title = screen.getByRole("textbox", { name: "Title" });
    const slug = screen.getByRole("textbox", { name: "Custom slug" });
    const suggestTitle = screen.getByRole("button", { name: "Suggest a title" });
    const suggest = screen.getByRole("button", { name: "Suggest a slug" });
    expect(destination).toBeTruthy();
    expect(title.parentElement).toBe(suggestTitle.parentElement);
    expect(slug.parentElement).toBe(suggest.parentElement);
    expect(suggest.hasAttribute("disabled")).toBe(true);
    expect(suggestTitle.hasAttribute("disabled")).toBe(true);
    fireEvent.change(destination, { target: { value: "https://ipstack.com/pricing/" } });
    expect(suggest.hasAttribute("disabled")).toBe(false);
    expect(suggestTitle.hasAttribute("disabled")).toBe(false);
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
    expect(screen.queryByRole("button", { name: "Suggest a title" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Custom slug" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
  });

  it("fills the title from the page suggestion", async () => {
    vi.mocked(api).mockResolvedValue({ slug: "pricing-ipstack", title: "Pricing | ipstack", fromTitle: true });
    const linkForm: ChatBlock = { type: "form", id: "form-1", form: "link", status: "pending" };
    renderConversation(true, [{ id: "m1", role: "assistant", content: "", proposal: null, blocks: [linkForm] }]);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://ipstack.com/pricing/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest a title" }));
    expect(await screen.findByDisplayValue("Pricing | ipstack")).toBeTruthy();
    expect(await screen.findByText("Suggested from the page title.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-slug", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://ipstack.com/pricing/" }),
    });
  });

  it("shows a failed slug suggestion in the slug tooltip", async () => {
    vi.mocked(api).mockResolvedValue({ slug: null, title: "", fromTitle: false });
    const linkForm: ChatBlock = { type: "form", id: "form-1", form: "link", status: "pending" };
    renderConversation(true, [{ id: "m1", role: "assistant", content: "", proposal: null, blocks: [linkForm] }]);
    fireEvent.change(screen.getByRole("textbox", { name: "Destination" }), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suggest a slug" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("Could not suggest a slug for that page.");
    expect([...document.body.querySelectorAll("p")].some((node) => node.textContent === "Could not suggest a slug for that page.")).toBe(false);
    expect(api).toHaveBeenCalledWith("/api/ai/suggest-slug", {
      method: "POST",
      body: JSON.stringify({ destinationUrl: "https://example.com" }),
    });
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
    expect(heading.closest("[data-slot=card]")).toBeNull();
    expect(heading.parentElement?.parentElement?.textContent).toContain("Spring");
    expect(document.querySelectorAll("[data-slot=card]")).toHaveLength(0);
    const open = screen.getByRole("link", { name: "Open analytics" });
    expect(open.getAttribute("href")).toBe("/analytics");
    expect(open.className.includes("underline")).toBe(false);
    expect(open.className.includes("inline-flex")).toBe(true);
    expect(screen.queryByRole("button", { name: "Export to PDF" })).toBeNull();
  });

  it("shows a hint under each starter and a translated placeholder", () => {
    renderConversation(true);
    expect(screen.getByText("Destination, optional title, slug, UTM, and a QR code.")).toBeTruthy();
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

  it("draws browser bars, skips an empty country group, and exports a pdf", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const chart: ChatBlock = {
      type: "chart",
      title: "Clicks",
      series: [{ date: "2026-10-01", clicks: 2 }],
      path: "/analytics",
    };
    const browsers: ChatBlock = {
      type: "bars",
      title: "Browsers",
      rows: [{ name: "Chrome", clicks: 2 }],
      path: "/analytics",
    };
    const countries: ChatBlock = {
      type: "bars",
      title: "Countries",
      rows: [],
      path: "/analytics",
    };
    renderConversation(true, [
      {
        id: "m1",
        role: "assistant",
        content: "From 2026-10-01 to 2026-10-02: 2 clicks.",
        proposal: null,
        blocks: [chart, browsers, countries],
      },
    ]);
    expect(screen.getByRole("heading", { name: "Browsers" })).toBeTruthy();
    expect(screen.getByText("Chrome")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Countries" })).toBeNull();
    const open = screen.getByRole("link", { name: "Open analytics" });
    expect(open.className.includes("underline")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Export to PDF" }));
    expect(create).toHaveBeenCalled();
    create.mockRestore();
  });

  it("starts the date track on the link creation day and submits both ends", () => {
    const today = utcToday();
    const earliest = addDays(today, -800);
    const created = addDays(today, -10);
    const onSubmitForm = vi.fn();
    const analyticsForm: ChatBlock = {
      type: "form",
      id: "form-range",
      form: "analytics",
      status: "pending",
      earliestCreatedAt: earliest,
      links: [{ id: "link-1", title: "Spring", slug: "spring", createdAt: created }],
    };
    renderConversation(
      true,
      [{ id: "m1", role: "assistant", content: "", proposal: null, blocks: [analyticsForm] }],
      "",
      (event) => event.preventDefault(),
      onSubmitForm,
    );
    const start = screen.getByRole("slider", { name: "Start date" }) as HTMLInputElement;
    expect(start.min).toBe(String(dayNumber(earliest)));
    fireEvent.click(screen.getByRole("combobox", { name: "Report" }));
    const oneLink = screen.getByRole("option", { name: "One link" });
    fireEvent.pointerDown(oneLink, { button: 0 });
    fireEvent.pointerUp(oneLink, { button: 0 });
    fireEvent.click(oneLink);
    fireEvent.click(screen.getByRole("combobox", { name: "Link" }));
    const spring = screen.getByRole("option", { name: "Spring (spring)" });
    fireEvent.pointerDown(spring, { button: 0 });
    fireEvent.pointerUp(spring, { button: 0 });
    fireEvent.click(spring);
    const moved = screen.getByRole("slider", { name: "Start date" }) as HTMLInputElement;
    expect(moved.min).toBe(String(dayNumber(created)));
    expect(moved.value).toBe(String(dayNumber(created)));
    fireEvent.click(screen.getByRole("button", { name: "Show report" }));
    expect(onSubmitForm).toHaveBeenCalledWith("form-range", {
      scope: "link",
      linkId: "link-1",
      from: created,
      to: today,
    });
  });

  it("asks to narrow a range longer than 400 days", () => {
    const today = utcToday();
    const earliest = addDays(today, -800);
    const analyticsForm: ChatBlock = {
      type: "form",
      id: "form-long",
      form: "analytics",
      status: "pending",
      earliestCreatedAt: earliest,
      prefill: { from: earliest, to: today },
      links: [],
    };
    renderConversation(true, [{ id: "m1", role: "assistant", content: "", proposal: null, blocks: [analyticsForm] }]);
    expect(screen.getByText("Choose a range of 400 days or fewer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show report" }).hasAttribute("disabled")).toBe(true);
    const start = screen.getByRole("slider", { name: "Start date" });
    fireEvent.change(start, { target: { value: String(dayNumber(addDays(today, -10))) } });
    expect(screen.getByText(addDays(today, -10))).toBeTruthy();
    expect(screen.getByText("Choose a range of 400 days or fewer")).toBeTruthy();
    fireEvent.pointerUp(start);
    expect(screen.queryByText("Choose a range of 400 days or fewer")).toBeNull();
    expect(screen.getByRole("button", { name: "Show report" }).hasAttribute("disabled")).toBe(false);
    expect(initialWindow(earliest, today, earliest, today).from).toBe(earliest);
  });
});
