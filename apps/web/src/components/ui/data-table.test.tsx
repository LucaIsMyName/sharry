// @vitest-environment happy-dom

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { DataTable, loadTableView, type DataColumn, type TableView } from "./data-table.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

type Row = { id: string; name: string; clicks: number };

const columns: DataColumn<Row>[] = [
  {
    id: "name",
    header: "Name",
    sortable: true,
    filter: "text",
    sortValue: (row) => row.name,
    filterValue: (row) => row.name,
    cell: (row) => row.name,
  },
  {
    id: "clicks",
    header: "Clicks",
    sortable: true,
    align: "right",
    sortValue: (row) => row.clicks,
    filterValue: (row) => String(row.clicks),
    cell: (row) => row.clicks,
  },
];

const rows: Row[] = [
  { id: "b", name: "Beta", clicks: 2 },
  { id: "a", name: "Alpha", clicks: 9 },
];

function Harness() {
  const [view, setView] = useState<TableView>({ sort: null, filters: {}, widths: {} });
  return (
    <MemoryRouter>
      <DataTable
        storageKey="sample"
        columns={columns}
        rows={rows}
        view={view}
        onViewChange={setView}
        getRow={(row) => ({ id: row.id, label: row.name })}
      />
    </MemoryRouter>
  );
}

