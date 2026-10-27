import { X } from "lucide-react";
import { useI18n } from "../../i18n/index.tsx";

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-sm">
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
        aria-label={t("Remove {label}", { label })}
        onClick={onRemove}
      >
        <X size={12} />
      </button>
    </span>
  );
}
