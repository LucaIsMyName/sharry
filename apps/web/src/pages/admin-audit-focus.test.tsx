// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { AdminAuditPage } from "./admin.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
});

describe("audit focus", () => {
  it("loads the chosen row and highlights it", async () => {
    apiMock.mockResolvedValue({
      entries: [
        {
          id: "row-1",
          actorUserId: "user-1",
          actorUsername: "ada",
          action: "link.created",
          entityType: "link",
          entityId: "link-1",
          metadata: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/admin/audit?entry=row-1"]}>
        <AdminAuditPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("A link is created")).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/api/admin/audit?entry=row-1");
    await waitFor(() => {
      expect(document.getElementById("focus-row-1")?.className).toContain("bg-muted");
    });
  });
});
