import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Locale } from "@sharry/shared";
import {
  getLocale,
  setActiveLocale,
  subscribeLocale,
  t,
} from "./translate.ts";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "en" as Locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return children;
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "en" as Locale);
  return { locale, t, setLocale: setActiveLocale };
}

export function useAccountLocale(locale: string | undefined) {
  useEffect(() => {
    if (locale) setActiveLocale(locale);
  }, [locale]);
}

export { t, setActiveLocale };
