import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.tsx";
import {
  loadTestResults,
  testResultTotals,
  type TestRunReport,
} from "./test-results.ts";

export function TestResultsPage() {
  const { t } = useI18n();
  const [report, setReport] = useState<TestRunReport | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let current = true;
    loadTestResults()
      .then((next) => {
        if (current) setReport(next);
      })
      .catch(() => {
        if (current) setReport(null);
      });
    return () => {
      current = false;
    };
  }, []);

  return (
    <div className="grid gap-4">
      <h1 className="font-heading text-2xl font-medium tracking-tight">
        {t("Last run")}
      </h1>
      {report === undefined ? null : report === null ? (
        <p className="text-sm text-muted-foreground">
          {t("No test run has been recorded yet.")}
        </p>
      ) : (
        <ResultsTable report={report} />
      )}
    </div>
  );
}

function ResultsTable({ report }: { report: TestRunReport }) {
  const { t } = useI18n();
  const totals = testResultTotals(report);
  const ranAt = formatRanAt(report.ranAt);
  return (
    <div className="grid gap-3">
      {ranAt ? (
        <p className="text-sm text-muted-foreground">
          {t("Ran at {time}.", { time: ranAt })}
        </p>
      ) : null}
      <p className="text-sm">
        {t("{passed} passed, {failed} failed, {skipped} skipped.", totals)}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("File")}</TableHead>
            <TableHead>{t("Passed")}</TableHead>
            <TableHead>{t("Failed")}</TableHead>
            <TableHead>{t("Skipped")}</TableHead>
            <TableHead>{t("Duration")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.files.map((file) => (
            <TableRow
              key={file.file}
              className={
                file.failed > 0
                  ? "bg-destructive/20 hover:bg-destructive/30"
                  : "bg-green-600/20 hover:bg-green-600/30 dark:bg-green-400/20 dark:hover:bg-green-400/30"
              }
            >
              <TableCell className="whitespace-normal font-mono text-xs">
                {file.file}
              </TableCell>
              <TableCell>{file.passed}</TableCell>
              <TableCell>{file.failed}</TableCell>
              <TableCell>{file.skipped}</TableCell>
              <TableCell>{file.durationMs} ms</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatRanAt(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
