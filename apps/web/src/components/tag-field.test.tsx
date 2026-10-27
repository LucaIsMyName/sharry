// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api.ts";
import { TagField, type EditorTag } from "./tag-field.tsx";

vi.mock("../api.ts", () => ({
  api: vi.fn(async () => ({ tags: [{ id: "1", name: "Launch", color: "#7c6af7" }] })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial = [] }: { initial?: EditorTag[] }) {
  const [tags, setTags] = useState(initial);
  return <TagField kind="link" tags={tags} onChange={setTags} />;
}

describe("TagField", () => {
  it("keeps a typed tag inside the field when it loses focus", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Add a tag" });
    fireEvent.change(input, { target: { value: "Lau" } });
    const suggestion = await screen.findByText("Launch");
    expect(suggestion.closest("[data-slot=badge]")).toBeTruthy();
    fireEvent.change(input, { target: { value: "Poster" } });
    fireEvent.blur(input);
    const badge = screen.getByText("Poster").closest("[data-slot=badge]");
    expect(badge).toBeTruthy();
    expect(input.parentElement?.contains(badge)).toBe(true);
    expect(api).toHaveBeenCalledWith("/api/tags?kind=link");
  });

  it("tells you when that tag is already on the item", () => {
    render(<Harness initial={[{ name: "Poster", color: "#2a9d8f" }]} />);
    const input = screen.getByRole("textbox", { name: "Add a tag" });
    fireEvent.change(input, { target: { value: "poster" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert").textContent).toBe("This tag is already in use.");
    expect(screen.getAllByText("Poster")).toHaveLength(1);
  });
});
