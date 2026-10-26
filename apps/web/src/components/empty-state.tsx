import type { ReactNode } from "react";

export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-start gap-3 py-10">
      <p className="text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
