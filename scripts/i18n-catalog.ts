import fs from "node:fs";
import path from "node:path";
import { extractApiDocs } from "./generate-api-docs.ts";

const root = path.resolve(import.meta.dirname, "..");

const SKIP_PLACEHOLDER = /^(?:go\.brand\.com|smtp\.example\.com|sharry@example\.com)$/;

export function requiredMessages(): string[] {
  const found = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value == null || value.trim() === "" || SKIP_PLACEHOLDER.test(value.trim())) return;
    if (value.includes("${")) return;
    found.add(value);
  };

  walk(path.join(root, "apps/web/src"), (file, text) => {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return;
    if (file.endsWith(`${path.sep}i18n${path.sep}de.ts`)) return;
    for (const match of text.matchAll(/\bt\(\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      add(unescape(match[2] ?? ""));
    }
    for (const match of text.matchAll(
      /\b(?:label|description):\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? ""));
    }
    if (!file.endsWith(".tsx")) return;
    for (const match of text.matchAll(
      /\b(?:label|title|description|confirmLabel|lede|placeholder|info)\s*=\s*(?:\{[^}\n]*\?\s*)?(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? ""));
    }
    for (const match of text.matchAll(
      /\?\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1\s*:\s*(["'])((?:\\.|(?!\3)[\s\S])*?)\3/g,
    )) {
      for (const value of [unescape(match[2] ?? ""), unescape(match[4] ?? "")]) {
        if (/[A-Z]/.test(value)) add(value);
      }
    }
  });

  const router = fs.readFileSync(path.join(root, "apps/web/src/router.tsx"), "utf8");
  for (const match of router.matchAll(/title:\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
    add(unescape(match[2] ?? ""));
  }

  walk(path.join(root, "apps/api/src"), (file, text) => {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) return;
    for (const match of text.matchAll(
      /new AppError\(\s*\d+\s*,\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? "").replace(/\s+/g, " ").trim());
    }
    for (const match of text.matchAll(
      /(?:const|let)\s+(?:TXT_MISSING|TXT_LOOKUP_FAILED)\s*=\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? ""));
    }
  });

  for (const file of [
    "packages/shared/src/prefix.ts",
    "packages/shared/src/domain.ts",
    "packages/shared/src/qr.ts",
    "packages/shared/src/schemas.ts",
    "packages/shared/src/ai.ts",
  ]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    for (const match of text.matchAll(/return\s+(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      add(unescape(match[2] ?? ""));
    }
    for (const match of text.matchAll(/message:\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      add(unescape(match[2] ?? ""));
    }
    for (const match of text.matchAll(
      /SLUG_TAKEN_MESSAGE\s*=\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? ""));
    }
    for (const match of text.matchAll(
      /\.regex\(\s*\/[\s\S]*?\/[a-z]*\s*,\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )) {
      add(unescape(match[2] ?? ""));
    }
    const url = text.match(/,\s*(["'])(Enter a valid http or https URL)\1/);
    if (url) add(url[2]);
  }

  for (const doc of extractApiDocs(path.join(root, "apps/api/src"))) {
    add(doc.tag);
    add(doc.summary);
    add(doc.auth);
    add(doc.body);
    for (const param of [...doc.params, ...doc.query]) add(param.description);
    for (const response of doc.responses) add(response.description);
  }

  add("Choose");
  add("Cancel");
  add("Close");
  add("Dismiss");
  return [...found].sort((left, right) => left.localeCompare(right));
}

function walk(dir: string, visit: (file: string, text: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (/\.(ts|tsx)$/.test(entry.name)) visit(full, fs.readFileSync(full, "utf8"));
  }
}

function unescape(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\(["'\\])/g, "$1");
}
