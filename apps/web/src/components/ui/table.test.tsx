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
