// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, toast } from "./toast.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("toast", () => {
  it("shows an error at the bottom right and lets it leave", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    act(() => {
      toast.error("Could not sign in");
    });
    const viewport = screen.getByRole("region", { name: "Notifications" });
    expect(viewport.className).toContain("bottom-4");
    expect(viewport.className).toContain("right-4");
    expect(viewport.textContent).toContain("Could not sign in");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(
      viewport.querySelector("[data-type='error']")?.hasAttribute(
        "data-ending-style",
      ),
    ).toBe(true);
  });

  it("runs a success action such as Undo once", async () => {
    const undo = vi.fn();
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    act(() => {
      toast.success("Moved 1 item.", { label: "Undo", onClick: undo });
    });
    const button = await screen.findByRole("button", { name: "Undo" });
    act(() => button.click());
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
