import type { ReactNode } from "react";
import { useI18n } from "../../i18n/index.tsx";
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select.tsx";

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Choose",
  id,
  disabled = false,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string; description?: string; icon?: ReactNode; depth?: number }[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { t } = useI18n();
  return (
    <SelectRoot
      disabled={disabled}
      value={value === "" ? null : value}
      items={options.map((option) => ({
        value: option.value,
        label: t(option.label),
      }))}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next as T);
      }}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="h-10 w-full"
      >
        <SelectValue placeholder={t(placeholder)} />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        sideOffset={6}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="items-start py-2"
          >
            <span
              className="inline-flex min-w-0 items-center gap-2"
              style={option.depth ? { paddingInlineStart: option.depth * 14 } : undefined}
            >
              {option.icon}
              <span>{t(option.label)}</span>
            </span>
            {option.description ? (
              <span className="text-xs font-normal whitespace-normal text-muted-foreground">
                {t(option.description)}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
