// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor.tsx";

afterEach(cleanup);

async function openLinkDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "Link" }));
  return screen.findByRole("dialog");
}

describe("rich text link dialog", () => {
  it("opens an empty add-link dialog where there is no link yet", async () => {
    render(<RichTextEditor label="Text" value="<p>Hello</p>" onChange={vi.fn()} />);
    const dialog = await openLinkDialog();
    expect(within(dialog).getByText("Add link")).toBeTruthy();
    expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(within(dialog).queryByRole("button", { name: "Remove link" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("changes an existing link address", async () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Text" value='<p><a href="https://old.example">Hello</a></p>' onChange={onChange} />);
    fireEvent.click((await screen.findByLabelText("Text")).querySelector("a") as HTMLElement);
    const dialog = await openLinkDialog();
    expect(within(dialog).getByText("Edit link")).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "https://new.example" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(String(onChange.mock.lastCall?.[0])).toContain('href="https://new.example"'));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rejects unsafe addresses inline and keeps the dialog open", async () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Text" value="<p>Hello</p>" onChange={onChange} />);
    const dialog = await openLinkDialog();
    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("prefills an existing link and can remove it", async () => {
    const onChange = vi.fn();
    render(<RichTextEditor label="Text" value='<p><a href="https://old.example">Hello</a></p>' onChange={onChange} />);
    const link = (await screen.findByLabelText("Text")).querySelector("a") as HTMLElement;
    fireEvent.click(link);
    const dialog = await openLinkDialog();
    expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("https://old.example");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove link" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(String(onChange.mock.lastCall?.[0])).not.toContain("<a");
  });
});
