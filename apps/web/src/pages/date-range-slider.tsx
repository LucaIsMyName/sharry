import { useI18n } from "../i18n/index.tsx";
import { dayFromNumber, dayNumber } from "./analytics-range.ts";

export function DateRangeSlider({
  min,
  max,
  start,
  end,
  onChange,
}: {
  min: string;
  max: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const { t } = useI18n();
  const minIndex = dayNumber(min);
  const maxIndex = dayNumber(max);
  const startIndex = dayNumber(start);
  const endIndex = dayNumber(end);
  const span = Math.max(1, maxIndex - minIndex);
  const startPct = ((startIndex - minIndex) / span) * 100;
  const endPct = ((endIndex - minIndex) / span) * 100;
  const thumb =
    "pointer-events-none absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary";
  return (
    <div className="grid gap-2">
      <div className="flex justify-between gap-3 text-sm">
        <span>{start}</span>
        <span>{end}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        <input
          className={thumb}
          type="range"
          aria-label={t("Start date")}
          min={minIndex}
          max={maxIndex}
          value={startIndex}
          onChange={(event) => onChange(dayFromNumber(Math.min(Number(event.target.value), endIndex)), end)}
        />
        <input
          className={thumb}
          type="range"
          aria-label={t("End date")}
          min={minIndex}
          max={maxIndex}
          value={endIndex}
          onChange={(event) => onChange(start, dayFromNumber(Math.max(Number(event.target.value), startIndex)))}
        />
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
