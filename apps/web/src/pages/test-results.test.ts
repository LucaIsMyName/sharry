import { describe, expect, it } from "vitest";
import {
  formatTestResults,
  loadTestResults,
  parseTestResults,
  summarizeFile,
  testResultTotals,
  type TestRunReport,
} from "./test-results.ts";

const report: TestRunReport = {
  ranAt: "2026-10-26T07:28:00.000Z",
  files: [
    {
      file: 'apps/web/src/say "hi", now.test.ts',
      passed: 2,
      failed: 0,
      skipped: 1,
      durationMs: 18,
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

describe("test results csv", () => {
  it("writes a quoted csv and reads it back", () => {
    const csv = formatTestResults(report);
    expect(csv.startsWith("# ran_at=2026-10-26T07:28:00.000Z\n")).toBe(true);
    expect(csv).toContain('"apps/web/src/say ""hi"", now.test.ts",2,0,1,18');
    expect(parseTestResults(csv)).toEqual(report);
    expect(testResultTotals(report)).toEqual({
      passed: 6,
      failed: 1,
      skipped: 1,
    });
  });

  it("counts a file that failed before any test ran", () => {
    expect(
      summarizeFile({
        file: "apps/api/test/broken.test.ts",
        durationMs: 3.6,
        tests: [],
        moduleFailed: true,
      }),
    ).toEqual({
      file: "apps/api/test/broken.test.ts",
      passed: 0,
      failed: 1,
      skipped: 0,
      durationMs: 4,
    });
  });

  it("returns null when the csv is missing", async () => {
    const missing = await loadTestResults(
      async () => new Response("", { status: 404 }),
    );
    expect(missing).toBeNull();

    const quoted = await loadTestResults(async () => new Response(formatTestResults(report)));
    expect(quoted).toEqual(report);
  });
});
