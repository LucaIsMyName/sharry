import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The element under the mobile top bar that page sub-navs render into. The Shell provides it. */
export const SubNavSlotContext = createContext<HTMLElement | null>(null);

/** A page's own mobile menu, sticky under the main top bar at full width. Desktop does not show it. */
export function SubNav({ label, children }: { label: string; children: ReactNode }) {
  const slot = useContext(SubNavSlotContext);
  if (!slot) return null;
  return createPortal(
    <nav
      aria-label={label}
      className="flex h-12 items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 pointer-coarse:h-14 pointer-coarse:px-1.5"
    >
      {children}
    </nav>,
    slot,
  );
}
