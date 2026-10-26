// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveLocale } from "../i18n/index.tsx";
import { RelativeTime } from "./relative-time.tsx";

const now = new Date("2026-10-26T12:00:00Z");
const earlier = "2026-10-26T11:57:00Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.useRealTimers();
});

describe("RelativeTime", () => {
  it("shows an English relative time and the full local time", () => {
    setActiveLocale("en");
    render(<RelativeTime value={earlier} />);
    const time = screen.getByText("3 minutes ago");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe(new Date(earlier).toISOString());
    expect(time.getAttribute("title")).toBe(new Date(earlier).toLocaleString("en"));
  });

  it("shows a German relative time", () => {
    setActiveLocale("de");
    render(<RelativeTime value={earlier} />);
    expect(screen.getByText("vor 3 Minuten").getAttribute("title")).toBe(
      new Date(earlier).toLocaleString("de"),
    );
  });
});
