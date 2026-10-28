import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useI18n } from "../i18n/index.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip.tsx";

const suggestButtonClass =
  "absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

export function SuggestButton({
  label,
  hint,
  error,
  disabled,
  inline = false,
  onClick,
}: {
  label: string;
  hint: string | null;
  error?: string;
  disabled: boolean;
  inline?: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const message = error || hint;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(Boolean(message));
  }, [message]);
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={inline ? "shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" : suggestButtonClass}
              aria-label={t(label)}
              disabled={disabled}
              onClick={onClick}
            />
          }
        >
          <Sparkles size={16} />
        </TooltipTrigger>
        {message ? <TooltipContent className={error ? "text-destructive" : undefined}>{t(message)}</TooltipContent> : null}
      </Tooltip>
    </TooltipProvider>
  );
}
