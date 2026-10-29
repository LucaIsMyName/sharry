import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { dayFromNumber, dayNumber } from "./analytics-range.ts";

const settleMs = 400;

export type DateRangeCommit = {
  current: (() => { start: string; end: string }) | null;
};

export function DateRangeSlider({
  min,
  max,
  start,
  end,
  onChange,
  commitRef,
}: {
  min: string;
  max: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  commitRef?: DateRangeCommit;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ start, end });
  const draftRef = useRef(draft);
  const committed = useRef({ start, end });
  const dragging = useRef(false);
  const pending = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function flush() {
    if (pending.current != null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    dragging.current = false;
    const next = draftRef.current;
    if (next.start !== committed.current.start || next.end !== committed.current.end) {
      committed.current = { start: next.start, end: next.end };
      onChangeRef.current(next.start, next.end);
    }
    return { start: next.start, end: next.end };
  }
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (dragging.current || pending.current != null) return;
    const next = { start, end };
    draftRef.current = next;
    committed.current = next;
    setDraft(next);
  }, [start, end]);

  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = () => flushRef.current();
    return () => {
      commitRef.current = null;
    };
  }, [commitRef]);

  useEffect(
    () => () => {
      if (pending.current != null) window.clearTimeout(pending.current);
    },
    [],
  );

  function schedule() {
    if (pending.current != null) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      pending.current = null;
      flushRef.current();
    }, settleMs);
  }

  function move(next: { start: string; end: string }) {
    dragging.current = true;
    draftRef.current = next;
    setDraft(next);
    schedule();
  }

  const minIndex = dayNumber(min);
  const maxIndex = dayNumber(max);
  const startIndex = dayNumber(draft.start);
  const endIndex = dayNumber(draft.end);
  const span = Math.max(1, maxIndex - minIndex);
  const startPct = ((startIndex - minIndex) / span) * 100;
  const endPct = ((endIndex - minIndex) / span) * 100;
  const thumb =
    "pointer-events-none absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary pointer-coarse:h-11 pointer-coarse:[&::-moz-range-thumb]:size-11 pointer-coarse:[&::-moz-range-thumb]:border-[10px] pointer-coarse:[&::-moz-range-thumb]:border-solid pointer-coarse:[&::-moz-range-thumb]:border-transparent pointer-coarse:[&::-moz-range-thumb]:bg-clip-padding pointer-coarse:[&::-webkit-slider-thumb]:size-11 pointer-coarse:[&::-webkit-slider-thumb]:border-[10px] pointer-coarse:[&::-webkit-slider-thumb]:border-solid pointer-coarse:[&::-webkit-slider-thumb]:border-transparent pointer-coarse:[&::-webkit-slider-thumb]:bg-clip-padding";
  return (
    <div className="grid gap-2">
      <div className="flex justify-between gap-3 text-sm">
        <span>{draft.start}</span>
        <span>{draft.end}</span>
      </div>
      <div className="relative h-6 pointer-coarse:h-11">
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
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => flush()}
          onPointerCancel={() => flush()}
          onBlur={() => flush()}
          onChange={(event) =>
            move({
              start: dayFromNumber(Math.min(Number(event.target.value), dayNumber(draftRef.current.end))),
              end: draftRef.current.end,
            })
          }
        />
        <input
          className={thumb}
          type="range"
          aria-label={t("End date")}
          min={minIndex}
          max={maxIndex}
          value={endIndex}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => flush()}
          onPointerCancel={() => flush()}
          onBlur={() => flush()}
          onChange={(event) =>
            move({
              start: draftRef.current.start,
              end: dayFromNumber(Math.max(Number(event.target.value), dayNumber(draftRef.current.start))),
            })
          }
        />
      </div>
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
