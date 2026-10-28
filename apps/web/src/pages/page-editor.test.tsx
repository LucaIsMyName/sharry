// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Link, Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { createBlock, defaultPageSettings, type PageContent } from "@sharry/shared";
import { api, type LandingPage } from "../api.ts";
import { ToastProvider } from "../components/ui/toast.tsx";
import { PageEditorPage } from "./page-editor.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

function content(): PageContent {
  const heading = createBlock("heading", () => "h1");
  heading.props = { ...heading.props, text: "Hello" };
  return { blocks: [heading, createBlock("button", () => "b1")] };
}

function fixture(overrides: Partial<LandingPage> = {}): LandingPage {
  return {
    id: "p1",
    title: "Spring",
    slug: "spring",
    url: "https://s.example/l/spring",
    status: "draft",
    hidden: true,
    publishedAt: null,
    folderId: null,
    redirectDomainId: null,
    userId: "u1",
    owner: { username: "ada", role: "user" } as LandingPage["owner"],
    canEdit: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    settings: defaultPageSettings,
    content: content(),
    media: {},
    ...overrides,
  };
}

type Init = RequestInit | undefined;

function installApi(page: LandingPage) {
  vi.mocked(api).mockImplementation(async (path: string, init?: Init) => {
    if (path === "/api/pages/p1" && !init?.method) return page;
    if (path === "/api/pages/p1" && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body ?? "{}")) as Partial<LandingPage>;
      return { ...page, ...body, status: page.publishedAt ? "changed" : "draft" };
    }
    if (path === "/api/pages/p1/publish") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Partial<LandingPage>;
      return { ...page, ...body, hidden: false, status: "published", publishedAt: "2026-01-02T00:00:00.000Z" };
    }
    return {};
  });
}

function renderEditor() {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Link to="/pages">Back to pages</Link>
            <Outlet />
          </>
        ),
        children: [
          { path: "/pages", element: <p>Page overview</p> },
          { path: "/pages/:id", element: <PageEditorPage /> },
        ],
      },
    ],
    { initialEntries: ["/pages/p1"] },
  );
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

function calls(method: string, path: string) {
  return vi.mocked(api).mock.calls.filter(([url, init]) => url === path && (init as Init)?.method === method);
}

function sentBody(method: string, path: string): Record<string, unknown> {
  const call = calls(method, path).at(-1);
  return JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
}

async function editHeading(text: string) {
  fireEvent.click(await screen.findByTestId("block-h1"));
  const input = await screen.findByDisplayValue("Hello");
  fireEvent.change(input, { target: { value: text } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("page editor", () => {
  it("edits a block in the inspector and shows it in the preview before saving", async () => {
    installApi(fixture());
    renderEditor();
    const save = await screen.findByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Unsaved").className).toContain("invisible");

    await editHeading("Spring sale");
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("Unsaved").className).not.toContain("invisible");
    const frame = screen.getByTitle("Page preview");
    await waitFor(() => expect(frame.getAttribute("srcdoc")).toContain("Spring sale"));
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame.getAttribute("srcdoc")).not.toContain("<script");
  });

  it("saves the draft, then publishes it and shows the new status", async () => {
    installApi(fixture());
    renderEditor();
    expect(await screen.findByText("Draft")).toBeTruthy();
    await editHeading("Launch day");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", "/api/pages/p1")).toHaveLength(1));
    const saved = sentBody("PATCH", "/api/pages/p1") as { content: PageContent; hidden: boolean };
    expect(saved.content.blocks[0]?.props.text).toBe("Launch day");
    expect(saved.hidden).toBe(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(calls("POST", "/api/pages/p1/publish")).toHaveLength(1));
    expect(sentBody("POST", "/api/pages/p1/publish").hidden).toBeUndefined();
    expect(await screen.findByText("Published")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish changes" }).hasAttribute("disabled")).toBe(true));
  });

  it("saves with Cmd+S", async () => {
    installApi(fixture());
    renderEditor();
    await editHeading("Shortcut");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => expect(calls("PATCH", "/api/pages/p1")).toHaveLength(1));
  });

  it("reorders blocks and adds a new one from the block list", async () => {
    installApi(fixture());
    renderEditor();
    const heading = await screen.findByTestId("block-h1");
    fireEvent.click(within(heading).getByRole("button", { name: "Move down" }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")[0]?.getAttribute("data-testid")).toBe("block-b1"));

    const addButtons = screen.getAllByRole("button", { name: "Add block" });
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: /Divider/ }));
    await waitFor(() => expect(screen.getAllByRole("treeitem")).toHaveLength(3));
    expect(screen.getByRole("heading", { name: "Divider" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", "/api/pages/p1")).toHaveLength(1));
    const saved = sentBody("PATCH", "/api/pages/p1") as { content: PageContent };
    expect(saved.content.blocks.map((block) => block.type)).toEqual(["button", "heading", "divider"]);
  });

  it("lets nested block rows shrink so a long label cannot push the block list under the preview", async () => {
    const text = createBlock("text", () => "t1");
    text.props = { ...text.props, html: `<p>${"A very long sentence ".repeat(10)}</p>` };
    const columns = createBlock("columns", () => "c2");
    columns.slots = { left: [text], right: [] };
    const section = createBlock("container", () => "c1");
    section.slots = { children: [columns] };
    installApi(fixture({ content: { blocks: [section] } }));
    renderEditor();

    const row = await screen.findByTestId("block-t1");
    const column = row.closest(".lg\\:grid-cols-\\[minmax\\(300px\\,380px\\)_minmax\\(0\\,1fr\\)\\]");
    expect(column).toBeTruthy();
    for (let element: Element | null = row; element && element.parentElement !== column; element = element.parentElement) {
      expect(element.classList.contains("min-w-0"), element.outerHTML.slice(0, 80)).toBe(true);
    }
  });

  it("asks before leaving with unsaved changes", async () => {
    installApi(fixture());
    renderEditor();
    await editHeading("Not saved");
    fireEvent.click(screen.getByRole("link", { name: "Back to pages" }));
    expect(await screen.findByText("Leave without saving?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Leave without saving?")).toBeNull());
    expect(screen.queryByText("Page overview")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Back to pages" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave page" }));
    expect(await screen.findByText("Page overview")).toBeTruthy();
  });

  it("shows a page someone else owns without editing controls", async () => {
    installApi(fixture({ canEdit: false }));
    renderEditor();
    expect(await screen.findByText("You can view this page but not change it.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(within(screen.getByTestId("block-h1")).queryByRole("button", { name: "Move down" })).toBeNull();
  });
});
