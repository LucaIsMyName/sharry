import { describe, expect, it } from "vitest";
import { addDays, inclusiveDays, initialWindow, maxAnalyticsDays, trackStartFor, utcToday } from "./analytics-range.ts";

describe("analytics range", () => {
  it("clamps the first window to the track and keeps a named range", () => {
    const today = utcToday();
    const created = addDays(today, -10);
    expect(trackStartFor("link", addDays(today, -800), created, today)).toBe(created);
    expect(trackStartFor("all", addDays(today, -800), created, today)).toBe(addDays(today, -800));
    const namedFrom = addDays(today, -40);
    const namedTo = addDays(today, -10);
    expect(initialWindow(created, today).from).toBe(created);
    expect(initialWindow(addDays(today, -800), today, namedFrom, namedTo)).toEqual({
      from: namedFrom,
      to: namedTo,
    });
    expect(inclusiveDays(addDays(today, -800), today) > maxAnalyticsDays).toBe(true);
  });
});
