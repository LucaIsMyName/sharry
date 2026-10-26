import { describe, expect, it } from "vitest";
import { chartDayLabel } from "./chart-day.ts";

describe("chartDayLabel", () => {
  it("formats a calendar day for the locale", () => {
    expect(chartDayLabel("2026-10-26", "en-US")).toMatch(/Oct/);
    expect(chartDayLabel("2026-10-26", "en-US")).toMatch(/26/);
    expect(chartDayLabel("2026-10-26", "de-DE")).toMatch(/Okt/);
    expect(chartDayLabel("not-a-day", "en-US")).toBe("not-a-day");
  });
});
