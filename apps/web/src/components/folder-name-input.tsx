import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/index.tsx";

export function FolderNameInput({
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const skip = useRef(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);
  return (
    <input
      ref={ref}
      aria-label={t("Folder name")}
      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        if (skip.current) return;
        onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          skip.current = true;
          onCancel();
        }
      }}
    />
  );
}
