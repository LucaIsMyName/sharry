import { describe, expect, it } from "vitest";
import { readSidebarOpen, writeSidebarOpen } from "./sidebar-state.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("sidebar state", () => {
  it("starts open and remembers a closed rail", () => {
    const storage = memoryStorage();
    expect(readSidebarOpen(storage)).toBe(true);
    writeSidebarOpen(false, storage);
    expect(readSidebarOpen(storage)).toBe(false);
    writeSidebarOpen(true, storage);
    expect(readSidebarOpen(storage)).toBe(true);
  });
});
