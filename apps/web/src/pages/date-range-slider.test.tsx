// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayNumber } from "./analytics-range.ts";
import { DateRangeSlider } from "./date-range-slider.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderSlider(onChange = vi.fn()) {
  render(
    <DateRangeSlider
      min="2026-10-01"
      max="2026-10-31"
      start="2026-10-10"
      end="2026-10-20"
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("date range slider", () => {
  it("moves the labels immediately and reports the range when the pointer is released", () => {
    const onChange = renderSlider();
    const start = screen.getByRole("slider", { name: "Start date" });
    fireEvent.change(start, { target: { value: String(dayNumber("2026-10-08")) } });
    expect(screen.getByText("2026-10-08")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(start);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-10-08", "2026-10-20");
  });

  it("reports the range after a pause while the pointer is still down", () => {
    vi.useFakeTimers();
    const onChange = renderSlider();
    const start = screen.getByRole("slider", { name: "Start date" });
    fireEvent.pointerDown(start);
    fireEvent.change(start, { target: { value: String(dayNumber("2026-10-08")) } });
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2026-10-08", "2026-10-20");
  });
});
