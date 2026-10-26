import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ApiError, api } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { addDays, clampWindow, inclusiveDays, initialWindow, maxAnalyticsDays, utcToday } from "../pages/analytics-range.ts";
import { DateRangeSlider } from "../pages/date-range-slider.tsx";
import { Button } from "./ui/button.tsx";

export function useReportRange(earliest?: string) {
  const [today] = useState(() => utcToday());
  const trackStart = earliest && earliest <= today ? earliest : addDays(today, -399);
  const [range, setRange] = useState(() => initialWindow(addDays(utcToday(), -399), utcToday()));
  useEffect(() => {
    setRange((current) => {
      const next = clampWindow(current.from, current.to, trackStart, today);
      return next.from === current.from && next.to === current.to ? current : next;
    });
  }, [trackStart, today]);
  return { today, trackStart, range, setRange };
}

export function AnalyticsSummary({
  linkId,
  earliest,
  range,
  onRange,
  showRange = true,
}: {
  linkId?: string;
  earliest?: string;
  range: { from: string; to: string };
  onRange: (from: string, to: string) => void;
  showRange?: boolean;
}) {
  const { t } = useI18n();
  const [today] = useState(() => utcToday());
  const trackStart = earliest && earliest <= today ? earliest : addDays(today, -399);
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const tooLong = inclusiveDays(range.from, range.to) > maxAnalyticsDays;
  async function summarize() {
    if (pending || tooLong) return;
    setPending(true);
    setError("");
    try {
      const result = await api<{ summary: string }>("/api/ai/summarize-analytics", {
        method: "POST",
        body: JSON.stringify({
          from: range.from,
          to: range.to,
          ...(linkId ? { linkId } : {}),
        }),
      });
      setSummary(result.summary);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not read analytics.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-3">
      {showRange ? (
        <div className="grid gap-2">
          <span className="text-sm font-medium">{t("Date range")}</span>
          <DateRangeSlider min={trackStart} max={today} start={range.from} end={range.to} onChange={onRange} />
          {tooLong ? <p className="text-sm text-destructive">{t("Choose a range of 400 days or fewer")}</p> : null}
        </div>
      ) : null}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={pending || tooLong} onClick={() => void summarize()}>
          <Sparkles /> {pending ? t("Summarizing…") : t("Summarize")}
        </Button>
      </div>
      {summary ? <p className="text-sm">{summary}</p> : null}
      {error ? <p className="text-sm text-destructive">{t(error)}</p> : null}
    </div>
  );
}
