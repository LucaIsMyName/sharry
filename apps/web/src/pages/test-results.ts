export type TestFileResult = {
  file: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
};

export type TestRunReport = {
  ranAt: string;
  files: TestFileResult[];
};

export type CountedTestState = "passed" | "failed" | "skipped" | "pending";

const header = "file,passed,failed,skipped,duration_ms";

export function summarizeFile(input: {
  file: string;
  durationMs: number;
  tests: readonly CountedTestState[];
  moduleFailed?: boolean;
}): TestFileResult {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const state of input.tests) {
    if (state === "passed") passed += 1;
    else if (state === "failed") failed += 1;
    else skipped += 1;
  }
  if (input.moduleFailed && passed === 0 && failed === 0 && skipped === 0) {
    failed = 1;
  }
  return {
    file: input.file,
    passed,
    failed,
    skipped,
    durationMs: Math.max(0, Math.round(input.durationMs)),
  };
}

export function testResultTotals(report: TestRunReport): {
  passed: number;
  failed: number;
  skipped: number;
} {
  return report.files.reduce(
    (totals, file) => ({
      passed: totals.passed + file.passed,
      failed: totals.failed + file.failed,
      skipped: totals.skipped + file.skipped,
    }),
    { passed: 0, failed: 0, skipped: 0 },
  );
}

export function formatTestResults(report: TestRunReport): string {
  const lines = [`# ran_at=${report.ranAt}`, header];
  for (const file of report.files) {
    lines.push(
      [
        quoteCsv(file.file),
        String(file.passed),
        String(file.failed),
        String(file.skipped),
        String(file.durationMs),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function parseTestResults(source: string): TestRunReport {
  let ranAt = "";
  const files: TestFileResult[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const marker = "# ran_at=";
      if (line.startsWith(marker)) ranAt = line.slice(marker.length).trim();
      continue;
    }
    const cells = parseCsvRow(line);
    if (cells.length !== 5) continue;
    if (cells[0] === "file" && cells[1] === "passed") continue;
    const passed = parseCount(cells[1]);
    const failed = parseCount(cells[2]);
    const skipped = parseCount(cells[3]);
    const durationMs = parseCount(cells[4]);
    if (
      passed === null ||
      failed === null ||
      skipped === null ||
      durationMs === null
    ) {
      continue;
    }
    files.push({
      file: cells[0] ?? "",
      passed,
      failed,
      skipped,
      durationMs,
    });
  }
  return { ranAt, files };
}

export async function loadTestResults(
  fetchImpl: typeof fetch = fetch,
): Promise<TestRunReport | null> {
  try {
    const response = await fetchImpl(`/test-results.csv?ts=${Date.now()}`);
    if (!response.ok) return null;
    const report = parseTestResults(await response.text());
    if (report.files.length === 0) return null;
    return report;
  } catch {
    return null;
  }
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCount(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char ?? "";
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char ?? "";
  }
  cells.push(current);
  return cells;
}
