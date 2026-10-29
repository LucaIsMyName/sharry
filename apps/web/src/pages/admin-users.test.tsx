// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { AdminUsersPage } from "./admin.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

type User = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  isActive: boolean;
  mustChangePassword: boolean;
};

const ada: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  role: "admin",
  isActive: true,
  mustChangePassword: false,
};

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
  localStorage.clear();
});

function renderUsers() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/admin/users"]}>
        <AdminUsersPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function installApi(users: User[], failCreate = false) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/admin/users" && init?.method === "POST") {
      if (failCreate) throw new Error("That username or email is already in use.");
      const body = JSON.parse(String(init.body)) as { username: string; email: string; role: "admin" | "user" };
      users.push({
        id: "u2",
        username: body.username,
        email: body.email,
        role: body.role,
        isActive: true,
        mustChangePassword: true,
      });
      return {};
    }
    if (path === "/api/admin/users") return { users: users.map((user) => ({ ...user })) };
    throw new Error(`unexpected ${path}`);
  });
}

async function openCreate() {
  fireEvent.click(await screen.findByRole("button", { name: "Create user" }));
  return screen.findByRole("dialog");
}

describe("create user", () => {
  it("keeps the form in a dialog opened by the button under the heading", async () => {
    installApi([ada]);
    renderUsers();
    const heading = await screen.findByRole("heading", { name: "Users" });
    const button = screen.getByRole("button", { name: "Create user" });
    expect(heading.parentElement).toBe(button.parentElement);
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Username")).toBeNull();

    const dialog = await openCreate();
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("max-h-[calc(100svh-2rem)]");
    expect(within(dialog).getByRole("heading", { name: "Create user" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Username")).toBeTruthy();
    expect(within(dialog).getByLabelText("Email")).toBeTruthy();
    expect(within(dialog).getByLabelText("Temporary password")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Create account" })).toBeTruthy();
  });

  it("creates the account, closes the dialog, and shows the new user", async () => {
    const users = [ada];
    installApi(users);
    renderUsers();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "grace" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "grace@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("Temporary password"), { target: { value: "temporary-pass" } });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Role" }));
    const admin = screen.getByRole("option", { name: "admin" });
    fireEvent.pointerDown(admin, { button: 0 });
    fireEvent.pointerUp(admin, { button: 0 });
    fireEvent.click(admin);
    fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("grace")).toBeTruthy();
    const post = apiMock.mock.calls.find((call) => call[1]?.method === "POST");
    expect(JSON.parse(String(post?.[1].body))).toMatchObject({
      username: "grace",
      email: "grace@example.com",
      password: "temporary-pass",
      role: "admin",
    });
  });

  it("keeps the dialog open when creation fails", async () => {
    installApi([ada], true);
    renderUsers();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "ada" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(within(dialog).getByLabelText("Temporary password"), { target: { value: "temporary-pass" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getAllByText("That username or email is already in use.").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByLabelText("Username")).toHaveProperty("value", "ada");
  });

  it("drops a half-filled form when the dialog closes", async () => {
    installApi([ada]);
    renderUsers();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: "grace" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Generate password" }));
    expect(within(dialog).getByLabelText("Temporary password")).toHaveProperty("type", "text");
    expect(within(dialog).getByRole("button", { name: "Copy password" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const again = await openCreate();
    expect(within(again).getByLabelText("Username")).toHaveProperty("value", "");
    expect(within(again).getByLabelText("Temporary password")).toHaveProperty("value", "");
    expect(within(again).queryByRole("button", { name: "Copy password" })).toBeNull();
  });
});
