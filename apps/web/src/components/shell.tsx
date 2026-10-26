import { useState } from "react";
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
  Server,
  Settings,
  Users,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { NavLink, Outlet, useLoaderData, useNavigate } from "react-router";
import { cn } from "cn";
import { api, type Me } from "../api.ts";
import { useAppName } from "../brand.ts";
import { useAccountLocale, useI18n } from "../i18n/index.tsx";
import { setTheme, useTheme, type ThemeChoice } from "../theme.ts";
import { useRouteTitle } from "./page-title.tsx";
import { Button } from "./ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet.tsx";

export function Shell() {
  const me = useLoaderData() as Me;
  const appName = useAppName();
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const title = useRouteTitle();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const admin = me.user.role === "admin";

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await navigate("/login");
  }

  const navigation = (
    <Navigation admin={admin} onNavigate={() => setOpen(false)} />
  );

  return (
    <div className="min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-4 bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
        <p className="font-heading text-3xl font-medium tracking-tight">
          {appName}
        </p>
        {navigation}
        <AccountFoot
          user={me.user}
          onLogout={() => void logout()}
          onNavigate={() => setOpen(false)}
        />
      </aside>
      <main className="min-h-svh md:ml-60">
        <div className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background px-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="outline" size="sm" type="button" />}>
              <Menu /> {t("Menu")}
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-4 w-72 border-sidebar-border bg-sidebar text-sidebar-foreground sm:max-w-xs"
            >
              <p className="font-heading px-1 pt-2 text-3xl font-medium tracking-tight">
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
          <p className="min-w-0 truncate text-sm font-medium">{title}</p>
        </div>
        <div className="page px-5 py-5 md:px-7 md:py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Navigation({
  admin,
  onNavigate,
}: {
  admin: boolean;
  onNavigate: () => void;
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
          "flex min-w-0 items-center rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white",
          compact
            ? "gap-2 px-2.5 py-1.5 text-xs"
            : "gap-2.5 px-2.5 py-2 text-sm",
          isActive && "bg-sidebar-accent text-white",
          className,
        )
      }
    >
      {icon}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

const themeOptions: { value: ThemeChoice; label: string | ReactNode }[] = [
  { value: "light", label: <Sun size={14} /> },
  { value: "dark", label: <Moon size={14} /> },
  { value: "system", label: <Monitor size={14} /> },
];

function ThemeSwitch() {
  const { t } = useI18n();
  const choice = useTheme();
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={t("Appearance")}>
      {themeOptions.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="icon-sm"
          variant="outline"
          aria-pressed={choice === option.value}
          aria-label={t(option.value === "light" ? "Light" : option.value === "dark" ? "Dark" : "System")}
          className={cn(
            "border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
            choice === option.value && "bg-sidebar-accent text-white",
          )}
          onClick={() => setTheme(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
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
      className="size-[18px] rounded-full object-cover"
    />
  ) : (
    <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[10px] leading-none font-medium text-white">
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
              "inline-flex h-7 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md border border-sidebar-border bg-transparent px-2 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
              isActive && "bg-sidebar-accent text-white",
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
                className="shrink-0 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
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
