// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { DocsPage } from "./docs.tsx";

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
});
