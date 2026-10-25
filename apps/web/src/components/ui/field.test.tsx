// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { clearDismissedFieldMessages, Field, FieldMessage } from "./field.tsx";
import { TooltipProvider } from "./tooltip.tsx";

afterEach(() => {
  cleanup();
  clearDismissedFieldMessages();
});

function renderField(field: ReactNode) {
  return render(<TooltipProvider>{field}</TooltipProvider>);
}

describe("Field", () => {
  it("shows an error tooltip and marks the control invalid", () => {
    renderField(
      <Field label="Slug" error="Slug is taken">
        <input />
      </Field>,
    );
    expect(screen.getByRole("button", { name: "Slug is taken" })).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Slug is taken");
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(
      screen.getByRole("textbox").getAttribute("aria-describedby"),
    ).toBeTruthy();
  });

  it("shows an info tooltip without marking the control invalid", () => {
    renderField(
      <Field label="Destination" info="Saving will replace utm_source.">
        <input />
      </Field>,
    );
    expect(
      screen.getByRole("button", { name: "Saving will replace utm_source." }),
    ).toBeTruthy();
    expect(screen.getByRole("textbox").hasAttribute("aria-invalid")).toBe(
      false,
    );
  });

  it("stays closed when the page is shown again after it was dismissed", () => {
    const message = "Prefix must start with /";
    const field = (
      <Field label="Public prefix" error={message}>
        <input />
      </Field>
    );
    const first = renderField(field);
    expect(screen.getByRole("tooltip").textContent).toContain(message);
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("tooltip").hasAttribute("data-closed")).toBe(true);
    first.unmount();
    renderField(field);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("button", { name: message })).toBeTruthy();
  });

  it("keeps a stored message closed until the trigger is focused", () => {
    renderField(
      <FieldMessage
        tone="error"
        message="DNS failed"
        initialOpen={false}
      />,
    );
    expect(screen.getByRole("button", { name: "DNS failed" })).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows no message icon when the field is quiet", () => {
    renderField(
      <Field label="Title">
        <input />
      </Field>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("textbox").hasAttribute("aria-invalid")).toBe(
      false,
    );
  });
});
