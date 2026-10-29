// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SubNavSlotContext } from "../components/sub-nav.tsx";
import { setActiveLocale } from "../i18n/index.tsx";
import { DocsPage } from "./docs.tsx";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg data-testid="mermaid-diagram"></svg>' })),
  },
}));

afterEach(() => {
  cleanup();
  setActiveLocale("en");
});

describe("Docs markdown tables", () => {
  it("scrolls a wide table inside the article", async () => {
    const router = createMemoryRouter(
      [
        {
          id: "root",
          path: "/",
          loader: () => ({ appName: "Sharry" }),
          children: [{ path: "docs/*", element: <DocsPage /> }],
        },
      ],
      { initialEntries: ["/docs/developer/frontend/routing"] },
    );
    render(
      <HelmetProvider>
        <RouterProvider router={router} />
      </HelmetProvider>,
    );

    const nav = await screen.findByRole("navigation");
    expect(nav.parentElement?.className).toContain("self-stretch");
    expect(nav.className).toContain("md:sticky");
    const tables = await screen.findAllByRole("table");
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(table.parentElement?.className).toContain("overflow-x-auto");
      expect(table.parentElement?.className).toContain("min-w-0");
      expect(table.parentElement?.className).toContain("max-w-full");
    }
  });

  it("renders a mermaid fence as a diagram and leaves other fences as code", async () => {
    const links = createMemoryRouter(
      [
        {
          id: "root",
          path: "/",
          loader: () => ({ appName: "Sharry" }),
          children: [{ path: "docs/*", element: <DocsPage /> }],
        },
      ],
      { initialEntries: ["/docs/user/links"] },
    );
    const { unmount } = render(
      <HelmetProvider>
        <RouterProvider router={links} />
      </HelmetProvider>,
    );
    expect(await screen.findByTestId("mermaid-diagram")).toBeTruthy();
    unmount();

    const deploy = createMemoryRouter(
      [
        {
          id: "root",
          path: "/",
          loader: () => ({ appName: "Sharry" }),
          children: [{ path: "docs/*", element: <DocsPage /> }],
        },
      ],
      { initialEntries: ["/docs/developer/backend/deploy"] },
    );
    render(
      <HelmetProvider>
        <RouterProvider router={deploy} />
      </HelmetProvider>,
    );
    const code = await screen.findByText("cp .env.production.example .env.production");
    const pre = code.closest("pre");
    expect(pre).toBeTruthy();
    const writeText = vi.fn(async () => undefined);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const copy = pre?.parentElement?.querySelector("button");
    expect(copy?.getAttribute("aria-label")).toBe("Copy code");
    expect(copy?.className).toContain("absolute");
    expect(copy?.className).toContain("right-1.5");
    fireEvent.click(copy as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("cp .env.production.example .env.production"));
    expect(copy?.getAttribute("aria-label")).toBe("Copied");
    vi.restoreAllMocks();
  });
});

function SlotHost() {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div data-testid="sub-nav-slot" ref={setSlot} />
      <SubNavSlotContext.Provider value={slot}>
        <DocsPage />
      </SubNavSlotContext.Provider>
    </>
  );
}

describe("Docs mobile menu", () => {
  it("puts the Docs trigger in the sub-nav and scrolls a long page list in the sheet", async () => {
    const router = createMemoryRouter(
      [
        {
          id: "root",
          path: "/",
          loader: () => ({ appName: "Sharry" }),
          children: [{ path: "docs/*", element: <SlotHost /> }],
        },
      ],
      { initialEntries: ["/docs/user/links"] },
    );
    render(
      <HelmetProvider>
        <RouterProvider router={router} />
      </HelmetProvider>,
    );
    const subNav = await screen.findByRole("navigation", { name: "Docs" });
    expect(screen.getByTestId("sub-nav-slot").contains(subNav)).toBe(true);
    const trigger = within(subNav).getByRole("button", { name: "Docs" });
    expect(screen.getByRole("article").contains(trigger)).toBe(false);

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    const list = dialog.querySelector("[data-slot=docs-sheet-list]") as HTMLElement;
    expect(list.className).toContain("min-h-0");
    expect(list.className).toContain("flex-1");
    expect(list.className).toContain("overflow-y-auto");
    expect(within(list).getAllByRole("link").length).toBeGreaterThan(5);
  });
});
