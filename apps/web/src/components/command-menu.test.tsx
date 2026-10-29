// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import type { Me } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { Shell } from "./shell.tsx";
import { SubNav } from "./sub-nav.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";
import { ToastProvider } from "./ui/toast.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
});

const me: Me = {
  user: {
    id: "user-1",
    username: "ada",
    email: "ada@example.com",
    role: "user",
    totpEnabled: true,
    mustChangePassword: false,
    locale: "en",
    hasAvatar: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  scope: "full",
  mfaRequired: false,
  mailConfigured: false,
};

function Probe() {
  const location = useLocation();
  return <div data-testid="here">{location.pathname + location.search}</div>;
}

function navSearch() {
  return within(screen.getByRole("navigation")).getByRole("button", { name: "Search" });
}

async function findNavSearch() {
  return within(await screen.findByRole("navigation")).getByRole("button", { name: "Search" });
}

function renderShell(role: Me["user"]["role"] = "user", initialEntry = "/") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: () => ({ ...me, user: { ...me.user, role } }),
        HydrateFallback: () => null,
        element: <Shell />,
        children: [
          { index: true, handle: { title: "Overview" }, element: <Probe /> },
          { path: "links", handle: { title: "Links" }, element: <Probe /> },
          {
            path: "section",
            element: (
              <SubNav label="Section">
                <button type="button">Section action</button>
              </SubNav>
            ),
          },
          { path: "*", element: <Probe /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(
    <TooltipProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </TooltipProvider>,
  );
}

describe("command menu", () => {
  it("places search under chat and hides audit from a standard user", async () => {
    renderShell();
    const chat = await screen.findByRole("link", { name: "Chat" });
    const search = navSearch();
    expect(chat.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const divider = chat.parentElement?.querySelector("hr");
    expect(divider).toBeTruthy();
    expect(search.compareDocumentPosition(divider!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Audit" })).toBeNull();

    fireEvent.click(search);
    expect(screen.queryByRole("option", { name: "Audit" })).toBeNull();
    const links = screen.getByRole("option", { name: "Links" });
    expect(links.className).toContain("overflow-hidden");
    expect(links.className).not.toContain("shadow-[inset");
    expect(links.querySelector("svg")).toBeTruthy();
  });

  it("shows the page title in the mobile bar and opens search from there", async () => {
    renderShell("user", "/links");
    await screen.findByRole("navigation");
    const bar = screen.getByRole("button", { name: "Menu" }).parentElement as HTMLElement;
    expect(within(bar).getByText("Links")).toBeTruthy();
    fireEvent.click(within(bar).getByRole("button", { name: "Search" }));
    expect(screen.getByPlaceholderText("Search pages, links, and docs")).toBeTruthy();
  });

  it("renders a page sub-nav inside the sticky mobile header, under the top bar", async () => {
    renderShell("user", "/section");
    const subNav = await screen.findByRole("navigation", { name: "Section" });
    const bar = screen.getByRole("button", { name: "Menu" }).parentElement as HTMLElement;
    const header = bar.parentElement as HTMLElement;
    expect(header.className).toContain("sticky");
    expect(header.contains(subNav)).toBe(true);
    expect(bar.compareDocumentPosition(subNav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(subNav).getByRole("button", { name: "Section action" })).toBeTruthy();
  });

  it("leaves the sub-nav slot empty on pages without one", async () => {
    renderShell("user", "/links");
    await screen.findByRole("navigation");
    const bar = screen.getByRole("button", { name: "Menu" }).parentElement as HTMLElement;
    const slot = bar.nextElementSibling as HTMLElement;
    expect(slot.childElementCount).toBe(0);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });

  it("opens with the keyboard shortcut", async () => {
    renderShell();
    await screen.findByRole("link", { name: "Chat" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Search pages, links, and docs")).toBeTruthy();
  });

  it("opens a link, its analytics, and a doc", async () => {
    apiMock.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/search")) {
        return Promise.resolve({
          links: [
            {
              id: "link-1",
              title: "Summer",
              slug: "summer",
              destinationUrl: "https://example.com/summer",
              description: "Poster link",
            },
          ],
          campaigns: [],
          media: [{ id: "media-1", name: "summer-poster.png", kind: "image", folderId: "folder-1" }],
          pages: [{ id: "page-1", title: "Landing for June", slug: "june-landing" }],
          chats: [],
        });
      }
      return Promise.resolve({});
    });
    renderShell();
    fireEvent.click(await findNavSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "summer-poster.png" }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/media?folder=folder-1&file=media-1"));

    fireEvent.click(navSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /^Landing for June/ }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/pages/page-1"));

    fireEvent.click(navSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    const link = await screen.findByRole("option", { name: /^Summer/ });
    expect(link.textContent).toContain("summer");
    expect(link.textContent).toContain("https://example.com/summer");
    expect(link.textContent).toContain("Poster link");
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/links/link-1"));

    fireEvent.click(navSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "Analytics for Summer" }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/analytics?link=link-1"));

    fireEvent.click(navSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "Registration is closed" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Signing in/ }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/docs/user/signing-in"));
  });

  it("keeps a long result inside the list", async () => {
    const title = `Summer${"x".repeat(80)}`;
    apiMock.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/search")) {
        return Promise.resolve({
          links: [
            {
              id: "link-1",
              title,
              slug: "summer",
              destinationUrl: "https://example.com/summer",
              description: "y".repeat(120),
            },
          ],
          campaigns: [],
          chats: [],
        });
      }
      return Promise.resolve({});
    });
    renderShell();
    fireEvent.click(await findNavSearch());
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    const link = await screen.findByRole("option", { name: /^Summerx/ });
    const list = link.closest("[cmdk-list]") as HTMLElement;
    expect(list).toBeTruthy();
    expect(link.className).toContain("overflow-hidden");
    if (list.clientWidth > 0) expect(link.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1);
  });

  it("shows audit to an administrator", async () => {
    renderShell("admin");
    expect(await screen.findByRole("link", { name: "Audit" })).toBeTruthy();
    fireEvent.click(navSearch());
    expect(screen.getByRole("option", { name: "Audit" })).toBeTruthy();
  });
});
