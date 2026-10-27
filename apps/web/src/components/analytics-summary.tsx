import { useEffect, useRef, useState } from "react";
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

export type AnalyticsSummaryFilters = {
  linkIds?: string[];
  country?: string[];
  browser?: string[];
  os?: string[];
  referrer?: string[];
  device?: string[];
  utm_source?: string[];
  utm_medium?: string[];
  utm_campaign?: string[];
  utm_id?: string[];
  utm_term?: string[];
  utm_content?: string[];
};

function listed(values: string[] | undefined): string[] | undefined {
  const next = values?.map((value) => value.trim()).filter((value) => value.length > 0);
  return next && next.length > 0 ? next : undefined;
}

export function AnalyticsSummary({
  linkId,
  earliest,
  range,
  onRange,
  showRange = true,
  filters,
}: {
  linkId?: string;
  earliest?: string;
  range: { from: string; to: string };
  onRange: (from: string, to: string) => void;
  showRange?: boolean;
  filters?: AnalyticsSummaryFilters;
}) {
  const { t } = useI18n();
  const [today] = useState(() => utcToday());
  const trackStart = earliest && earliest <= today ? earliest : addDays(today, -399);
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const filterKey = JSON.stringify({
    from: range.from,
    to: range.to,
    linkId: linkId ?? "",
    linkIds: filters?.linkIds ?? [],
    country: filters?.country ?? [],
    browser: filters?.browser ?? [],
    os: filters?.os ?? [],
    referrer: filters?.referrer ?? [],
    device: filters?.device ?? [],
    utm_source: filters?.utm_source ?? [],
    utm_medium: filters?.utm_medium ?? [],
    utm_campaign: filters?.utm_campaign ?? [],
    utm_id: filters?.utm_id ?? [],
    utm_term: filters?.utm_term ?? [],
    utm_content: filters?.utm_content ?? [],
  });
  const tooLong = inclusiveDays(range.from, range.to) > maxAnalyticsDays;
  useEffect(() => {
    request.current += 1;
    setSummary("");
    setError("");
    setPending(false);
  }, [filterKey]);
  async function summarize() {
    if (tooLong) return;
    const id = ++request.current;
    const linkIds = listed(filters?.linkIds);
    const country = listed(filters?.country);
    const browser = listed(filters?.browser);
    const os = listed(filters?.os);
    const referrer = listed(filters?.referrer);
    const device = listed(filters?.device);
    const utmSource = listed(filters?.utm_source);
    const utmMedium = listed(filters?.utm_medium);
    const utmCampaign = listed(filters?.utm_campaign);
    const utmId = listed(filters?.utm_id);
    const utmTerm = listed(filters?.utm_term);
    const utmContent = listed(filters?.utm_content);
    setPending(true);
    setError("");
    try {
      const result = await api<{ summary: string }>("/api/ai/summarize-analytics", {
        method: "POST",
        body: JSON.stringify({
          from: range.from,
          to: range.to,
          ...(linkIds ? { linkIds } : linkId ? { linkId } : {}),
          ...(country ? { country } : {}),
          ...(browser ? { browser } : {}),
          ...(os ? { os } : {}),
          ...(referrer ? { referrer } : {}),
          ...(device ? { device } : {}),
          ...(utmSource ? { utm_source: utmSource } : {}),
          ...(utmMedium ? { utm_medium: utmMedium } : {}),
          ...(utmCampaign ? { utm_campaign: utmCampaign } : {}),
          ...(utmId ? { utm_id: utmId } : {}),
          ...(utmTerm ? { utm_term: utmTerm } : {}),
          ...(utmContent ? { utm_content: utmContent } : {}),
        }),
      });
      if (id !== request.current) return;
      setSummary(result.summary);
    } catch (caught) {
      if (id !== request.current) return;
      setError(caught instanceof ApiError ? caught.message : "Could not read analytics.");
    } finally {
      if (id === request.current) setPending(false);
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
