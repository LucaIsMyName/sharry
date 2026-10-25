import type { ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import { t } from "../../i18n/translate.ts";

const manager = Toast.createToastManager();

type ToastTone = "error" | "info" | "success";

function show(tone: ToastTone, message: string) {
  manager.add({
    id: `${tone}:${message}`,
    title: message,
    type: tone,
    priority: tone === "error" ? "high" : "low",
    timeout: 5000,
  });
}

export const toast = {
  error(message: string) {
    show("error", message);
  },
  info(message: string) {
    show("info", message);
  },
  success(message: string) {
    show("success", message);
  },
};

export function toastCaught(caught: unknown, fallback: string) {
  toast.error(t(caught instanceof Error ? caught.message : fallback));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      {children}
      <Toaster />
    </Toast.Provider>
  );
}

function Toaster() {
  const { t } = useI18n();
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-4 bottom-4 z-[100] flex w-[min(22rem,calc(100%-2rem))] flex-col-reverse gap-2 outline-none">
        {toasts.map((item) => (
          <Toast.Root
            key={item.id}
            toast={item}
            className={cn(
              "flex items-start gap-3 rounded-md border bg-popover px-3 py-2.5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10",
              item.type === "error" && "border-destructive/30 text-destructive",
            )}
          >
            <Toast.Content className="min-w-0 flex-1">
              <Toast.Title className="text-sm leading-snug font-medium" />
            </Toast.Content>
            <Toast.Close
              aria-label={t("Dismiss")}
              className="shrink-0 rounded-sm opacity-70 outline-none hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <XIcon className="size-4" />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
