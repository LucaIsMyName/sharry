import type { ReactNode } from "react";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import { Card, CardContent } from "./card.tsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div aria-busy="true" className={cn("grid gap-3", className)}>
      <span className="sr-only">{t(label)}</span>
      {children}
    </div>
  );
}

export function StatSkeleton({ label = "Loading analytics…" }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="gap-3.5 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <CardContent className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </CardContent>
        </Card>
      ))}
    </LoadingRegion>
  );
}

export function RowSkeleton({
  label,
  rows = 5,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <LoadingRegion label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </LoadingRegion>
  );
}

export function DetailSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label}>
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardContent className="grid gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}

export function ChatListSkeleton() {
  return (
    <LoadingRegion label="Loading chats…">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </LoadingRegion>
  );
}

export function ChatThreadSkeleton() {
  return (
    <LoadingRegion label="Loading chat">
      <div className="grid justify-items-end">
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>
      <Card className="w-full max-w-[40rem]">
        <CardContent className="grid gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </CardContent>
      </Card>
      <Card className="w-full max-w-[40rem]">
        <CardContent className="grid gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}

export function WritingSkeleton() {
  const { t } = useI18n();
  return (
    <Card className="w-full max-w-[40rem]">
      <CardContent className="grid gap-2">
        <span className="sr-only">{t("Writing…")}</span>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}
