// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RowSkeleton } from "./skeleton.tsx";

afterEach(() => {
  cleanup();
});

describe("row skeleton", () => {
  it("marks the region busy and keeps the loading sentence for assistive tech", () => {
    render(<RowSkeleton label="Loading links…" />);
    expect(screen.getByText("Loading links…")).toBeTruthy();
    expect(document.querySelector("[aria-busy=true]")).toBeTruthy();
  });
});
