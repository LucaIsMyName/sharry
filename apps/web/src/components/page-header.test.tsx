// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActionBar, PageHeader } from "./page-header.tsx";
import { SubNavSlotContext } from "./sub-nav.tsx";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = originalMatchMedia;
});

function setNarrow(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(max-width: 767px)" ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function Header({ slot = false }: { slot?: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const header = (
    <PageHeader
      title="Links"
      action={
        <button type="button" onClick={() => {}}>
          New link
        </button>
      }
    />
  );
  if (!slot) return header;
  return (
    <>
      <div data-testid="slot" ref={setElement} />
      <SubNavSlotContext.Provider value={element}>{header}</SubNavSlotContext.Provider>
    </>
  );
}

describe("page header actions", () => {
  it("keeps the action on the same row as the heading on a wide screen", () => {
    setNarrow(false);
    render(<Header slot />);
    const heading = screen.getByRole("heading", { name: "Links" });
    const button = screen.getByRole("button", { name: "New link" });
    const row = heading.parentElement?.parentElement as HTMLElement;
    expect(row.className).toContain("flex");
    expect(row.contains(button)).toBe(true);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("moves the action into the mobile sub-nav and leaves the heading row", () => {
    setNarrow(true);
    render(<Header slot />);
    const nav = screen.getByRole("navigation", { name: "Links" });
    const button = screen.getByRole("button", { name: "New link" });
    expect(nav.contains(button)).toBe(true);
    expect(screen.getByTestId("slot").contains(nav)).toBe(true);
    const heading = screen.getByRole("heading", { name: "Links" });
    expect(heading.parentElement?.parentElement?.contains(button)).toBe(false);
  });

  it("keeps the action beside the heading when the shell has no sub-nav slot", () => {
    setNarrow(true);
    render(<Header />);
    const heading = screen.getByRole("heading", { name: "Links" });
    const button = screen.getByRole("button", { name: "New link" });
    expect(heading.parentElement?.parentElement?.contains(button)).toBe(true);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

function Bar({ slot = true }: { slot?: boolean }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const bar = (
    <ActionBar label="Link">
      <button type="button">Save</button>
      <button type="button">Copy</button>
    </ActionBar>
  );
  if (!slot) return bar;
  return (
    <>
      <div data-testid="slot" ref={setElement} />
      <SubNavSlotContext.Provider value={element}>{bar}</SubNavSlotContext.Provider>
    </>
  );
}

describe("action bar", () => {
  it("keeps the buttons on the page on a wide screen", () => {
    setNarrow(false);
    render(<Bar />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save.parentElement?.className).toContain("flex-wrap");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("moves the same buttons into the mobile sub-nav", () => {
    setNarrow(true);
    render(<Bar />);
    const nav = screen.getByRole("navigation", { name: "Link" });
    expect(nav.contains(screen.getByRole("button", { name: "Save" }))).toBe(true);
    expect(nav.contains(screen.getByRole("button", { name: "Copy" }))).toBe(true);
    expect(screen.getByTestId("slot").contains(nav)).toBe(true);
  });
});
