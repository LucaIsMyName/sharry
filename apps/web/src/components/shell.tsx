import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChartColumn,
  Globe,
  Images,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Link,
  MessageSquare,
  LogOut,
  Megaphone,
  Menu,
  ScrollText,
  Search as SearchIcon,
  Server,
  Settings,
  Users,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
} from "lucide-react";
import { NavLink, Outlet, useLoaderData, useLocation, useNavigate } from "react-router";
import { cn } from "cn";
import { api, type Me } from "../api.ts";
import { useAppName } from "../brand.ts";
import { useAccountLocale, useI18n } from "../i18n/index.tsx";
import { setTheme, useTheme, type ThemeChoice } from "../theme.ts";
import { Button } from "./ui/button.tsx";
import { cardBevel } from "./ui/card.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";
import { CommandMenu } from "./command-menu.tsx";
import { ShellTitleContext } from "./page-header.tsx";
import { useRouteTitle } from "./page-title.tsx";
import { readSidebarOpen, writeSidebarOpen } from "./sidebar-state.ts";
import { SubNavSlotContext } from "./sub-nav.tsx";
import { RouteErrorBoundary } from "./route-error-boundary.tsx";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar.tsx";

export function Shell() {
  const me = useLoaderData() as Me;
  const appName = useAppName();
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const routeTitle = useRouteTitle();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const chat = pathname === "/chat" || pathname.startsWith("/chat/");
  const builder = pathname.startsWith("/pages/");
  const [open, setOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [subNavSlot, setSubNavSlot] = useState<HTMLDivElement | null>(null);
  const admin = me.user.role === "admin";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || event.altKey) return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setSearchOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await navigate("/login");
  }

  const navigation = (
    <Navigation
      admin={admin}
      onNavigate={() => setOpen(false)}
      onSearch={() => setSearchOpen(true)}
    />
  );

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={(next) => {
        setSidebarOpen(next);
        writeSidebarOpen(next);
      }}
      className={cn("min-h-svh", chat && "h-svh overflow-hidden")}
    >
      <Sidebar collapsible="icon">
        <SidebarBrand appName={appName} />
        <SidebarContent>{navigation}</SidebarContent>
        <SidebarFooter>
          <AccountFoot
            user={me.user}
            onLogout={() => void logout()}
            onNavigate={() => setOpen(false)}
          />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className={cn(chat ? "flex h-svh flex-col overflow-hidden" : "min-h-svh")}>
        <div className="sticky top-0 z-30 shrink-0 md:hidden">
          <div className="grid h-12 grid-cols-[auto_auto_1fr] items-center gap-2 border-b border-border bg-background px-3 pointer-coarse:h-14 pointer-coarse:px-1.5">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger render={<Button variant="ghost" type="button" className="justify-self-start px-2" />}>
                <Menu /> {t("Menu")}
              </SheetTrigger>
              <SheetContent
                side="left"
                className="p-4 w-72 border-sidebar-border bg-sidebar text-sidebar-foreground sm:max-w-xs"
              >
                <p className="font-heading px-1 pt-2 text-2xl font-medium tracking-tight">
                  {appName}
                </p>
                {navigation}
                <AccountFoot
                  user={me.user}
                  onLogout={() => void logout()}
                  onNavigate={() => setOpen(false)}
                />
              </SheetContent>
            </Sheet>
            
            <p className="flex items-center min-w-0 truncate text-center text-sm font-medium" aria-hidden>
              <span className="text-muted-foreground pr-3"><ChevronRight size={16} /></span> {routeTitle}
            </p>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label={t("Search")}
              className="justify-self-end"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon />
            </Button>
          </div>
          <div ref={setSubNavSlot} />
        </div>
        <div className={cn(chat ? "flex min-h-0 flex-1 flex-col overflow-hidden" : cn("page px-5 py-5 md:px-7 md:py-7", builder && "page-wide"))}>
          <ShellTitleContext.Provider value={routeTitle}>
            <SubNavSlotContext.Provider value={subNavSlot}>
              <Outlet context={{ admin }} />
            </SubNavSlotContext.Provider>
          </ShellTitleContext.Provider>
        </div>
      </SidebarInset>
      <RouteErrorBoundary resetKey={pathname} message={t("Search could not be opened.")}>
        <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} admin={admin} />
      </RouteErrorBoundary>
    </SidebarProvider>
  );
}

function SidebarBrand({ appName }: { appName: string }) {
  const { t } = useI18n();
  const { open } = useSidebar();
  const mark = appName.trim().charAt(0).toUpperCase() || "S";
  return (
    <SidebarHeader>
      <div data-sidebar="brand" className="flex h-10 items-center gap-2 overflow-hidden px-1">
        <span className="flex size-4 shrink-0 items-center justify-center text-sm font-bold group-data-[state=expanded]/sidebar:hidden group-hover/sidebar-panel:hidden">
          {mark}
        </span>
        <NavLink
          to="/"
          className="hidden min-w-0 flex-1 truncate font-heading text-xl font-bold tracking-tight group-data-[state=expanded]/sidebar:block group-hover/sidebar-panel:block"
        >
          {appName}
        </NavLink>
        <SidebarTrigger
          aria-label={open ? t("Hide sidebar") : t("Show sidebar")}
          className="ml-auto hidden group-data-[state=expanded]/sidebar:inline-flex group-hover/sidebar-panel:inline-flex"
        />
      </div>
    </SidebarHeader>
  );
}

