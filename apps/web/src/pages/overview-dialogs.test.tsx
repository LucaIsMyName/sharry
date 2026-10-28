// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type LinkSummary } from "../api.ts";
import { CampaignsPage } from "./campaigns.tsx";
import { LinksPage } from "./links.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

const link: LinkSummary = {
  id: "summer",
  slug: "summer",
  shortUrl: "https://s.example/summer",
  destinationUrl: "https://example.com",
  title: "Summer",
  description: null,
  redirectType: "302",
  status: "active",
  expiresAt: null,
  hasPassword: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  utm: {},
  routingRules: [],
  userId: "user",
  redirectDomainId: null,
  clicks: 1,
  canEdit: true,
  folderId: null,
};

describe("overview dialogs", () => {
  it("creates a campaign from a dialog without moving the page heading", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "POST") return { id: "launch" };
      if (path.includes("/api/campaigns")) return { campaigns: [] };
      return { folders: [], breadcrumb: [] };
    });
    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );
    const heading = await screen.findByRole("heading", { name: "Campaigns" });
    expect(screen.getByText("No campaigns yet.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    const top = heading.getBoundingClientRect().top;
    fireEvent.click(screen.getByRole("button", { name: "New campaign" }));
    const dialog = await screen.findByRole("dialog", { name: "New campaign" });
    expect(heading.getBoundingClientRect().top).toBe(top);
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create campaign" })).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "Launch" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Description" }), { target: { value: "Notes" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create campaign" }));
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/api/campaigns",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Launch", description: "Notes", folderId: null }),
        }),
      );
      expect(screen.queryByRole("dialog", { name: "New campaign" })?.getAttribute("data-open") ?? null).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "New campaign" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "New campaign" })).getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New campaign" })?.getAttribute("data-open") ?? null).toBeNull();
    });
  });

  it("asks for delete before removing a link from the list", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "DELETE") return { ok: true };
      if (path.includes("/api/folders")) return { folders: [], breadcrumb: [] };
      if (path.includes("/api/ai/status")) return { available: false };
      return { links: [link], total: 1 };
    });
    render(
      <MemoryRouter>
        <LinksPage />
      </MemoryRouter>,
    );
    const row = (await screen.findByRole("link", { name: "Summer" })).closest("tr");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this short link?" });
    expect(confirm).not.toHaveBeenCalled();
    const confirmDelete = within(dialog).getByRole("button", { name: "Delete link" }) as HTMLButtonElement;
    expect(confirmDelete.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Type delete" }), { target: { value: "remove" } });
    expect(confirmDelete.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Type delete" }), { target: { value: "delete" } });
    expect(confirmDelete.disabled).toBe(false);
    fireEvent.click(confirmDelete);
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalledWith("/api/links/summer", expect.objectContaining({ method: "DELETE" }));
      expect(screen.queryByRole("dialog", { name: "Delete this short link?" })?.getAttribute("data-open") ?? null).toBeNull();
    });
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
