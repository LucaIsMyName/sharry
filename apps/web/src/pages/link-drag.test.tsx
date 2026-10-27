// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type LinkSummary } from "../api.ts";
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

function installApi() {
  vi.mocked(api).mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.includes("/api/folders") && path.includes("tree=1")) {
      return { folders: [{ id: "folder-1", name: "News", icon: null, parentId: null, childCount: 0 }] };
    }
    if (path.includes("/api/folders")) {
      return {
        folders: [{ id: "folder-1", name: "News", icon: null, parentId: null, childCount: 0 }],
        breadcrumb: [],
      };
    }
    if (init?.method === "PATCH") return { ok: true };
    if (path.includes("/api/ai/status")) return { available: false };
    return { links: [link], total: 1 };
  });
}

describe("link drag and drop", () => {
  it("moves a link into a folder row and back to Root", async () => {
    installApi();
    render(
      <MemoryRouter>
        <LinksPage />
      </MemoryRouter>,
    );
    const folder = await screen.findByText("News");
    const folderRow = folder.closest("tr");
    expect(folderRow).toBeTruthy();
    fireEvent.drop(folderRow as HTMLElement, {
      dataTransfer: { getData: () => "link:summer" },
    });
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/api/links/summer",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: "folder-1" }) }),
      );
    });

    fireEvent.drop(screen.getByRole("button", { name: "Links" }), {
      dataTransfer: { getData: () => "link:summer" },
    });
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        "/api/links/summer",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ folderId: null }) }),
      );
    });
  });
});