describe("DataTable", () => {
  it("keeps columns readable on a narrow screen by giving them a minimum width", () => {
    render(<Harness />);
    const table = document.querySelector("[data-slot=table]") as HTMLElement;
    expect(table.className).toContain("max-md:min-w-full");
    expect(table.className).toContain("max-md:w-max");
    const header = screen.getByRole("button", { name: "Name" }).closest("th") as HTMLElement;
    expect(header.className).toContain("max-md:min-w-36");
    const cell = screen.getByRole("cell", { name: "Alpha" });
    expect(cell.className).toContain("max-md:min-w-36");
  });

  it("sorts, filters, and restores that view from local storage", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    const names = screen.getAllByRole("cell").map((cell) => cell.textContent);
    expect(names[0]).toBe("Alpha");
    fireEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    fireEvent.change(screen.getByLabelText("Name contains"), { target: { value: "bet" } });
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
    const stored = loadTableView("sample");
    expect(stored.sort).toEqual({ column: "name", direction: "asc" });
    expect(stored.filters.name).toBe("bet");
    fireEvent.click(screen.getByRole("button", { name: "Clear Name filter" }));
    expect(screen.getByText("Alpha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear Name sort" }));
    expect(loadTableView("sample").sort).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    const handle = screen.getByRole("separator", { name: "Resize Name" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerType: "touch" });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.pointerUp(window);
    expect(loadTableView("sample").widths.name).toBeGreaterThanOrEqual(72);
  });

  it("checks one row on click, individual rows on cmd-click, a range on shift-click, and opens on the second click", () => {
    const items: Row[] = [
      { id: "a", name: "Alpha", clicks: 1 },
      { id: "b", name: "Beta", clicks: 2 },
      { id: "c", name: "Gamma", clicks: 3 },
    ];
    function SelectionHarness() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <MemoryRouter initialEntries={["/links"]}>
          <Routes>
            <Route
              path="/links"
              element={
                <DataTable
                  storageKey="select"
                  columns={columns}
                  rows={items}
                  selectable
                  selectOnClick
                  selectedIds={selected}
                  onSelectedIds={setSelected}
                  getRow={(row) => ({ id: row.id, label: row.name, to: `/links/${row.id}` })}
                />
              }
            />
            <Route path="/links/:id" element={<div>opened</div>} />
          </Routes>
        </MemoryRouter>
      );
    }
    render(<SelectionHarness />);
    const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
    fireEvent.click(row("Alpha"), { metaKey: true });
    fireEvent.click(row("Gamma"), { metaKey: true });
    expect(row("Alpha").getAttribute("data-state")).toBe("selected");
    expect(row("Beta").hasAttribute("data-state")).toBe(false);
    expect(row("Gamma").getAttribute("data-state")).toBe("selected");
    expect(screen.queryByText("opened")).toBeNull();

    fireEvent.click(row("Alpha"));
    expect(row("Alpha").getAttribute("data-state")).toBe("selected");
    expect(row("Gamma").hasAttribute("data-state")).toBe(false);
    fireEvent.click(row("Gamma"), { shiftKey: true });
    for (const name of ["Alpha", "Beta", "Gamma"]) {
      expect(row(name).getAttribute("data-state")).toBe("selected");
    }
    expect(screen.queryByText("opened")).toBeNull();

    fireEvent.click(row("Beta"));
    fireEvent.click(row("Beta"));
    expect(screen.getByText("opened")).toBeTruthy();
  });

  it("selects rows and opens move and delete from the row menu", () => {
    const chosen: string[] = [];
    render(
      <MemoryRouter>
        <DataTable
          storageKey="actions"
          columns={columns}
          rows={rows}
          selectable
          selectedIds={[]}
          onSelectedIds={(ids) => chosen.push(...ids)}
          rowMenu={() => [
            { id: "move", label: "Move to…", onSelect: () => chosen.push("move") },
            { id: "delete", label: "Delete", destructive: true, onSelect: () => chosen.push("delete") },
          ]}
          getRow={(row) => ({ id: row.id, label: row.name })}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    expect(chosen).toContain("a");
    fireEvent.contextMenu(screen.getByRole("row", { name: /Beta/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(chosen).toContain("delete");
    expect(document.querySelector("select")).toBeNull();
  });

  it("keeps the row menu open after a right-click on a link row", () => {
    render(
      <MemoryRouter initialEntries={["/links"]}>
        <Routes>
          <Route
            path="/links"
            element={
              <DataTable
                storageKey="context"
                columns={columns}
                rows={rows}
                rowMenu={() => [{ id: "delete", label: "Delete", destructive: true, onSelect: () => undefined }]}
                getRow={(row) => ({ id: row.id, label: row.name, to: `/links/${row.id}` })}
              />
            }
          />
          <Route path="/links/:id" element={<div>opened</div>} />
        </Routes>
      </MemoryRouter>,
    );
    const row = screen.getByRole("row", { name: /Beta/ });
    fireEvent.pointerDown(row, { button: 2, clientX: 12, clientY: 12 });
    fireEvent.pointerUp(row, { button: 2, clientX: 12, clientY: 12 });
    fireEvent.contextMenu(row, { clientX: 12, clientY: 12 });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByText("opened")).toBeNull();
    fireEvent.mouseDown(window, { button: 2 });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  function renderLinkRows() {
    render(
      <MemoryRouter initialEntries={["/links"]}>
        <Routes>
          <Route
            path="/links"
            element={
              <DataTable
                storageKey="touch"
                columns={columns}
                rows={rows}
                rowMenu={() => [{ id: "delete", label: "Delete", destructive: true, onSelect: () => undefined }]}
                getRow={(row) => ({ id: row.id, label: row.name, to: `/links/${row.id}` })}
              />
            }
          />
          <Route path="/links/:id" element={<div>opened</div>} />
        </Routes>
      </MemoryRouter>,
    );
    return screen.getByRole("row", { name: /Beta/ });
  }

  it("opens the row menu with a long press on a touch screen without opening the row", () => {
    vi.useFakeTimers();
    try {
      const row = renderLinkRows();
      fireEvent.pointerDown(row, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
      fireEvent.pointerUp(row, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
      fireEvent.click(row);
      fireEvent.mouseDown(row, { button: 0 });
      expect(screen.queryByText("opened")).toBeNull();
      expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still opens the row on a short tap and when the finger scrolls away", () => {
    vi.useFakeTimers();
    try {
      const row = renderLinkRows();
      fireEvent.pointerDown(row, { button: 0, buttons: 1, pointerType: "touch", clientX: 20, clientY: 20 });
      fireEvent.pointerMove(row, { buttons: 1, pointerType: "touch", clientX: 20, clientY: 60 });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole("menuitem")).toBeNull();

      fireEvent.pointerDown(row, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
      act(() => vi.advanceTimersByTime(100));
      fireEvent.pointerUp(row, { button: 0, pointerType: "touch", clientX: 20, clientY: 20 });
      expect(screen.queryByRole("menuitem")).toBeNull();
      expect(screen.getByText("opened")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
