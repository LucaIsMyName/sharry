// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { useConfirm } from "./confirm-dialog.tsx";

function Harness() {
  const { confirm, dialog } = useConfirm();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void confirm({
            title: "Delete this folder?",
            description: "Its links move up one level.",
            confirmLabel: "Delete folder",
            destructive: true,
          }).then((confirmed) => setAnswer(String(confirmed)))
        }
      >
        Ask
      </button>
      <output>{answer}</output>
      {dialog}
    </>
  );
}

afterEach(cleanup);

describe("useConfirm", () => {
  it("resolves true when the action is confirmed", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Its links move up one level.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete folder" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("true"));
  });

  it("resolves false when the dialog is cancelled", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("false"));
  });

  it("resolves false when Escape closes the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("false"));
  });
});
