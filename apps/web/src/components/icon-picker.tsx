import { useState } from "react";
import { ICON_NAMES, isIconName, type IconName } from "@sharry/shared";
import { useI18n } from "../i18n/index.tsx";
import { AppIcon } from "./app-icon.tsx";
import { Button } from "./ui/button.tsx";

export function IconPicker({
  value,
  fallback,
  onChange,
  large = false,
}: {
  value: string | null;
  fallback: IconName;
  onChange: (icon: IconName) => void;
  large?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = isIconName(value) ? value : fallback;
  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={large ? "size-11 rounded-lg" : undefined}
        aria-label={t("Choose icon")}
        aria-expanded={open}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <AppIcon name={current} size={large ? 22 : 16} />
      </Button>
      {open ? (
        <div className="absolute z-30 mt-1 grid w-64 grid-cols-8 gap-1 rounded-lg border border-border bg-popover p-2 shadow-md pointer-coarse:w-[min(19rem,calc(100vw-2.5rem))] pointer-coarse:grid-cols-6">
          {ICON_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              className="grid size-7 place-items-center rounded-md hover:bg-muted aria-pressed:bg-accent pointer-coarse:size-11"
              aria-pressed={name === current}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              <AppIcon name={name} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
