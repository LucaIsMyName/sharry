import { PanelLeft } from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
} from "react";
import { cn } from "cn";
import { Button } from "./button.tsx";

const SIDEBAR_WIDTH = "15rem";
// The 1px border sits inside the border box. Adding it keeps the closed content exactly 2rem square.
const SIDEBAR_WIDTH_ICON = "calc(3.5rem + 1px)";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [_open, _setOpen] = useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(open) : value;
      if (onOpenChange) onOpenChange(next);
      else _setOpen(next);
    },
    [onOpenChange, open],
  );
  const toggleSidebar = useCallback(() => {
    setOpen((value) => !value);
  }, [setOpen]);
  const state: SidebarContextValue["state"] = open ? "expanded" : "collapsed";
  const context = useMemo(
    () => ({ state, open, setOpen, toggleSidebar }),
    [state, open, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={context}>
      <div
        className={cn("group/sidebar-wrapper flex min-h-0 w-full", className)}
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as CSSProperties
        }
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  side = "left",
  collapsible = "icon",
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { state } = useSidebar();

  if (collapsible === "none") {
    return (
      <div className={cn("hidden h-full w-[var(--sidebar-width)] flex-col bg-sidebar md:flex", className)} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div
      className="group/sidebar peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
    >
      <div
        className={cn(
          "relative h-svh w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]",
        )}
      />
      <div
        data-sidebar="panel"
        className={cn(
          "group/sidebar-panel fixed inset-y-0 z-40 hidden h-svh w-[var(--sidebar-width)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex",
          side === "left" ? "left-0" : "right-0",
          "group-data-[collapsible=icon]/sidebar:w-[var(--sidebar-width-icon)]",
          "group-data-[collapsible=icon]/sidebar:hover:w-[var(--sidebar-width)]",
          className,
        )}
        {...props}
      >
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, toggleSidebar } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      data-sidebar="trigger"
      aria-expanded={open}
      className={cn("shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
    </Button>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("relative flex min-w-0 flex-1 flex-col", className)} {...props} />;
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-sidebar="header" className={cn("flex flex-col", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-sidebar="content"
      className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-sidebar="footer" className={cn("flex flex-col", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: ComponentProps<"nav">) {
  return <nav data-sidebar="menu" className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<"div">) {
  return <div data-sidebar="menu-item" className={cn("relative", className)} {...props} />;
}

export function SidebarMenuButton({
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  if (asChild) {
    const child = Children.only(children);
    if (isValidElement<{ className?: string }>(child)) {
      return cloneElement(child, {
        "data-sidebar": "menu-button",
        className: cn(className, child.props.className),
      } as never);
    }
  }
  return (
    <button data-sidebar="menu-button" className={cn(className)} {...props}>
      {children}
    </button>
  );
}
