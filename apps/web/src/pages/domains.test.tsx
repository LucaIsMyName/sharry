// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { setActiveLocale } from "../i18n/index.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { AdminDomainsPage } from "./domains.tsx";

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

function renderDomains() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/admin/domains"]}>
        <AdminDomainsPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function installApi(fail = false) {
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/admin/redirect-domains" && init?.method === "POST") {
      if (fail) throw new Error("Could not add the domain");
      const body = JSON.parse(String(init.body)) as { hostname: string };
      return {
        domain: {
          id: "d1",
          hostname: body.hostname,
          status: "pending",
          txtName: "_sharry-challenge.go.brand.com",
          txtValue: "token",
          lastError: null,
          verifiedAt: null,
        },
        serverAddresses: ["203.0.113.10"],
      };
    }
    if (path === "/api/admin/redirect-domains") return { domains: [], serverAddresses: ["203.0.113.10"] };
    throw new Error(`unexpected ${path}`);
  });
}

describe("add domain", () => {
  it("opens a dialog from the button beside the heading", async () => {
    installApi();
    renderDomains();
    const heading = await screen.findByRole("heading", { name: "Domains" });
    const button = screen.getByRole("button", { name: "Add domain" });
    expect(heading.parentElement?.parentElement?.contains(button)).toBe(true);
    expect(button.className).toContain("h-7");
    expect(screen.queryByLabelText("Domain")).toBeNull();

    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Add domain" });
    expect(within(dialog).getByLabelText("Domain")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Add domain" })).toBeTruthy();
  });

  it("adds the hostname and opens the DNS records", async () => {
    installApi();
    renderDomains();
    fireEvent.click(await screen.findByRole("button", { name: "Add domain" }));
    const dialog = await screen.findByRole("dialog", { name: "Add domain" });
    fireEvent.change(within(dialog).getByLabelText("Domain"), { target: { value: "go.brand.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add domain" }));

    const setup = await screen.findByRole("dialog", { name: "Set up go.brand.com" });
    expect(setup.textContent).toContain("203.0.113.10");
    expect(screen.queryByRole("dialog", { name: "Add domain" })).toBeNull();
  });

  it("keeps the dialog open when adding fails", async () => {
    installApi(true);
    renderDomains();
    fireEvent.click(await screen.findByRole("button", { name: "Add domain" }));
    const dialog = await screen.findByRole("dialog", { name: "Add domain" });
    fireEvent.change(within(dialog).getByLabelText("Domain"), { target: { value: "go.brand.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add domain" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Add domain" })).toBeTruthy());
    expect(screen.queryByRole("dialog", { name: "Set up go.brand.com" })).toBeNull();
  });
});
