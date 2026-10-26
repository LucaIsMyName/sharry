// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import {
  DocsNav,
  docsNavStorageKey,
  type DocsNavPage,
} from "./docs-nav.tsx";

const userPages: DocsNavPage[] = [
  { slug: "user/signing-in", title: "Signing in" },
  { slug: "user/links", title: "Links" },
];

const backendPages: DocsNavPage[] = [
  { slug: "developer/backend/overview", title: "Backend overview" },
];

const frontendPages: DocsNavPage[] = [
  { slug: "developer/frontend/routing", title: "Routing" },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
  setActiveLocale("en");
});

function renderNav(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/docs/${slug}`]}>
      <DocsNav
        slug={slug}
        userPages={userPages}
        backendPages={backendPages}
        frontendPages={frontendPages}
      />
    </MemoryRouter>,
  );
}

describe("DocsNav", () => {
  it("opens one section at a time and remembers the choice", () => {
    renderNav("user/signing-in");

    expect(
      screen.getByRole("button", { name: "User" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: "Signing in" }).className).toContain(
      "text-sm",
    );
    expect(screen.queryByRole("link", { name: "Routing" })).toBeNull();
    expect(screen.getByRole("navigation").className).toContain("md:sticky");
    expect(localStorage.getItem(docsNavStorageKey)).toBe("user");

    fireEvent.click(screen.getByRole("button", { name: "Developer" }));

    expect(
      screen.getByRole("button", { name: "User" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByRole("link", { name: "Signing in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Routing" }).className).toContain(
      "text-xs",
    );
    expect(screen.getByText("Frontend").className).toContain("text-sm");
    expect(screen.getByRole("link", { name: "Last run" })).toBeTruthy();
    expect(localStorage.getItem(docsNavStorageKey)).toBe("developer");

    cleanup();
    renderNav("developer/backend/overview");

    expect(
      screen.getByRole("button", { name: "Developer" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.queryByRole("link", { name: "Signing in" })).toBeNull();
    expect(localStorage.getItem(docsNavStorageKey)).toBe("developer");
  });

  it("opens the section that contains the current page", () => {
    localStorage.setItem(docsNavStorageKey, "user");
    renderNav("developer/frontend/routing");

    expect(
      screen.getByRole("button", { name: "Developer" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: "Routing" })).toBeTruthy();
    expect(localStorage.getItem(docsNavStorageKey)).toBe("developer");
  });

  it("follows a route into the other section", () => {
    function Switcher() {
      const [slug, setSlug] = useState("user/signing-in");
      return (
        <MemoryRouter initialEntries={["/docs/user/signing-in"]}>
          <button type="button" onClick={() => setSlug("developer/backend/overview")}>
            Open backend page
          </button>
          <DocsNav
            slug={slug}
            userPages={userPages}
            backendPages={backendPages}
            frontendPages={frontendPages}
          />
        </MemoryRouter>
      );
    }

    render(<Switcher />);
    fireEvent.click(screen.getByRole("button", { name: "Open backend page" }));

    expect(
      screen.getByRole("button", { name: "Developer" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.queryByRole("link", { name: "Links" })).toBeNull();
    expect(screen.getByRole("link", { name: "Backend overview" })).toBeTruthy();
    expect(localStorage.getItem(docsNavStorageKey)).toBe("developer");
  });
});
