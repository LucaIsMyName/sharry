// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setActiveLocale } from "../i18n/index.tsx";
import { TestResultsPage } from "./test-results-page.tsx";
import { formatTestResults, type TestRunReport } from "./test-results.ts";

const report: TestRunReport = {
  ranAt: "2026-10-26T07:28:00.000Z",
  files: [
    {
      file: "apps/web/src/pages/docs-nav.test.tsx",
      passed: 3,
      failed: 0,
      skipped: 0,
      durationMs: 45,
    },
    {
      file: "apps/api/test/links.test.ts",
      passed: 4,
      failed: 1,
      skipped: 0,
      durationMs: 1200,
    },
  ],
};

afterEach(() => {
  cleanup();
  setActiveLocale("en");
  vi.unstubAllGlobals();
});

describe("TestResultsPage", () => {
  it("tints a fully passing file green and a file with a failure red", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(formatTestResults(report))),
    );
    render(<TestResultsPage />);

    const passed = await screen.findByText("apps/web/src/pages/docs-nav.test.tsx");
    const failed = screen.getByText("apps/api/test/links.test.ts");
    expect(passed.closest("tr")?.className).toContain("bg-green-600/20");
    expect(failed.closest("tr")?.className).toContain("bg-destructive/20");
  });
});
