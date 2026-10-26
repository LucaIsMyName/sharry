import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "../i18n/index.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip.tsx";

const suggestButtonClass =
  "absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

export function SuggestButton({
  label,
  hint,
  disabled,
  onClick,
}: {
  label: string;
  hint: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(Boolean(hint));
  }, [hint]);
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={suggestButtonClass}
              aria-label={t(label)}
              disabled={disabled}
              onClick={onClick}
            />
          }
        >
          <Sparkles size={16} />
        </TooltipTrigger>
        {hint ? <TooltipContent>{t(hint)}</TooltipContent> : null}
      </Tooltip>
    </TooltipProvider>
  );
}
