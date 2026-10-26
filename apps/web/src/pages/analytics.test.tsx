// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Analytics } from "../api.ts";
import { setActiveLocale } from "../i18n/index.tsx";
import { AnalyticsBreakdowns } from "./analytics.tsx";

afterEach(() => {
  cleanup();
  setActiveLocale("en");
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
