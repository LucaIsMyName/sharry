import { describe, expect, it } from "vitest";
import { pageBlocks, type PageField } from "@sharry/shared";
import { de } from "../../i18n/de.ts";
import { blockIcons } from "./block-icons.tsx";

function fieldStrings(fields: Record<string, PageField>): string[] {
  return Object.values(fields).flatMap((spec) => [
    spec.label,
    ...(spec.help ? [spec.help] : []),
    ...(spec.kind === "choice" ? spec.options.map((option) => option.label) : []),
    ...(spec.kind === "list" ? [spec.itemLabel, ...fieldStrings(spec.item)] : []),
  ]);
}

describe("builder blocks in the editor", () => {
  it("has an icon for every registered block", () => {
    for (const definition of pageBlocks) expect(blockIcons[definition.icon], definition.type).toBeTruthy();
  });

  it("has a German translation for every label, description, and option a block shows", () => {
    const strings = pageBlocks.flatMap((definition) => [
      definition.label,
      definition.description,
      definition.group,
      ...(definition.slots ?? []).map((slot) => slot.label),
      ...fieldStrings(definition.fields),
    ]);
    const missing = [...new Set(strings)].filter((message) => !(message in de));
    expect(missing).toEqual([]);
  });
});
