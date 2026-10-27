import type { ReactNode } from "react";
import { cn } from "cn";

export function Section({
  title,
  lede,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-3 border-t border-border pt-4", className)}>
      {title || action ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-medium">{title}</h2> : null}
            {lede ? <p className="mt-1 text-sm text-muted-foreground">{lede}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
