// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveLocale } from "../i18n/index.tsx";
import { ToastProvider } from "../components/ui/toast.tsx";
import { ServerPage } from "./server.tsx";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock("../api.ts", () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

const snapshot = {
  collectedAt: "2026-01-01T00:00:00.000Z",
  memory: { totalBytes: 8 * 1024 ** 3, availableBytes: 1024 ** 3, usedBytes: 7 * 1024 ** 3, processRssBytes: 100 * 1024 ** 2 },
  storage: {
    totalBytes: 200 * 1024 ** 3,
    availableBytes: 40 * 1024 ** 3,
    usedBytes: 160 * 1024 ** 3,
    databaseBytes: 4 * 1024 ** 3,
    parts: [
      { id: "operatingSystem", bytes: 100 * 1024 ** 3 },
      { id: "node", bytes: 80 * 1024 ** 2 },
      { id: "code", bytes: 200 * 1024 ** 2 },
      { id: "packages", bytes: 500 * 1024 ** 2 },
      { id: "media", bytes: 12 * 1024 ** 3 },
      { id: "database", bytes: 4 * 1024 ** 3 },
    ],
  },
  os: { platform: "linux", type: "Linux", release: "24.04", arch: "x64", hostname: "sharry" },
  cpu: { cores: 2, loadAverage: [0.1, 0.2, 0.3] },
  uptime: { systemSeconds: 90, processSeconds: 30 },
  runtime: { packageName: "sharry", packageVersion: "0.0.94", nodeVersion: "v22.23.4", postgresVersion: "PostgreSQL 16" },
};

afterEach(() => {
  cleanup();
  apiMock.mockReset();
  setActiveLocale("en");
});

describe("server page", () => {
  it("drops the repeated totals and lists what uses the disk", async () => {
    apiMock.mockResolvedValue(snapshot);
    render(
      <ToastProvider>
        <ServerPage />
      </ToastProvider>,
    );
    expect(await screen.findByRole("heading", { name: "What uses this disk" })).toBeTruthy();
    expect(screen.getAllByText("Operating system").length).toBeGreaterThan(0);
    expect(screen.getByText("100 GB")).toBeTruthy();
    expect(screen.getAllByText("Node").length).toBeGreaterThan(0);
    expect(screen.getByText("Packages")).toBeTruthy();
    expect(screen.getByText("Media")).toBeTruthy();
    expect(screen.getByText("Database")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Memory" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Storage" })).toBeTruthy();
    expect(screen.queryByText("RAM used")).toBeNull();
    expect(screen.queryByText("RAM available")).toBeNull();
    expect(screen.queryByText("Storage used")).toBeNull();
    expect(screen.queryByText("Storage available")).toBeNull();
  });
});
