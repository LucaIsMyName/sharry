import type { ReactNode } from "react";
import { cn } from "cn";

const joined =
  "[&_input]:rounded-none [&_input]:border-0 [&_input]:shadow-none [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:rounded-none [&_[data-slot=select-trigger]]:border-0 [&_[data-slot=select-trigger]]:shadow-none";

export function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn("m-0 min-w-0 overflow-hidden rounded-lg border border-border p-0", joined)}>
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}

export function FieldGroupLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex min-w-0 items-end border-b border-border last:border-b-0", className)}>{children}</div>;
}
