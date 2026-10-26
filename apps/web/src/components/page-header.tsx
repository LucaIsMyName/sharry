import type { ReactNode } from "react";

export function PageHeader({
  title,
  lede,
  action,
}: {
  title: ReactNode;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-medium tracking-tight">{title}</h1>
        {lede ? <p className="mt-1.5 text-sm text-muted-foreground">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}
