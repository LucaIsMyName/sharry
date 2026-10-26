import { describe, expect, it } from "vitest";
import { t } from "../i18n/index.tsx";
import { searchableDocs } from "../pages/docs-pages.ts";
import {
  catalogMatches,
  matchingDocs,
  pageCatalog,
  sectionCatalog,
} from "./search-catalog.ts";
import { rowFocusClass } from "./focus-row.ts";

describe("search catalog", () => {
  it("lists pages a person can open and hides admin pages", () => {
    const pages = catalogMatches("", pageCatalog, false, t, true).map((item) => item.title);
    expect(pages).toContain("Chat");
    expect(pages).not.toContain("Audit");
    expect(catalogMatches("", pageCatalog, true, t, true).map((item) => item.title)).toContain("Audit");
    expect(catalogMatches("", sectionCatalog, false, t, false)).toEqual([]);
  });

  it("matches account and settings sections", () => {
    expect(catalogMatches("two-factor", sectionCatalog, false, t, false).map((item) => item.to)).toEqual(["/account"]);
    expect(catalogMatches("prefix", sectionCatalog, false, t, false)).toEqual([]);
    expect(catalogMatches("mail server", sectionCatalog, true, t, false)[0]?.to).toBe("/admin/settings");
  });

  it("matches a phrase in the signing-in guide", () => {
    const hits = matchingDocs("Registration is closed", searchableDocs("en"));
    expect(hits.some((hit) => hit.slug === "user/signing-in")).toBe(true);
  });

  it("starts a doc snippet at a word", () => {
    const docs = searchableDocs("en");
    for (const hit of matchingDocs("two-factor", docs)) {
      if (!hit.snippet) continue;
      const plain = docs
        .find((doc) => doc.slug === hit.slug)!
        .text.replace(/[#>*_`[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const at = plain.indexOf(hit.snippet);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at === 0 || plain[at - 1] === " ").toBe(true);
    }
  });

  it("highlights only the focused row", () => {
    expect(rowFocusClass("row-1", "row-1")).toBe("bg-muted");
    expect(rowFocusClass("row-2", "row-1")).toBeUndefined();
  });
});
