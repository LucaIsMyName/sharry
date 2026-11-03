// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import type { Me } from "../api.ts";
import { Shell } from "./shell.tsx";
import { TooltipProvider } from "./ui/tooltip.tsx";
import { ToastProvider } from "./ui/toast.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
}));

const me: Me = {
  user: {
    id: "user-1",
    username: "ada",
    email: "ada@example.com",
    role: "user",
    totpEnabled: true,
    mustChangePassword: false,
    locale: "en",
    hasAvatar: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  scope: "full",
  mfaRequired: false,
  mailConfigured: false,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        loader: () => me,
        HydrateFallback: () => null,
        element: <Shell />,
        children: [{ index: true, handle: { title: "Overview" }, element: <div>Home</div> }],
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(
    <TooltipProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </TooltipProvider>,
  );
}

describe("collapsible sidebar", () => {
  it("keeps an icon rail, a hover width, and clipped labels when closed", async () => {
    localStorage.setItem("sidebar", "closed");
    renderShell();
    await screen.findByRole("link", { name: "Chat" });
    const rail = document.querySelector("[data-state='collapsed']") as HTMLElement;
    expect(rail.className).toContain("group/sidebar");
    const panel = document.querySelector("[data-sidebar='panel']") as HTMLElement;
    expect(panel.className).toContain("group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]");
    expect(panel.className).toContain("group-data-[collapsible=icon]/sidebar:hover:w-[var(--sidebar-width)]");
    const brand = document.querySelector("[data-sidebar='brand'] a") as HTMLElement;
    expect(brand.className).toContain("hidden");
    expect(brand.className).toContain("pl-2");
    expect(brand.className).toContain("text-xl");
    const mark = document.querySelector("[data-sidebar='mark']") as HTMLElement;
    expect(mark.textContent).toBe("S");
    expect(mark.className).toContain("size-8");
    expect(mark.className).toContain("text-xl");
    expect(mark.className).not.toContain("text-sm");
    expect(mark.className).not.toContain("uppercase");
    const chat = screen.getByRole("link", { name: "Chat" });
    expect(chat.className).toContain("overflow-hidden");
    expect(chat.className).toContain("whitespace-nowrap");
    expect(chat.className).toContain("md:h-8");
    expect(chat.className).toContain("px-2");
    expect(chat.querySelector("svg")?.classList.contains("size-4")).toBe(true);
  });
});
