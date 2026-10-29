import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ListFilter, X } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Select } from "./choice-select.tsx";
import {
  ClickableTableRow,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table.tsx";

export type TableView = {
  sort: { column: string; direction: "asc" | "desc" } | null;
  filters: Record<string, string>;
  widths: Record<string, number>;
};

export const emptyTableView: TableView = { sort: null, filters: {}, widths: {} };

export function loadTableView(key: string): TableView {
  try {
    const raw = localStorage.getItem(`sharry.table.${key}`);
    if (!raw) return emptyTableView;
    const parsed = JSON.parse(raw) as Partial<TableView>;
    const direction = parsed.sort?.direction;
    const sort =
      parsed.sort &&
      typeof parsed.sort.column === "string" &&
      (direction === "asc" || direction === "desc")
        ? { column: parsed.sort.column, direction }
        : null;
    const filters: Record<string, string> = {};
    if (parsed.filters && typeof parsed.filters === "object") {
      for (const [name, value] of Object.entries(parsed.filters)) {
        if (typeof value === "string" && value.trim()) filters[name] = value;
      }
    }
    const widths: Record<string, number> = {};
    if (parsed.widths && typeof parsed.widths === "object") {
      for (const [name, value] of Object.entries(parsed.widths)) {
        if (typeof value === "number" && Number.isFinite(value) && value >= 48) widths[name] = value;
      }
    }
    return { sort, filters, widths };
  } catch {
    return emptyTableView;
  }
}

export function saveTableView(key: string, view: TableView): void {
  try {
    localStorage.setItem(`sharry.table.${key}`, JSON.stringify(view));
  } catch {
    // The table still works for this visit when storage is blocked.
  }
}

export type DataColumn<T> = {
  id: string;
  header: string;
  sortable?: boolean;
  filter?: "text" | { options: { value: string; label: string }[] };
  align?: "left" | "right";
  sortValue?: (row: T) => string | number | null;
  filterValue?: (row: T) => string;
  cell: (row: T) => ReactNode;
};

export type DataRow = {
  id: string;
  label: string;
  to?: string;
  onSelect?: () => void;
  className?: string;
  draggable?: boolean;
  droppable?: boolean;
  dragPayload?: string;
  domId?: string;
  selectable?: boolean;
};

export type RowMenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
};

const anyValue = "__any__";
const headerIconButton = "inline-flex shrink-0 items-center justify-center pointer-coarse:size-11";

