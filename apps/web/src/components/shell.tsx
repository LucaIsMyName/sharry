import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChartColumn,
  Globe,
  KeyRound,
  LayoutDashboard,
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
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet.tsx";

export function Shell() {
  const me = useLoaderData() as Me;
  const appName = useAppName();
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const chat = pathname === "/chat" || pathname.startsWith("/chat/");
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-4 border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
        <p className="font-heading text-2xl font-medium tracking-tight">
          {appName}
        </p>
        {navigation}
        <AccountFoot
          user={me.user}
          onLogout={() => void logout()}
          onNavigate={() => setOpen(false)}
        />
      </aside>
      <main className={cn("md:ml-60", chat ? "flex h-svh flex-col overflow-hidden" : "min-h-svh")}>
        <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" type="button" className={"px-2"} />}>
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
        </div>
        <div className={cn(chat ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "page px-5 py-5 md:px-7 md:py-7")}>
          <Outlet context={{ admin }} />
        </div>
      </main>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} admin={admin} />
    </div>
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
    <nav
      className="grid content-start gap-1 overflow-auto"
      onClick={onNavigate}
    >
      <Item to="/" end icon={<LayoutDashboard size={18} />}>
        {t("Overview")}
      </Item>
      <Item to="/links" icon={<Link size={18} />}>
        {t("Links")}
      </Item>
      <Item to="/campaigns" icon={<Megaphone size={18} />}>
        {t("Campaigns")}
      </Item>
      <Item to="/analytics" icon={<ChartColumn size={18} />}>
        {t("Analytics")}
      </Item>
      <Item to="/chat" icon={<MessageSquare size={18} />}>
        {t("Chat")}
      </Item>
      <SearchButton onOpen={onSearch} />
      <hr className="my-2 border-0 border-t border-sidebar-border" />
      <Item compact to="/docs" icon={<BookOpen size={14} />}>
        {t("Docs")}
      </Item>
      {admin ? (
        <Item compact to="/admin/users" icon={<Users size={14} />}>
          {t("Users")}
        </Item>
      ) : null}
      {admin ? (
        <Item compact to="/admin/api-keys" icon={<KeyRound size={14} />}>
          {t("API keys")}
        </Item>
      ) : null}
      {admin ? (
        <Item compact to="/admin/settings" icon={<Settings size={14} />}>
          {t("Settings")}
        </Item>
      ) : null}
      {admin ? (
        <Item compact to="/admin/domains" icon={<Globe size={14} />}>
          {t("Domains")}
        </Item>
      ) : null}
      {admin ? (
        <Item compact to="/admin/server" icon={<Server size={14} />}>
          {t("Server")}
        </Item>
      ) : null}
      {admin ? (
        <Item compact to="/admin/audit" icon={<ScrollText size={14} />}>
          {t("Audit")}
        </Item>
      ) : null}
    </nav>
  );
}

function Item({
  to,
  end,
  icon,
  compact = false,
  children,
  className,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  compact?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-w-0 items-center  border rounded-md border-transparent text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          compact
            ? "gap-2 px-2.5 py-1.5 text-sm md:text-xs"
            : "gap-2.5 px-2.5 py-2 text-base md:text-sm",
          isActive && cn("border-muted-foreground bg-sidebar-accent text-sidebar-accent-foreground", cardBevel),
          className,
        )
      }
    >
      {icon}
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
      className="flex min-w-0 items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-base text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:text-sm"
    >
      <SearchIcon size={18} />
      <span className="truncate">{t("Search")}</span>
      <kbd className="ml-auto font-mono text-[10px] text-sidebar-foreground/60">
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
    <div className="mt-auto grid w-full min-w-0 gap-2" onClick={onNavigate}>
      <ThemeSwitch />
      <div className="flex min-w-0 items-center gap-1">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            cn(
              "inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border border-sidebar-border bg-transparent px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:h-7 md:text-xs",
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
                size="icon-sm"
                type="button"
                aria-label={t("Sign out")}
                className="shrink-0 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={onLogout}
              />
            }
          >
            <LogOut />
          </TooltipTrigger>
          <TooltipContent>{t("Sign out")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
