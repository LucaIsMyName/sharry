import { useEffect } from "react";

export function focusRowId(id: string): string {
  return `focus-${id}`;
}

export function rowFocusClass(id: string, focus: string | null): string | undefined {
  return focus === id ? "bg-muted" : undefined;
}

export function useFocusRow(id: string | null, ready: boolean): void {
  useEffect(() => {
    if (!id || !ready) return;
    document.getElementById(focusRowId(id))?.scrollIntoView({ block: "center" });
  }, [id, ready]);
}
