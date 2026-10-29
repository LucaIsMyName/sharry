import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, ".");
// A bare `confirm(` is the useConfirm hook, so only global access counts for it.
const nativeDialog = /\b(?:window|globalThis|self)\.(?:alert|confirm|prompt)\(|(?<![\w.])(?:alert|prompt)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

describe("browser dialogs", () => {
  it("are never used; the app shows its own Dialog instead", () => {
    const offenders = sourceFiles(root).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          nativeDialog.test(line) && !/^\s*(\/\/|\*)/.test(line) ? [`${relative(root, file)}:${index + 1}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
