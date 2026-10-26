import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { Button } from "./button.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Input } from "./input.tsx";

export function MultiSelect({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const shown = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  function placeList() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    setPlace({ top: rect.bottom + 4, left: rect.left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    placeList();
    window.addEventListener("resize", placeList);
    window.addEventListener("scroll", placeList, true);
    return () => {
      window.removeEventListener("resize", placeList);
      window.removeEventListener("scroll", placeList, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string, checked: boolean) {
    const next = checked ? [...values, value] : values.filter((item) => item !== value);
    onChange([...new Set(next)]);
  }

  return (
    <div className="relative shrink-0" ref={root}>
      <Button
        ref={button}
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        {values.length === 0 ? label : t("{count} selected", { count: values.length })}
      </Button>
      {open && place ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="fixed z-20 grid w-64 gap-2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
          style={{ top: place.top, left: place.left }}
        >
          <Input
            value={query}
            placeholder="Search"
            aria-label={t("Search")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="grid max-h-56 gap-1 overflow-auto">
            {shown.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("No data yet.")}</p>
            ) : (
              shown.map((option) => (
                <div key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                  <Checkbox
                    checked={values.includes(option.value)}
                    aria-label={option.label}
                    onCheckedChange={(checked) => toggle(option.value, checked === true)}
                  />
                  <span className="truncate text-sm">{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
