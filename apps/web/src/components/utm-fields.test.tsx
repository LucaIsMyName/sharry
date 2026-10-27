// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyUtmPresets } from "@sharry/shared";
import { UtmFields } from "./utm-fields.tsx";

afterEach(cleanup);

describe("UtmFields", () => {
  it("uses a select when a key has presets and an input when it does not", () => {
    const presets = emptyUtmPresets();
    presets.utm_source = ["newsletter"];
    render(<UtmFields utm={{ utm_source: "poster" }} onChange={() => undefined} presets={presets} />);
    expect(screen.getByRole("combobox", { name: "utm_source" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "utm_medium" })).toBeTruthy();
  });
});
