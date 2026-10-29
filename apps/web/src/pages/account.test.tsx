// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouterProvider, createMemoryRouter } from "react-router";
import { api, type Me } from "../api.ts";
import { ToastProvider } from "../components/ui/toast.tsx";
import { AccountPage } from "./auth.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

function me(overrides: Partial<Me["user"]> = {}): Me {
  return {
    user: {
      id: "u1",
      username: "ada",
      email: "ada@example.com",
      role: "user",
      totpEnabled: false,
      mustChangePassword: false,
      locale: "en",
      hasAvatar: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    },
    scope: "full",
    mfaRequired: false,
    mailConfigured: true,
  } as Me;
}

function renderAccount(account: Me) {
  vi.mocked(api).mockImplementation(async (path: string) => (path === "/api/auth/me" ? account : {}));
  const router = createMemoryRouter([{ path: "/account", element: <AccountPage /> }], { initialEntries: ["/account"] });
  return render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("account page", () => {
  it("groups settings in sections instead of cards", async () => {
    const { container } = renderAccount(me());
    await screen.findByText("ada@example.com");
    for (const heading of ["Profile", "Language", "Password", "Two-factor authentication"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    }
    expect(container.querySelector("[data-slot=card]")).toBeNull();
  });

  it("asks before removing the photo and keeps it when cancelled", async () => {
    renderAccount(me({ hasAvatar: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove photo" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove your photo?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api).not.toHaveBeenCalledWith("/api/auth/avatar", { method: "DELETE" });
  });

  it("only turns off two-factor after the confirmation", async () => {
    renderAccount(me({ totpEnabled: true }));
    const turnOff = await screen.findByRole("button", { name: "Turn off" });
    const form = turnOff.closest("form") as HTMLFormElement;
    fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "secret-password" } });
    fireEvent.submit(form);
    const dialog = await screen.findByRole("dialog");
    expect(api).not.toHaveBeenCalledWith("/api/auth/mfa/disable", expect.anything());
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn off" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({ currentPassword: "secret-password" }),
      }),
    );
  });
});
