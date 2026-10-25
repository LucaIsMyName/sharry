import { locales, type Locale } from "@sharry/shared";
import { de } from "./de.ts";

const STORAGE_KEY = "sharry.locale";

const catalogs: Record<Locale, Record<string, string>> = {
  en: {},
  de,
};

let active: Locale = readStored();

const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return active;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveLocale(next: string): void {
  const locale = isLocale(next) ? next : "en";
  active = locale;
  writeStored(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}

export function t(
  message: string,
  vars?: Record<string, string | number>,
): string {
  const template = catalogs[active][message] ?? message;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

function readStored(): Locale {
  try {
    if (typeof localStorage === "undefined") return "en";
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

function writeStored(locale: Locale): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The language still applies for this visit when storage is blocked.
  }
}