function Navigation({
  admin,
  onNavigate,
  onSearch,
}: {
  admin: boolean;
  onNavigate: () => void;
  onSearch: () => void;
}) {
  const { t } = useI18n();
  return (
    <SidebarMenu
      className="min-h-0 flex-1 content-start overflow-y-auto overscroll-contain"
      onClick={onNavigate}
    >
      <Item to="/" end icon={<LayoutDashboard className="size-4" />}>
        {t("Overview")}
      </Item>
      <Item to="/links" icon={<Link className="size-4" />}>
        {t("Links")}
      </Item>
      <Item to="/campaigns" icon={<Megaphone className="size-4" />}>
        {t("Campaigns")}
      </Item>
      <Item to="/pages" icon={<LayoutTemplate className="size-4" />}>
        {t("Pages")}
      </Item>
      <Item to="/media" icon={<Images className="size-4" />}>
        {t("Media")}
      </Item>
      <Item to="/analytics" icon={<ChartColumn className="size-4" />}>
        {t("Analytics")}
      </Item>
      <Item to="/chat" icon={<MessageSquare className="size-4" />}>
        {t("Chat")}
      </Item>
      <SearchButton onOpen={onSearch} />
      <hr className="my-2 border-0 border-t border-sidebar-border" />
      <Item to="/docs" icon={<BookOpen className="size-4" />}>
        {t("Docs")}
      </Item>
      {admin ? (
        <Item to="/admin/users" icon={<Users className="size-4" />}>
          {t("Users")}
        </Item>
      ) : null}
      {admin ? (
        <Item to="/admin/api-keys" icon={<KeyRound className="size-4" />}>
          {t("API keys")}
        </Item>
      ) : null}
      {admin ? (
        <Item to="/admin/settings" icon={<Settings className="size-4" />}>
          {t("Settings")}
        </Item>
      ) : null}
      {admin ? (
        <Item to="/admin/domains" icon={<Globe className="size-4" />}>
          {t("Domains")}
        </Item>
      ) : null}
      {admin ? (
        <Item to="/admin/server" icon={<Server className="size-4" />}>
          {t("Server")}
        </Item>
      ) : null}
      {admin ? (
        <Item to="/admin/audit" icon={<ScrollText className="size-4" />}>
          {t("Audit")}
        </Item>
      ) : null}
    </SidebarMenu>
  );
}

function Item({
  to,
  end,
  icon,
  children,
  className,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex h-11 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:h-9",
          isActive && cn("border-muted-foreground bg-sidebar-accent text-sidebar-accent-foreground", cardBevel),
          className,
        )
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("Search")}
      onClick={onOpen}
      className="flex h-11 min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:h-9"
    >
      <SearchIcon className="size-4 shrink-0" />
      <span className="truncate">{t("Search")}</span>
      <kbd className="ml-auto hidden font-mono text-[10px] text-sidebar-foreground/60 group-data-[state=expanded]/sidebar:inline group-hover/sidebar-panel:inline">
        {commandShortcut()}
      </kbd>
    </button>
  );
}

function commandShortcut(): string {
  const mac = "⌘K";
  const other = "Ctrl+K";
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;
  return /Mac|iPhone|iPad/.test(platform) ? mac : other;
}

const themeOptions: { value: ThemeChoice; label: string | ReactNode }[] = [
  { value: "light", label: <Sun size={14} /> },
  { value: "dark", label: <Moon size={14} /> },
  { value: "system", label: <Monitor size={14} /> },
];

function ThemeSwitch() {
  const { t } = useI18n();
  const choice = useTheme();
  const current = themeOptions.find((option) => option.value === choice) ?? themeOptions[2];
  const order: ThemeChoice[] = ["light", "dark", "system"];
  const mode = choice === "light" ? "Light" : choice === "dark" ? "Dark" : "System";
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={`${t("Appearance")}, ${t(mode)}`}
      className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      onClick={() => {
        const index = order.indexOf(choice);
        const next = order[(index + 1) % order.length] ?? "system";
        setTheme(next);
      }}
    >
      {current?.label}
    </Button>
  );
}

function AccountFoot({
  user,
  onLogout,
  onNavigate,
}: {
  user: Me["user"];
  onLogout: () => void;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const initial = user.username.trim().charAt(0).toUpperCase() || "?";
  const icon = user.hasAvatar ? (
    <img
      src={`/api/auth/avatar?v=${encodeURIComponent(user.updatedAt)}`}
      alt=""
      className="size-[18px] rounded-md object-cover"
    />
  ) : (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-[10px] leading-none font-medium text-sidebar-accent-foreground">
      {initial}
    </span>
  );
  return (
    <div className="mt-auto grid w-full min-w-0 gap-2 overflow-hidden" onClick={onNavigate}>
      <ThemeSwitch />
      <NavLink
        to="/account"
        className={({ isActive }) =>
          cn(
            "inline-flex h-8 min-w-0 items-center gap-1.5 overflow-hidden rounded-md border border-sidebar-border bg-transparent px-1.5 text-sm font-medium whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pointer-coarse:h-11",
            cardBevel,
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          )
        }
      >
        {icon}
        <span className="truncate">{user.username}</span>
      </NavLink>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              type="button"
              aria-label={t("Sign out")}
              className="w-full justify-start overflow-hidden border-sidebar-border bg-transparent px-1.5 whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={onLogout}
            />
          }
        >
          <LogOut className="shrink-0" />
          <span className="truncate">{t("Sign out")}</span>
        </TooltipTrigger>
        <TooltipContent>{t("Sign out")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
