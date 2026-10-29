import { useContext, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "../i18n/index.tsx";
import { SubNav, SubNavSlotContext } from "./sub-nav.tsx";

const narrowQuery = "(max-width: 767px)";

function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function narrowSnapshot() {
  return window.matchMedia(narrowQuery).matches;
}

/** True below the `md` breakpoint, where the shell shows the mobile sub-nav. */
export function useNarrowScreen() {
  return useSyncExternalStore(subscribeNarrow, narrowSnapshot, () => false);
}

export function PageHeader({
  title,
  lede,
  detail,
  action,
  label,
}: {
  title: ReactNode;
  lede?: string;
  detail?: ReactNode;
  action?: ReactNode;
  label?: string;
}) {
  const { t } = useI18n();
  const slot = useContext(SubNavSlotContext);
  const narrow = useNarrowScreen();
  const inSubNav = Boolean(action) && narrow && slot !== null;
  const navLabel = label ?? (typeof title === "string" ? title : t("Actions"));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-medium tracking-tight">{title}</h1>
          {lede ? <p className="sr-only mt-1.5 text-base text-muted-foreground md:text-sm">{lede}</p> : null}
          {detail ? <div className="mt-1 text-sm text-muted-foreground">{detail}</div> : null}
        </div>
        {action && !inSubNav ? action : null}
      </div>
      {inSubNav ? <SubNav label={navLabel}>{action}</SubNav> : null}
    </>
  );
}
