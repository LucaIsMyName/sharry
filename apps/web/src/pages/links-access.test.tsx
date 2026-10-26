// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type LinkSummary } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { LinksPage } from "./links.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.clearAllMocks();
});

function summary(title: string, canEdit: boolean): LinkSummary {
  return {
    id: title,
    slug: title.toLowerCase(),
    shortUrl: `https://s.example/${title}`,
    destinationUrl: "https://example.com/destination",
    title,
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
    clicks: 3,
    canEdit,
  };
}

function renderLinks(links: LinkSummary[]) {
  vi.mocked(api).mockResolvedValue({ links, total: links.length } as never);
  return render(
    <MemoryRouter>
      <LinksPage />
    </MemoryRouter>,
  );
}

describe("LinksPage access", () => {
  it("marks editable and view-only links when the list is mixed", async () => {
    renderLinks([summary("Summer", true), summary("Winter", false)]);

    const editable = await screen.findAllByText("Editable");
    const viewOnly = screen.getAllByText("View only");
    expect(editable.length).toBeGreaterThan(0);
    expect(viewOnly.length).toBeGreaterThan(0);

    const winter = screen.getAllByText("Winter");
    expect(
      winter.some(
        (node) =>
          node.className.includes("text-muted-foreground") ||
          node.closest("td")?.className.includes("text-muted-foreground"),
      ),
    ).toBe(true);
  });

  it("hides access labels when every link is editable", async () => {
    renderLinks([summary("Summer", true)]);

    expect((await screen.findAllByText("Summer")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Editable")).toBeNull();
    expect(screen.queryByText("View only")).toBeNull();
  });
});
