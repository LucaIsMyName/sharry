// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import type { Me } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { Shell } from "./shell.tsx";
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

function renderShell(role: Me["user"]["role"] = "user") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: () => ({ ...me, user: { ...me.user, role } }),
        HydrateFallback: () => null,
        element: <Shell />,
        children: [
          { index: true, element: <Probe /> },
          { path: "*", element: <Probe /> },
        ],
      },
    ],
    { initialEntries: ["/"] },
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
    const search = screen.getByRole("button", { name: "Search" });
    expect(chat.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const divider = chat.parentElement?.querySelector("hr");
    expect(divider).toBeTruthy();
    expect(search.compareDocumentPosition(divider!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Audit" })).toBeNull();

    fireEvent.click(search);
    expect(screen.queryByRole("option", { name: "Audit" })).toBeNull();
    const links = screen.getByRole("option", { name: "Links" });
    expect(links.className).toContain("border");
    expect(links.querySelector("svg")).toBeTruthy();
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
          chats: [],
        });
      }
      return Promise.resolve({});
    });
    renderShell();
    fireEvent.click(await screen.findByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    const link = await screen.findByRole("option", { name: /^Summer/ });
    expect(link.textContent).toContain("summer");
    expect(link.textContent).toContain("https://example.com/summer");
    expect(link.textContent).toContain("Poster link");
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/links/link-1"));

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "summer" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "Analytics for Summer" }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/analytics?link=link-1"));

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByPlaceholderText("Search pages, links, and docs"), {
      target: { value: "Registration is closed" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Signing in/ }));
    await waitFor(() => expect(screen.getByTestId("here").textContent).toBe("/docs/user/signing-in"));
  });

  it("shows audit to an administrator", async () => {
    renderShell("admin");
    expect(await screen.findByRole("link", { name: "Audit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("option", { name: "Audit" })).toBeTruthy();
  });
});