export function DataTable<T>({
  storageKey,
  columns,
  rows,
  getRow,
  mode = "client",
  view,
  onViewChange,
  empty,
  onRowDrop,
  onFilesDrop,
  dragSelection = false,
  selectable = false,
  selectedIds = [],
  onSelectedIds,
  rowMenu,
}: {
  storageKey: string;
  columns: DataColumn<T>[];
  rows: T[];
  getRow: (row: T) => DataRow;
  mode?: "client" | "controlled";
  view?: TableView;
  onViewChange?: (view: TableView) => void;
  empty?: ReactNode;
  onRowDrop?: (payload: string, targetId: string) => void;
  /** Files dropped from the computer onto a droppable row. */
  onFilesDrop?: (files: File[], targetId: string) => void;
  /** Dragging a selected row carries every selected row id, joined with commas. */
  dragSelection?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIds?: (ids: string[]) => void;
  rowMenu?: (row: T) => RowMenuItem[];
}) {
  const { t } = useI18n();
  const [stored, setStored] = useState<TableView>(() => normalizeView(view ?? loadTableView(storageKey)));
  const current = mode === "controlled" && view ? normalizeView(view) : stored;
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: RowMenuItem[] } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "controlled" && view) setStored(normalizeView(view));
  }, [mode, view]);

  useEffect(() => {
    if (!menu) return;
    function close(event: MouseEvent) {
      if (event.button !== 0) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function commit(next: TableView) {
    const view = normalizeView(next);
    setStored(view);
    saveTableView(storageKey, view);
    onViewChange?.(view);
  }

  function toggleSort(column: string) {
    const sort = current.sort;
    const next =
      !sort || sort.column !== column
        ? { column, direction: "asc" as const }
        : sort.direction === "asc"
          ? { column, direction: "desc" as const }
          : null;
    commit({ ...current, sort: next });
  }

  function setFilter(column: string, value: string) {
    const filters = { ...current.filters };
    if (value.trim()) filters[column] = value;
    else delete filters[column];
    commit({ ...current, filters });
  }

  function setWidth(column: string, width: number) {
    commit({ ...current, widths: { ...current.widths, [column]: width } });
  }

  const visible = useMemo(() => {
    if (mode === "controlled") return rows;
    const filtered = rows.filter((row) =>
      columns.every((column) => {
        const wanted = current.filters[column.id];
        if (!wanted || !column.filterValue) return true;
        return column.filterValue(row).toLowerCase().includes(wanted.toLowerCase());
      }),
    );
    const sort = current.sort;
    if (!sort) return filtered;
    const column = columns.find((item) => item.id === sort.column);
    if (!column?.sortValue) return filtered;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const a = column.sortValue?.(left) ?? "";
      const b = column.sortValue?.(right) ?? "";
      if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
      return String(a).localeCompare(String(b)) * direction;
    });
  }, [columns, current.filters, current.sort, mode, rows]);

  const visibleMetas = visible.map((row) => ({ row, meta: getRow(row) }));
  const selectableIds = visibleMetas.filter((item) => item.meta.selectable !== false).map((item) => item.meta.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const columnCount = columns.length + (selectable ? 1 : 0);
  const groupDrag = (meta: DataRow) => dragSelection && selectedIds.length > 1 && selectedIds.includes(meta.id);
  const sized = Object.keys(current.widths).length > 0;

  return (
    <div className="min-w-0 max-w-full overflow-x-auto">
      <Table className={sized ? "table-fixed" : undefined}>
        <colgroup>
          {selectable ? <col style={{ width: 40 }} /> : null}
          {columns.map((column) => (
            <col key={column.id} style={current.widths[column.id] ? { width: current.widths[column.id] } : undefined} />
          ))}
        </colgroup>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            {selectable ? (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  aria-label={t("Select all")}
                  onCheckedChange={(checked) => onSelectedIds?.(checked === true ? selectableIds : [])}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => (
              <TableHead
                key={column.id}
                aria-sort={
                  current.sort?.column === column.id
                    ? current.sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : column.sortable
                      ? "none"
                      : undefined
                }
                className={cn("relative", column.align === "right" && "text-right")}
                style={current.widths[column.id] ? { width: current.widths[column.id] } : undefined}
              >
                <span className={cn("inline-flex max-w-full items-center gap-1", column.align === "right" && "float-right")}>
                  {column.sortable ? (
                    <button type="button" className="inline-flex min-w-0 items-center gap-1 font-medium" onClick={() => toggleSort(column.id)}>
                      <span className="truncate">{t(column.header)}</span>
                      {current.sort?.column === column.id ? (
                        current.sort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : null}
                    </button>
                  ) : (
                    <span className="truncate">{t(column.header)}</span>
                  )}
                  {current.sort?.column === column.id ? (
                    <button
                      type="button"
                      className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", headerIconButton)}
                      aria-label={t("Clear {label} sort", { label: t(column.header) })}
                      onClick={() => commit({ ...current, sort: null })}
                    >
                      <X className="size-3 pointer-coarse:size-4" />
                    </button>
                  ) : null}
                  {column.filter ? (
                    <ColumnFilter
                      label={column.header}
                      kind={column.filter}
                      value={current.filters[column.id] ?? ""}
                      open={openFilter === column.id}
                      active={Boolean(current.filters[column.id])}
                      onOpen={() => setOpenFilter((item) => (item === column.id ? null : column.id))}
                      onChange={(value) => setFilter(column.id, value)}
                    />
                  ) : null}
                </span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("Resize {label}", { label: t(column.header) })}
                  className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-border"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const startX = event.clientX;
                    const header = event.currentTarget.parentElement;
                    const start = current.widths[column.id] ?? header?.getBoundingClientRect().width ?? 120;
                    function move(next: MouseEvent) {
                      setWidth(column.id, Math.max(72, Math.round(start + next.clientX - startX)));
                    }
                    function up() {
                      window.removeEventListener("mousemove", move);
                      window.removeEventListener("mouseup", up);
                    }
                    window.addEventListener("mousemove", move);
                    window.addEventListener("mouseup", up);
                  }}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleMetas.length === 0 ? (
            <TableRow>
              <TableCell className="max-w-none py-6 text-center text-muted-foreground" colSpan={columnCount}>
                {empty ?? t("No rows match")}
              </TableCell>
            </TableRow>
          ) : (
            visibleMetas.map(({ row, meta }) => (
              <ClickableTableRow
                key={meta.id}
                to={meta.to}
                onSelect={meta.onSelect}
                label={meta.label}
                className={meta.className}
                draggable={meta.draggable}
                droppable={meta.droppable}
                dragPayload={groupDrag(meta) ? selectedIds.join(",") : meta.dragPayload}
                dragCount={groupDrag(meta) ? selectedIds.length : undefined}
                id={meta.domId}
                onRowDrop={meta.droppable ? (payload) => onRowDrop?.(payload, meta.id) : undefined}
                onFilesDrop={meta.droppable && onFilesDrop ? (files) => onFilesDrop(files, meta.id) : undefined}
                onContextMenu={
                  rowMenu
                    ? (event) => {
                        event.preventDefault();
                        const items = rowMenu(row);
                        if (items.length === 0) return;
                        setMenu({ x: event.clientX, y: event.clientY, items });
                      }
                    : undefined
                }
              >
                {selectable ? (
                  <TableCell data-row-action className="w-10">
                    <Checkbox
                      checked={selectedIds.includes(meta.id)}
                      disabled={meta.selectable === false}
                      aria-label={t("Select {label}", { label: meta.label })}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        if (checked === true) next.add(meta.id);
                        else next.delete(meta.id);
                        onSelectedIds?.([...next]);
                      }}
                    />
                  </TableCell>
                ) : null}
                {columns.map((column) => (
                  <TableCell key={column.id} className={cn(column.align === "right" && "text-right tabular-nums")}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </ClickableTableRow>
            ))
          )}
        </TableBody>
      </Table>
      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-40 rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ top: menu.y, left: menu.x }}
        >
          {menu.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                item.destructive && "text-destructive",
              )}
              onClick={() => {
                setMenu(null);
                item.onSelect();
              }}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColumnFilter({
  label,
  kind,
  value,
  open,
  active,
  onOpen,
  onChange,
}: {
  label: string;
  kind: NonNullable<DataColumn<unknown>["filter"]>;
  value: string;
  open: boolean;
  active: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <span className="relative">
      <button
        type="button"
        className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", headerIconButton, active && "text-primary")}
        aria-label={t("Filter {label}", { label: t(label) })}
        aria-expanded={open}
        onClick={onOpen}
      >
        <ListFilter className="size-3.5 pointer-coarse:size-4" />
      </button>
      {open ? (
        <span className="absolute left-0 z-20 mt-1 grid w-52 gap-2 rounded-md border border-border bg-popover p-2 shadow-md">
          {kind === "text" ? (
            <span className="flex items-center gap-1">
              <input
                id={id}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm pointer-coarse:h-11 pointer-coarse:text-base"
                value={value}
                aria-label={t("{label} contains", { label: t(label) })}
                onChange={(event) => onChange(event.target.value)}
              />
              {value ? (
                <button
                  type="button"
                  className={cn("rounded p-1 text-muted-foreground hover:text-foreground", headerIconButton)}
                  aria-label={t("Clear {label} filter", { label: t(label) })}
                  onClick={() => onChange("")}
                >
                  <X size={14} />
                </button>
              ) : null}
            </span>
          ) : (
            <Select
              value={value || anyValue}
              placeholder="Any"
              options={[
                { value: anyValue, label: "Any" },
                ...kind.options,
              ]}
              onValueChange={(next) => onChange(next === anyValue ? "" : next)}
            />
          )}
        </span>
      ) : null}
    </span>
  );
}

function normalizeView(view: TableView): TableView {
  return { sort: view.sort, filters: view.filters, widths: view.widths ?? {} };
}
