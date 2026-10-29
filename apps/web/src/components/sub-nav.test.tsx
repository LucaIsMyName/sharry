// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SubNav, SubNavSlotContext } from "./sub-nav.tsx";

afterEach(cleanup);

function WithSlot({ show = true }: { show?: boolean }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div data-testid="slot" ref={setSlot} />
      <SubNavSlotContext.Provider value={slot}>
        <main data-testid="page">
          {show ? (
            <SubNav label="Chats">
              <button type="button">New chat</button>
            </SubNav>
          ) : null}
        </main>
      </SubNavSlotContext.Provider>
    </>
  );
}

describe("sub-nav", () => {
  it("renders its children into the slot as a labelled navigation", () => {
    render(<WithSlot />);
    const nav = screen.getByRole("navigation", { name: "Chats" });
    expect(screen.getByTestId("slot").contains(nav)).toBe(true);
    expect(screen.getByTestId("page").contains(nav)).toBe(false);
    expect(nav.className).toContain("border-b");
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.className).toContain("flex-nowrap");
    const row = nav.firstElementChild as HTMLElement;
    expect(row.className).toContain("w-max");
    expect(row.className).toContain("!flex-nowrap");
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });

  it("empties the slot when the page unmounts its sub-nav", () => {
    const { rerender } = render(<WithSlot />);
    rerender(<WithSlot show={false} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByTestId("slot").childElementCount).toBe(0);
  });

  it("renders nothing outside a shell that provides a slot", () => {
    render(
      <SubNav label="Docs">
        <button type="button">Docs</button>
      </SubNav>,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Docs" })).toBeNull();
  });
});
