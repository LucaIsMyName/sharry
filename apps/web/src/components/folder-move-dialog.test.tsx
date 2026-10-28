// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type LinkSummary } from "../api.ts";
import { FolderMoveDialog } from "./folder-move-dialog.tsx";
import { CampaignsPage } from "../pages/campaigns.tsx";
import { LinksPage } from "../pages/links.tsx";

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

describe("folder move dialog", () => {
  it("shows nested folders and closes from Cancel", () => {
    const onOpenChange = vi.fn();
    const onPick = vi.fn();
    render(
      <FolderMoveDialog
        open
        rootLabel="Links"
        folders={[
          { id: "news", name: "News", icon: null, parentId: null },
          { id: "sports", name: "Sports", icon: null, parentId: "news" },
        ]}
        onOpenChange={onOpenChange}
        onPick={onPick}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Move to…" });
    expect(dialog.closest("table")).toBeNull();
    const sports = within(dialog).getByRole("button", { name: "Sports" });
    expect(sports.style.paddingInlineStart).toBe("28px");
    fireEvent.click(sports);
    expect(onPick).toHaveBeenCalledWith("sports");
    expect(screen.getByRole("dialog", { name: "Move to…" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens the links move dialog from a row and keeps it off the table", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.includes("/api/folders") && path.includes("tree=1")) {
        return {
          folders: [
            { id: "folder-1", name: "News", icon: null, parentId: null, childCount: 0 },
            { id: "folder-2", name: "Sports", icon: null, parentId: "folder-1", childCount: 0 },
          ],
        };
      }
      if (path.includes("/api/folders")) {
        return { folders: [{ id: "folder-1", name: "News", icon: null, parentId: null, childCount: 0 }], breadcrumb: [] };
      }
      if (init?.method === "PATCH") return { ok: true };
      if (path.includes("/api/ai/status")) return { available: false };
      return { links: [link], total: 1 };
    });
    render(
      <MemoryRouter>
        <LinksPage />
      </MemoryRouter>,
    );
    const moves = await screen.findAllByRole("button", { name: "Move to…" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(moves[1]!);
    const dialog = await screen.findByRole("dialog", { name: "Move to…" });
    expect(dialog.closest("table")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Sports" }).style.paddingInlineStart).toBe("28px");
    fireEvent.click(within(dialog).getByRole("button", { name: "News" }));
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/api/links/summer",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: "folder-1" }) }),
      );
      expect(screen.queryByRole("dialog", { name: "Move to…" })?.getAttribute("data-open") ?? null).toBeNull();
    });
  });

  it("opens the campaigns move dialog from a row", async () => {
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path.includes("/api/campaigns")) {
        return {
          campaigns: [
            {
              id: "launch",
              name: "Launch",
              description: null,
              variantCount: 0,
              folderId: null,
              icon: null,
              tags: [],
            },
          ],
        };
      }
      if (path.includes("tree=1")) {
        return { folders: [{ id: "camp-folder", name: "Archive", icon: null, parentId: null }] };
      }
      return { folders: [], breadcrumb: [] };
    });
    render(
      <MemoryRouter>
        <CampaignsPage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Move to…" }));
    const dialog = await screen.findByRole("dialog", { name: "Move to…" });
    expect(within(dialog).getByRole("button", { name: "Archive" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Campaigns" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Move to…" })?.getAttribute("data-open") ?? null).toBeNull();
    });
  });
});
