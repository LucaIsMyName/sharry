// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, RouterProvider } from "react-router";
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
    expect(screen.getByRole("button", { name: "Docs" })).toBeTruthy();
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
    expect(code.closest("pre")).toBeTruthy();
  });
});
