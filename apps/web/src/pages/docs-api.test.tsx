// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelmetProvider } from "react-helmet-async";
import { createMemoryRouter, RouterProvider } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { DocsPage, apiDocsExampleStorageKey } from "./docs.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  setActiveLocale("en");
  vi.restoreAllMocks();
});

describe("API reference examples", () => {
  it("shows a curl command and copies the sample on screen", async () => {
    await renderApiDocs();
    const list = routeExample("GET", "/api/links");
    const login = routeExample("POST", "/api/auth/login");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.className).toContain("max-w-full");
    expect(list.parentElement?.className).toContain("min-w-0");
    expect(list.parentElement?.className).toContain("max-w-full");
    expect(list.closest("div.border")?.className).toContain("min-w-0");
    expect(list.textContent?.startsWith("curl ")).toBe(true);
    expect(login.textContent?.startsWith("curl ")).toBe(true);
    expect(list.textContent).toContain("Bearer sharry_...");
    expect(list.textContent).not.toContain("TOKEN");
    expect(login.textContent).not.toContain("Authorization");

    const writeText = vi.fn(async () => undefined);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(list.parentElement?.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(list.textContent));
  });

  it("highlights a TypeScript sample and clears the color on curl", async () => {
    await renderApiDocs();
    fireEvent.click(screen.getByRole("button", { name: "TypeScript" }));
    await waitFor(() => {
      const sample = routeExample("GET", "/api/links");
      expect(sample.querySelector("span[style*='color']")).not.toBeNull();
    }, { timeout: 10000 });
    const colored = routeExample("GET", "/api/links");
    expect(colored.textContent).toContain('await fetch("https://your-domain/api/links');

    const writeText = vi.fn(async () => undefined);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(colored.parentElement?.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(colored.textContent));

    fireEvent.click(screen.getByRole("button", { name: "curl" }));
    const plain = routeExample("GET", "/api/links");
    expect(plain.querySelector("span")).toBeNull();
    expect(plain.textContent?.startsWith("curl ")).toBe(true);
  });

  it("switches every sample to TypeScript and stores the choice", async () => {
    await renderApiDocs();
    fireEvent.click(screen.getByRole("button", { name: "TypeScript" }));
    const list = routeExample("GET", "/api/links");
    const login = routeExample("POST", "/api/auth/login");
    expect(list.textContent).toContain('await fetch("https://your-domain/api/links');
    expect(login.textContent).toContain('await fetch("https://your-domain/api/auth/login"');
    expect(list.textContent).toContain('Authorization: "Bearer sharry_..."');
    expect(login.textContent).not.toContain("Authorization");
    expect(list.textContent?.startsWith("curl")).toBe(false);
    expect(localStorage.getItem(apiDocsExampleStorageKey)).toBe("ts");
    expect(screen.getByRole("button", { name: "TypeScript" }).getAttribute("aria-pressed")).toBe("true");

    const writeText = vi.fn(async () => undefined);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(list.parentElement?.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(list.textContent));
  });

  it("opens on the language stored from an earlier visit", async () => {
    localStorage.setItem(apiDocsExampleStorageKey, "ts");
    await renderApiDocs();
    expect(routeExample("GET", "/api/links").textContent).toContain("await fetch");
    expect(screen.getByRole("button", { name: "curl" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("opens on curl when the stored language is unknown", async () => {
    localStorage.setItem(apiDocsExampleStorageKey, "python");
    await renderApiDocs();
    expect(routeExample("GET", "/api/links").textContent?.startsWith("curl ")).toBe(true);
    expect(screen.getByRole("button", { name: "curl" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("follows a storage event from another tab", async () => {
    await renderApiDocs();
    expect(routeExample("POST", "/api/links").textContent?.startsWith("curl ")).toBe(true);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: apiDocsExampleStorageKey, newValue: "ts" }));
    });
    expect(routeExample("GET", "/api/links").textContent).toContain("await fetch");
    expect(routeExample("POST", "/api/links").textContent).toContain("await fetch");
    expect(routeExample("POST", "/api/links").textContent?.startsWith("curl")).toBe(false);
  });
});

function routeExample(method: string, path: string): HTMLElement {
  const code = screen.getAllByText(path, { selector: "code" }).find((node) => node.previousElementSibling?.textContent === method);
  const pre = code?.closest("div.border")?.querySelector("pre");
  if (!pre) throw new Error(`missing example ${method} ${path}`);
  return pre;
}

it("highlights a TypeScript fence on a guide page", async () => {
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        loader: () => ({ appName: "Sharry" }),
        children: [{ path: "docs/*", element: <DocsPage /> }],
      },
    ],
    { initialEntries: ["/docs/developer/frontend/page-blocks"] },
  );
  render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
  await screen.findByRole("heading", { name: "Page builder blocks" });
  await waitFor(() => {
    const block = [...document.querySelectorAll("pre")].find((pre) =>
      pre.textContent?.includes("defineBlock"),
    );
    expect(block?.querySelector("span[style*='color']")).not.toBeNull();
  }, { timeout: 10000 });
});

async function renderApiDocs() {
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        loader: () => ({ appName: "Sharry" }),
        children: [{ path: "docs/*", element: <DocsPage /> }],
      },
    ],
    { initialEntries: ["/docs/api"] },
  );
  render(
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>,
  );
  await screen.findByRole("heading", { name: "API reference" });
}
