import * as React from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full min-w-0 overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
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
}: {
  to?: string;
  onSelect?: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  function open(event: React.MouseEvent<HTMLTableRowElement>) {
    if (rowActionTarget(event.target)) return;
    if (to) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
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
      className={cn(
        "relative cursor-pointer [transform:translateZ(0)] has-[:focus-visible]:bg-muted [&_[data-row-action]]:relative [&_[data-row-action]]:z-10",
        className,
      )}
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
            to={to}
          />
        ) : (
          <button
            aria-label={label}
            className="pointer-events-none absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-ring"
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

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
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
