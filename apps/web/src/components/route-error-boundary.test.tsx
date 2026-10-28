// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveLocale } from "../i18n/index.tsx";
import { RouteErrorBoundary } from "./route-error-boundary.tsx";

function Boom(): ReactNode {
  throw new Error("page failed");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("shows the fallback when a child throws", () => {
    render(
      <RouteErrorBoundary resetKey="/links">
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("This page could not be shown.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("renders the next child when the pathname changes", async () => {
    const view = render(
      <RouteErrorBoundary resetKey="/links">
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    view.rerender(
      <RouteErrorBoundary resetKey="/campaigns">
        <p>Campaigns</p>
      </RouteErrorBoundary>,
    );
    expect(await screen.findByText("Campaigns")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the child again when retry succeeds", () => {
    let fail = true;
    function Child() {
      if (fail) throw new Error("page failed");
      return <p>Ready</p>;
    }
    render(
      <RouteErrorBoundary resetKey="/links">
        <Child />
      </RouteErrorBoundary>,
    );
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a custom message for search", () => {
    setActiveLocale("de");
    render(
      <RouteErrorBoundary resetKey="/links" message="Search could not be opened.">
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Die Suche konnte nicht geöffnet werden.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
