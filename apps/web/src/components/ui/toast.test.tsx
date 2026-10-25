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
});
