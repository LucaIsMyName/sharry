// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ResetPage } from "./auth.tsx";

const resetTokenKey = "sharry.reset-token";

afterEach(() => {
  cleanup();
  sessionStorage.removeItem(resetTokenKey);
});

function renderReset(entry: string) {
  const router = createMemoryRouter([{ path: "/login/reset", element: <ResetPage /> }], { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("ResetPage", () => {
  it("takes a query token out of the address and keeps the form", async () => {
    const router = renderReset("/login/reset?token=query-token");
    expect(screen.getByRole("button", { name: "Save password" })).toBeTruthy();
    await waitFor(() => {
      expect(router.state.location.search).toBe("");
      expect(router.state.location.hash).toBe("");
    });
    expect(sessionStorage.getItem(resetTokenKey)).toBe("query-token");
    expect(screen.getByRole("button", { name: "Save password" })).toBeTruthy();
  });

  it("reads a hash token and still finds it after a refresh", async () => {
    const router = renderReset("/login/reset#token=hash-token");
    await waitFor(() => expect(router.state.location.hash).toBe(""));
    expect(sessionStorage.getItem(resetTokenKey)).toBe("hash-token");
    cleanup();
    renderReset("/login/reset");
    expect(screen.getByRole("button", { name: "Save password" })).toBeTruthy();
  });
});
