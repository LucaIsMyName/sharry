// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  localStorage.clear();
  vi.resetModules();
  vi.unstubAllGlobals();
});

function mockMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  window.matchMedia = vi.fn(() => ({
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  return listeners;
}

async function loadTheme(matches = false) {
  const listeners = mockMatchMedia(matches);
  const theme = await import("./theme.ts");
  return { theme, listeners };
}

describe("theme", () => {
  it("stores light, dark, and system on the document", async () => {
    const { theme } = await loadTheme(true);
    theme.setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("sharry.theme")).toBe("dark");

    theme.setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    theme.setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("sharry.theme")).toBe("system");
  });

  it("updates a system choice when the OS theme changes", async () => {
    let matches = false;
    const listeners: Array<() => void> = [];
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return matches;
      },
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: () => void) => {
        listeners.push(listener);
      },
      removeEventListener: () => {},
      dispatchEvent: () => true,
    })) as unknown as typeof window.matchMedia;
    localStorage.setItem("sharry.theme", "system");
    await import("./theme.ts");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    matches = true;
    listeners.at(-1)?.();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});