// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { api, type Analytics } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { AnalyticsBreakdowns, AnalyticsPage } from "./analytics.tsx";

vi.mock("../api.ts", async () => {
  const actual = await vi.importActual<typeof import("../api.ts")>("../api.ts");
  return { ...actual, api: vi.fn() };
});

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.clearAllMocks();
});

const analytics: Analytics = {
  totalClicks: 5,
  uniqueVisitors: 3,
  botClicks: 2,
  series: [],
  referrers: [],
  countries: [{ name: "DE", clicks: 3 }],
  browsers: [{ name: "Chrome", clicks: 4 }],
  operatingSystems: [{ name: "macOS", clicks: 4 }],
  devices: [{ name: "desktop", clicks: 4 }],
  utmSources: [{ name: "newsletter", clicks: 1 }],
  utmMediums: [],
  utmCampaigns: [],
  utmIds: [],
  utmTerms: [],
  utmContents: [],
  campaigns: [],
  qrCodes: [],
};

describe("analytics breakdowns", () => {
  it("shows operating systems, browsers, devices, countries, bots, and utm", () => {
    render(<AnalyticsBreakdowns analytics={analytics} />);
    expect(screen.getByRole("heading", { name: "Operating systems" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Browsers" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Devices" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Countries" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bots" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "utm_source" })).toBeTruthy();
    expect(screen.getByText("People")).toBeTruthy();
    expect(screen.getByText("macOS")).toBeTruthy();
    expect(screen.getByText("newsletter")).toBeTruthy();
  });
});

const busy = "11111111-1111-4111-8111-111111111111";
const quiet = "22222222-2222-4222-8222-222222222222";

describe("analytics page", () => {
  it("puts the filter bar between the heading and the cards, and the summary above the slider", async () => {
    const calls: string[] = [];
    const bodies: string[] = [];
    vi.mocked(api).mockImplementation((path: string, init?: RequestInit) => {
      calls.push(path);
      if (typeof init?.body === "string") bodies.push(init.body);
      if (path.startsWith("/api/ai/status")) {
        return Promise.resolve({ available: true, provider: "openai", model: "gpt-4.1-mini" });
      }
      if (path === "/api/ai/summarize-analytics") {
        return Promise.resolve({ summary: "Filtered.", from: "2026-10-01", to: "2026-10-26" });
      }
      if (path.startsWith("/api/analytics")) {
        return Promise.resolve({
          ...analytics,
          totalClicks: 42,
          links: [
            { id: busy, slug: "busy", title: "Busy", clicks: 2, uniqueVisitors: 1 },
            { id: quiet, slug: "quiet", title: "Quiet", clicks: 1, uniqueVisitors: 1 },
          ],
          options: {
            countries: ["DE"],
            browsers: [],
            operatingSystems: [],
            utmSources: [],
            utmMediums: [],
            utmCampaigns: [],
            utmIds: [],
            utmTerms: [],
            utmContents: [],
          },
        });
      }
      return Promise.reject(new Error(path));
    });
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <AnalyticsPage />
      </MemoryRouter>,
    );
    const heading = await screen.findByRole("heading", { name: "Analytics" });
    const links = screen.getByRole("button", { name: "Links" });
    expect(await screen.findByText("42")).toBeTruthy();
    const clicks = screen.getAllByText("Clicks")[0];
    if (!clicks) throw new Error("missing clicks");
    expect(heading.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(links.compareDocumentPosition(clicks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const summarize = await screen.findByRole("button", { name: "Summarize" });
    const slider = screen.getByRole("slider", { name: "Start date" });
    expect(summarize.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(summarize.closest("[data-slot=card]")?.querySelector("input[type=range]")).toBeNull();

    fireEvent.click(links);
    fireEvent.click(screen.getByRole("checkbox", { name: "Busy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Quiet" }));
    fireEvent.click(screen.getByRole("button", { name: "Country" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "DE" }));
    await waitFor(() => {
      const last = calls.filter((path) => path.startsWith("/api/analytics")).at(-1) ?? "";
      expect(last).toContain(`link=${busy}`);
      expect(last).toContain(`link=${quiet}`);
      expect(last).toContain("country=DE");
    });
    fireEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await waitFor(() => {
      const body = JSON.parse(bodies.at(-1) ?? "{}") as { linkIds?: string[]; country?: string[] };
      expect(body.linkIds).toEqual([busy, quiet]);
      expect(body.country).toEqual(["DE"]);
    });
    expect(await screen.findByText("Filtered.")).toBeTruthy();
  });
});
