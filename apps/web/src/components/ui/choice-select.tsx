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
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { t } = useI18n();
  return (
    <SelectRoot
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
        className="max-w-md"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="items-start py-2"
          >
            <span>{t(option.label)}</span>
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
