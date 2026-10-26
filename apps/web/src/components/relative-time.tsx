import { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/en";
import "dayjs/locale/de";
import { useI18n } from "../i18n/index.tsx";

dayjs.extend(relativeTime);

export function RelativeTime({ value }: { value: string | Date }) {
  const { locale } = useI18n();
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const date = new Date(value);
  const formatted = dayjs(date)
    .locale(locale === "de" ? "de" : "en")
    .fromNow();

  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>
      {formatted}
    </time>
  );
}
