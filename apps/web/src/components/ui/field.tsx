import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "cn";
import { Label } from "./label.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip.tsx";

type Tone = "error" | "info" | "success";

const dismissedFieldMessages = new Set<string>();

function fieldMessageKey(tone: Tone, message: string) {
  return `${tone}\n${message}`;
}

export function clearDismissedFieldMessages() {
  dismissedFieldMessages.clear();
}

export function Field({
  label,
  children,
  error,
  info,
  success,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  info?: string;
  success?: string;
}) {
  const generatedId = useId();
  const message = error || info || success || "";
  const tone: Tone | null = error
    ? "error"
    : info
      ? "info"
      : success
        ? "success"
        : null;
  const descriptionId = message ? `${generatedId}-message` : undefined;

  return (
    <div data-slot="field" className="grid w-full items-start gap-1.5">
      <Label className="grid w-full items-start gap-1.5">
        <span className="flex items-center gap-1.5">
          <span>{label}</span>
          {message && tone ? (
            <FieldMessage
              id={descriptionId}
              tone={tone}
              message={message}
            />
          ) : null}
        </span>
        {bindControl(children, generatedId, Boolean(error), descriptionId)}
      </Label>
    </div>
  );
}

export function FieldMessage({
  id,
  tone,
  message,
  initialOpen = true,
}: {
  id?: string;
  tone: Tone;
  message: string;
  initialOpen?: boolean;
}) {
  const key = fieldMessageKey(tone, message);
  const [open, setOpen] = useState(
    () => initialOpen && !dismissedFieldMessages.has(key),
  );
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setOpen(initialOpen && !dismissedFieldMessages.has(key));
  }, [initialOpen, key]);
  const Icon =
    tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <Tooltip
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (
          !next &&
          (details.reason === "outside-press" ||
            details.reason === "escape-key" ||
            details.reason === "trigger-press")
        ) {
          dismissedFieldMessages.add(key);
        }
      }}
    >
      <TooltipTrigger
        render={<span />}
        role="button"
        tabIndex={0}
        delay={0}
        id={id}
        aria-label={message}
        data-slot="field-message"
        data-tone={tone}
        onClick={(event) => event.preventDefault()}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          tone === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}

function bindControl(
  children: ReactNode,
  controlId: string,
  invalid: boolean,
  describedBy: string | undefined,
) {
  let bound = false;
  return Children.map(children, (child) => {
    if (bound || !isValidElement<{ id?: string }>(child)) return child;
    bound = true;
    return cloneElement(child as ReactElement<Record<string, unknown>>, {
      id: child.props.id ?? controlId,
      "aria-invalid": invalid || undefined,
      "aria-describedby": describedBy,
    });
  });
}
