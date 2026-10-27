import * as React from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full min-w-0 max-w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-base md:text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

let skipRowClick = false;

function rowActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-row-action], a, button, input, select, textarea"));
}

function withHitTarget(children: React.ReactNode, hit: React.ReactNode) {
  const items = React.Children.toArray(children);
  const [first, ...rest] = items;
  if (!React.isValidElement<{ children?: React.ReactNode }>(first)) return children;
  return [
    React.cloneElement(first, {}, hit, first.props.children),
    ...rest,
  ];
}

function ClickableTableRow({
  to,
  onSelect,
  label,
  className,
  children,
  draggable = false,
  droppable = false,
  dragPayload,
  onRowDrop,
  onContextMenu,
  id,
}: {
  to?: string;
  onSelect?: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
  draggable?: boolean;
  droppable?: boolean;
  dragPayload?: string;
  onRowDrop?: (payload: string) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLTableRowElement>) => void;
  id?: string;
}) {
  const navigate = useNavigate();
  const moved = React.useRef(false);
  const origin = React.useRef({ x: 0, y: 0 });
  const openedAt = React.useRef(0);

  function open(event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>) {
    if (Date.now() - openedAt.current < 400) return;
    if (skipRowClick) {
      skipRowClick = false;
      return;
    }
    if (moved.current) return;
    if (rowActionTarget(event.target)) return;
    openedAt.current = Date.now();
    if (to) {
      if ("metaKey" in event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
        window.open(to, "_blank", "noopener");
        return;
      }
      navigate(to);
      return;
    }
    onSelect?.();
  }

  return (
    <TableRow
      id={id}
      className={cn(
        "relative cursor-pointer [transform:translateZ(0)] has-[:focus-visible]:bg-muted [&_[data-row-action]]:relative [&_[data-row-action]]:z-10",
        droppable && "data-[drop=true]:bg-accent",
        className,
      )}
      draggable={draggable || undefined}
      onPointerDown={(event) => {
        moved.current = false;
        origin.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        if (Math.abs(event.clientX - origin.current.x) > 4 || Math.abs(event.clientY - origin.current.y) > 4) {
          moved.current = true;
        }
      }}
      onPointerUp={open}
      onContextMenu={onContextMenu}
      onDrag={(event) => {
        if (event.clientX || event.clientY) moved.current = true;
      }}
      onDragStart={(event) => {
        if (!draggable || !dragPayload) return;
        event.dataTransfer.setData("text/plain", dragPayload);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!droppable) return;
        event.preventDefault();
        event.currentTarget.dataset.drop = "true";
      }}
      onDragLeave={(event) => {
        event.currentTarget.dataset.drop = "false";
      }}
      onDrop={(event) => {
        if (!droppable || !onRowDrop) return;
        event.preventDefault();
        event.currentTarget.dataset.drop = "false";
        const payload = event.dataTransfer.getData("text/plain");
        if (payload) onRowDrop(payload);
        skipRowClick = true;
      }}
      onClick={open}
      onAuxClick={(event) => {
        if (event.button !== 1 || !to || rowActionTarget(event.target)) return;
        window.open(to, "_blank", "noopener");
      }}
    >
      {withHitTarget(
        children,
        to ? (
          <Link
            aria-label={label}
            className="pointer-events-none absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-ring"
            data-row-hit
            to={to}
          />
        ) : (
          <button
            aria-label={label}
            className="pointer-events-none absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-ring"
            data-row-hit
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.();
            }}
          />
        ),
      )}
    </TableRow>
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function cellText(children: React.ReactNode): string | undefined {
  const items = React.Children.toArray(children).filter(
    (item): item is string => typeof item === "string",
  );
  const text = items.map((item) => item.trim()).filter(Boolean);
  return text.length === 1 ? text[0] : undefined;
}

function TableCell({
  className,
  title,
  children,
  ...props
}: React.ComponentProps<"td">) {
  const text = cellText(children);
  return (
    <td
      data-slot="table-cell"
      title={title ?? text}
      className={cn(
        "max-w-64 truncate p-2 align-middle [&:has([role=checkbox])]:pr-0",
        "not-data-row-action:not-has-[button:not([data-row-hit])]:not-has-[[data-slot=button]]:not-has-[[data-slot=button-group]]:not-has-[[data-slot=select-trigger]]:[&>*:not([data-row-hit])]:truncate",
        "has-[button:not([data-row-hit])]:max-w-none has-[button:not([data-row-hit])]:overflow-visible has-[button:not([data-row-hit])]:text-clip",
        "has-[[data-slot=button]]:max-w-none has-[[data-slot=button]]:overflow-visible has-[[data-slot=button]]:text-clip",
        "has-[[data-slot=button-group]]:max-w-none has-[[data-slot=button-group]]:overflow-visible has-[[data-slot=button-group]]:text-clip",
        "has-[[data-slot=select-trigger]]:max-w-none has-[[data-slot=select-trigger]]:overflow-visible has-[[data-slot=select-trigger]]:text-clip",
        "data-row-action:max-w-none data-row-action:overflow-visible data-row-action:text-clip",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-base text-muted-foreground md:text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  ClickableTableRow,
  TableCell,
  TableCaption,
};
