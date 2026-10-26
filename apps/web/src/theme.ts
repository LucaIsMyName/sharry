import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const storageKey = "sharry.theme";

let current: ThemeChoice = "system";
const listeners = new Set<() => void>();

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(storageKey);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage can be blocked. System is the fallback.
  }
  return "system";
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function emit() {
  for (const listener of listeners) listener();
}

export function getTheme(): ThemeChoice {
  return current;
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    localStorage.setItem(storageKey, choice);
  } catch {
    // The class still updates for this visit.
  }
  applyTheme(choice);
  emit();
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribeTheme, getTheme, () => "system");
}

export function startTheme() {
  current = readStored();
  applyTheme(current);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (current === "system") applyTheme("system");
  });
}

if (typeof document !== "undefined") startTheme();
