// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./field.tsx";
import { FieldGroup, FieldGroupLine } from "./field-group.tsx";
import { Input } from "./input.tsx";

afterEach(cleanup);

describe("FieldGroup", () => {
  it("joins the slug and destination inside one border", () => {
    render(
      <FieldGroup label="Short link">
        <FieldGroupLine>
          <Field label="Slug">
            <Input value="summer" onChange={() => undefined} />
          </Field>
        </FieldGroupLine>
        <FieldGroupLine>
          <Field label="Destination">
            <Input value="https://example.com" onChange={() => undefined} />
          </Field>
        </FieldGroupLine>
      </FieldGroup>,
    );
    const group = screen.getByRole("group", { name: "Short link" });
    expect(group.className).toContain("overflow-hidden");
    expect(group.className).toContain("border");
    expect(screen.getByRole("textbox", { name: "Slug" }).closest("fieldset")).toBe(group);
    expect(screen.getByRole("textbox", { name: "Destination" }).closest("fieldset")).toBe(group);
  });
});
