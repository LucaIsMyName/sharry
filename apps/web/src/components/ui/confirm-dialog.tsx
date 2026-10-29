import { useCallback, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog.tsx";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmDisabled = false,
  destructive = false,
  onConfirm,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">{t(title)}</DialogTitle>
          <DialogDescription>{t(description)}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="border-0 bg-transparent sm:justify-start">
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            {t("Cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {t(confirmLabel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
};

/** Promise-based confirmation: `if (!(await confirm({...}))) return;`. Render `dialog` once in the page. */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const dialog = options ? (
    <ConfirmDialog
      open={open}
      title={options.title}
      description={options.description}
      confirmLabel={options.confirmLabel}
      destructive={options.destructive}
      onConfirm={() => settle(true)}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    />
  ) : null;

  return { confirm, dialog };
}
