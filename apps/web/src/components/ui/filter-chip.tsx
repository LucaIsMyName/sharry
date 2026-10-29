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
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-2 text-sm pointer-coarse:h-11 pointer-coarse:pr-0.5 pointer-coarse:pl-3">
      <span className="truncate">{label}</span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground pointer-coarse:size-11 [&>svg]:size-3 pointer-coarse:[&>svg]:size-4"
        aria-label={t("Remove {label}", { label })}
        onClick={onRemove}
      >
        <X />
      </button>
    </span>
  );
}
