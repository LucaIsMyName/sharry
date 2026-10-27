// @vitest-environment happy-dom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
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
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 180 });
    fireEvent.mouseUp(window);
    expect(loadTableView("sample").widths.name).toBeGreaterThanOrEqual(72);
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
});
