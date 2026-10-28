// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockDefinition, defaultProps, type Fields } from "@sharry/shared";
import { FieldsEditor } from "./field-editor.tsx";

vi.mock("../../api.ts", () => ({
  api: vi.fn(async () => ({ links: [{ shortUrl: "https://s.example/s/promo" }] })),
  ApiError: class ApiError extends Error {},
}));

let latest: Record<string, unknown> = {};

function Harness({ type }: { type: string }) {
  const fields = blockDefinition(type)?.fields as Fields;
  const [values, setValues] = useState<Record<string, unknown>>(() => defaultProps(fields));
  latest = values;
  return <FieldsEditor fields={fields} values={values} media={{}} onMedia={() => undefined} onChange={setValues} />;
}

afterEach(() => {
  cleanup();
  latest = {};
});

describe("generated block inspector", () => {
  it("builds text, toggle, and color controls from the button fields", async () => {
    render(<Harness type="button" />);
    fireEvent.change(screen.getByDisplayValue("Learn more"), { target: { value: "Buy now" } });
    expect(latest.label).toBe("Buy now");

    fireEvent.click(screen.getByText("Open in a new tab"));
    expect(latest.newTab).toBe(true);

    const color = screen.getAllByDisplayValue("#13119b").find((input) => input.getAttribute("type") !== "color") as HTMLElement;
    fireEvent.change(color, { target: { value: "#zzz" } });
    expect(latest.background).toBe("#13119b");
    fireEvent.change(color, { target: { value: "#FF0000" } });
    expect(latest.background).toBe("#ff0000");
    const clear = screen.getAllByRole("button", { name: "Clear color" })[0] as HTMLElement;
    fireEvent.click(clear);
    expect(latest.background).toBeNull();
  });

  it("offers the caller's short links for link fields", async () => {
    render(<Harness type="button" />);
    const input = screen.getByPlaceholderText("https://example.com");
    const listId = input.getAttribute("list");
    expect(listId).toBeTruthy();
    await vi.waitFor(() => expect(document.getElementById(listId ?? "")?.querySelector("option")?.getAttribute("value")).toBe("https://s.example/s/promo"));
  });

  it("adds, reorders, and removes list items within their limits", () => {
    render(<Harness type="accordion" />);
    const startCount = (latest.items as unknown[]).length;
    fireEvent.click(screen.getByRole("button", { name: "Add Item" }));
    expect((latest.items as unknown[]).length).toBe(startCount + 1);

    const headlines = screen.getAllByLabelText("Headline") as HTMLInputElement[];
    fireEvent.change(headlines[0] as HTMLInputElement, { target: { value: "First" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Item 1" })).getByRole("button", { name: "Move down" }));
    expect((latest.items as { headline: string }[])[1]?.headline).toBe("First");

    const removes = screen.getAllByRole("button", { name: "Remove" });
    for (const button of removes) fireEvent.click(button);
    expect((latest.items as unknown[]).length).toBe(1);
    const lastRemove = screen.getByRole("button", { name: "Remove" });
    expect(lastRemove.hasAttribute("disabled")).toBe(true);
  });
});
