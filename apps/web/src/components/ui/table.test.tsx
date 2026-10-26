// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import {
  ClickableTableRow,
  Table,
  TableBody,
  TableCell,
} from "./table.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRows(row: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Table>
        <TableBody>{row}</TableBody>
      </Table>
      <Routes>
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ClickableTableRow", () => {
  it("follows the route from the row and leaves an in-cell action alone", () => {
    const onAction = vi.fn();
    renderRows(
      <ClickableTableRow to="/links/1" label="Summer">
        <TableCell>Summer</TableCell>
        <TableCell data-row-action>
          <button type="button" onClick={onAction}>
            Test
          </button>
        </TableCell>
      </ClickableTableRow>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Summer" }));
    expect(screen.getByTestId("location").textContent).toBe("/links/1");

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.getByTestId("location").textContent).toBe("/links/1");
  });

  it("selects the row without selecting an in-cell action", () => {
    const onSelect = vi.fn();
    const onAction = vi.fn();
    renderRows(
      <ClickableTableRow label="Summer" onSelect={onSelect}>
        <TableCell>Summer</TableCell>
        <TableCell data-row-action>
          <button type="button" onClick={onAction}>
            Test
          </button>
        </TableCell>
      </ClickableTableRow>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Summer" }));
    expect(onSelect).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("TableCell", () => {
  it("caps text and leaves the full string on the cell", () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell>Summer sale</TableCell>
            <TableCell title="Kept">Short</TableCell>
          </tr>
        </tbody>
      </table>,
    );

    const text = screen.getByRole("cell", { name: "Summer sale" });
    expect(text.className).toContain("max-w-64");
    expect(text.className).toContain("truncate");
    expect(text.getAttribute("title")).toBe("Summer sale");
    expect(screen.getByRole("cell", { name: "Short" }).getAttribute("title")).toBe("Kept");
  });

  it("keeps buttons and row actions from taking the text cap", () => {
    render(
      <table>
        <tbody>
          <tr>
            <TableCell>
              <button type="button">Revoke</button>
            </TableCell>
            <TableCell data-row-action>
              <a href="https://example.com">Test</a>
            </TableCell>
          </tr>
        </tbody>
      </table>,
    );

    const buttonCell = screen.getByRole("button", { name: "Revoke" }).closest("td");
    const actionCell = screen.getByRole("link", { name: "Test" }).closest("td");
    expect(buttonCell?.className).toContain("has-[button:not([data-row-hit])]:max-w-none");
    expect(buttonCell?.className).toContain("has-[[data-slot=button]]:max-w-none");
    expect(buttonCell?.className).toContain("has-[[data-slot=button-group]]:max-w-none");
    expect(actionCell?.className).toContain("data-row-action:max-w-none");
  });
});
