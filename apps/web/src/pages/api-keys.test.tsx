// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { ApiKeysPage } from "./api-keys.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
  localStorage.clear();
});

function renderKeys() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/admin/api-keys"]}>
        <ApiKeysPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function installApi(fail = false) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/admin/users") {
      return { users: [{ id: "u1", username: "ada", email: "ada@example.com", role: "admin" }] };
    }
    if (path === "/api/admin/api-keys" && init?.method === "POST") {
      if (fail) throw new Error("Could not create the API key");
      const body = JSON.parse(String(init.body)) as { name: string; userId: string };
      return {
        id: "k1",
        name: body.name,
        userId: body.userId,
        username: "ada",
        tokenPrefix: "sharry_ab",
        secret: "sharry_secret",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      };
    }
    if (path === "/api/admin/api-keys") return { keys: [] };
    throw new Error(`unexpected ${path}`);
  });
}

describe("create API key", () => {
  it("opens a dialog from the button beside the heading", async () => {
    installApi();
    renderKeys();
    const heading = await screen.findByRole("heading", { name: "API keys" });
    const button = screen.getByRole("button", { name: "Create API key" });
    const row = heading.parentElement?.parentElement as HTMLElement;
    expect(row.contains(button)).toBe(true);
    expect(button.className).toContain("h-7");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Create API key" });
    expect(within(dialog).getByLabelText("Name")).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: "User" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create key" })).toBeTruthy();
  });

  it("stores the key, closes the form, and shows the secret once", async () => {
    installApi();
    renderKeys();
    fireEvent.click(await screen.findByRole("button", { name: "Create API key" }));
    const dialog = await screen.findByRole("dialog", { name: "Create API key" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Deploy" } });
    const submit = within(dialog).getByRole("button", { name: "Create key" }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);

    const secret = await screen.findByRole("dialog", { name: "Copy the API key" });
    expect(secret.textContent).toContain("sharry_secret");
    expect(screen.queryByRole("dialog", { name: "Create API key" })).toBeNull();
    expect(apiMock).toHaveBeenCalledWith("/api/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "Deploy", userId: "u1" }),
    });
  });

  it("keeps the dialog open when creation fails", async () => {
    installApi(true);
    renderKeys();
    fireEvent.click(await screen.findByRole("button", { name: "Create API key" }));
    const dialog = await screen.findByRole("dialog", { name: "Create API key" });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Deploy" } });
    const submit = within(dialog).getByRole("button", { name: "Create key" }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    expect(await screen.findByRole("dialog", { name: "Create API key" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Copy the API key" })).toBeNull();
  });
});
