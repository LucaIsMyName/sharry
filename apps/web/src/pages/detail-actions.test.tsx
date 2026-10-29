// @vitest-environment happy-dom

import { useState, type ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { SubNavSlotContext } from "../components/sub-nav.tsx";
import { LinkDetailPage } from "./links.tsx";
import { CampaignDetailPage } from "./campaigns.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", async () => {
  const actual = await vi.importActual<typeof import("../api.ts")>("../api.ts");
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
  window.matchMedia = originalMatchMedia;
  localStorage.clear();
});

function setNarrow(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)" ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function Slot({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  return (
    <ToastProvider>
      <div data-testid="slot" ref={setElement} />
      <SubNavSlotContext.Provider value={element}>{children}</SubNavSlotContext.Provider>
    </ToastProvider>
  );
}

const link = {
  id: "abc",
  slug: "spring",
  shortUrl: "https://s.example/spring",
  destinationUrl: "https://example.com",
  title: "Spring",
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
  canEdit: true,
  tags: [],
};

function installApi() {
  apiMock.mockImplementation(async (path: string) => {
    const url = String(path);
    if (url === "/api/links/abc") return link;
    if (url.endsWith("/qr")) return { qrCodes: [] };
    if (url.endsWith("/variants")) return { variants: [] };
    if (url.includes("/analytics")) throw new Error("skip");
    if (url.startsWith("/api/folders")) return { folders: [] };
    if (url.startsWith("/api/redirect-domains")) return { domains: [] };
    if (url.startsWith("/api/settings/public")) {
      return {
        appName: "Sharry",
        shortUrlPrefix: "/s",
        pagePrefix: "/l",
        shortUrlBase: "https://s.example",
        appUrl: "https://app.example",
        defaultRedirectType: "302",
      };
    }
    if (url.startsWith("/api/tags")) return { tags: [] };
    if (url.startsWith("/api/ai/status")) return { available: false };
    if (url.startsWith("/api/campaigns/")) {
      return { id: "c1", name: "Spring", description: "", variantCount: 0, variants: [], tags: [] };
    }
    if (url.startsWith("/api/links")) return { links: [], total: 0 };
    return {};
  });
}

function router(path: string, element: ReactNode) {
  return createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        loader: () => ({ appName: "Sharry" }),
        HydrateFallback: () => null,
        children: [{ path: path.slice(1).replace(/\/[^/]+$/, "/:id"), element }],
      },
    ],
    { initialEntries: [path] },
  );
}

describe("detail actions on a small screen", () => {
  it("moves Save, Copy, and Delete for a link into the sub-nav", async () => {
    setNarrow(true);
    installApi();
    render(<RouterProvider router={router("/links/abc", <Slot><LinkDetailPage /></Slot>)} />);
    const nav = await screen.findByRole("navigation", { name: "Link" });
    expect(within(nav).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("moves Save and Delete for a campaign into the sub-nav", async () => {
    setNarrow(true);
    installApi();
    render(<RouterProvider router={router("/campaigns/c1", <Slot><CampaignDetailPage /></Slot>)} />);
    const nav = await screen.findByRole("navigation", { name: "Campaign" });
    expect(within(nav).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});
