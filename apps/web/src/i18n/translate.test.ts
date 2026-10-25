import { describe, expect, it } from "vitest";
import { de } from "./de.ts";
import { getLocale, setActiveLocale, t } from "./translate.ts";

describe("t", () => {
  it("returns german copy, falls back to english, and fills placeholders", () => {
    const previous = getLocale();
    const key = "Catalog probe {name}";
    de[key] = "Katalogprobe {name}";
    setActiveLocale("de");
    expect(t(key, { name: "Ada" })).toBe("Katalogprobe Ada");
    expect(t("Missing sentence")).toBe("Missing sentence");
    expect(t(key, {})).toBe("Katalogprobe {name}");
    setActiveLocale("en");
    expect(t(key, { name: "Ada" })).toBe("Catalog probe Ada");
    setActiveLocale("fr");
    expect(getLocale()).toBe("en");
    setActiveLocale(previous);
    delete de[key];
  });
});
