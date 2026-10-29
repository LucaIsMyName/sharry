// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { api, type LandingPageSummary } from "../api.ts";
import { ToastProvider } from "../components/ui/toast.tsx";
import { LandingPagesPage } from "./landing-pages.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  },
}));

const base: LandingPageSummary = {
  id: "p1",
  title: "Spring sale",
  slug: "spring",
  url: "https://s.example/l/spring",
  status: "published",
  hidden: false,
  publishedAt: "2026-01-02T00:00:00.000Z",
  folderId: null,
  redirectDomainId: null,
  userId: "u1",
  owner: null,
  canEdit: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const draft: LandingPageSummary = { ...base, id: "p2", title: "Autumn", slug: "autumn", url: "https://s.example/l/autumn", status: "draft", publishedAt: null, hidden: true };

type Init = RequestInit | undefined;

function installApi(pages: LandingPageSummary[]) {
  vi.mocked(api).mockImplementation(async (path: string, init?: Init) => {
    if (path.startsWith("/api/folders")) return { folders: [], breadcrumb: [] };
    if (path.startsWith("/api/pages/suggest-slug")) return { slug: "winter-market" };
    if (path === "/api/pages" && init?.method === "POST") return { ...base, id: "new-page" };
    if (path.startsWith("/api/pages?")) return { pages, total: pages.length };
    return {};
  });
}

function renderOverview() {
  const router = createMemoryRouter(
    [
      { path: "/pages", element: <LandingPagesPage /> },
      { path: "/pages/:id", element: <p>Editor open</p> },
    ],
    { initialEntries: ["/pages"] },
  );
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("landing pages overview", () => {
  it("lists pages with their status and address", async () => {
    installApi([base, draft]);
    renderOverview();
    const row = (await screen.findByText("Spring sale")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Published")).toBeTruthy();
    expect(within(row).getByText("s.example/l/spring")).toBeTruthy();
    const draftRow = screen.getByText("Autumn").closest("tr") as HTMLElement;
    expect(within(draftRow).getByText("Draft")).toBeTruthy();
    expect(within(draftRow).getByRole("button", { name: "View live" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows an empty state that opens the new page dialog", async () => {
    installApi([]);
    renderOverview();
    const empty = (await screen.findByText("No pages yet. Create one to start building.")).parentElement as HTMLElement;
    fireEvent.click(within(empty).getByRole("button", { name: "New page" }));
    expect(await screen.findByText("The page starts hidden, so you can build it before anyone sees it.")).toBeTruthy();
  });

  it("creates a page with a suggested slug and opens the editor", async () => {
    installApi([base]);
    renderOverview();
    await screen.findByText("Spring sale");
    fireEvent.click(screen.getByRole("button", { name: "New page" }));
    const dialog = await screen.findByRole("dialog");
    const [title, slug] = within(dialog).getAllByRole("textbox") as HTMLInputElement[];
    fireEvent.change(title as HTMLInputElement, { target: { value: "Winter market" } });
    await waitFor(() => expect((slug as HTMLInputElement).value).toBe("winter-market"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create page" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/pages", expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Winter market", slug: "winter-market", folderId: null }) })),
    );
    expect(await screen.findByText("Editor open")).toBeTruthy();
  });

  it("asks in an in-app dialog before deleting the selected rows", async () => {
    installApi([base, draft]);
    renderOverview();
    await screen.findByText("Spring sale");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    const deleteSelection = () =>
      screen.getAllByRole("button", { name: "Delete" }).find((button) => button.textContent?.trim() === "Delete") as HTMLElement;
    fireEvent.click(deleteSelection());
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 2 selected rows?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    fireEvent.click(deleteSelection());
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith("/api/pages/p1", { method: "DELETE" });
      expect(api).toHaveBeenCalledWith("/api/pages/p2", { method: "DELETE" });
    });
  });

  it("filters by status on the server", async () => {
    localStorage.setItem("sharry.table.pages", JSON.stringify({ filters: { status: "changed" }, sort: null, widths: {} }));
    installApi([]);
    renderOverview();
    await waitFor(() => expect(vi.mocked(api).mock.calls.some(([path]) => String(path).includes("status=changed"))).toBe(true));
  });
});
