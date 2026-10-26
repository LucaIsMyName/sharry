import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Command } from "cmdk";
import {
  BookOpen,
  ChartColumn,
  Globe,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  Megaphone,
  MessageSquare,
  ScrollText,
  Server,
  Settings,
  User,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "../api.ts";
import { auditActionSentence } from "../audit-actions.ts";
import { t, useI18n } from "../i18n/index.tsx";
import { searchableDocs } from "../pages/docs-pages.ts";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./ui/dialog.tsx";
import { toastCaught } from "./ui/toast.tsx";
import {
  catalogMatches,
  matchingDocs,
  pageCatalog,
  sectionCatalog,
} from "./search-catalog.ts";

const searchDelayMs = 200;

export type SearchLink = {
  id: string;
  title: string | null;
  slug: string;
  destinationUrl: string;
  description: string | null;
};

export type SearchCampaign = {
  id: string;
  name: string;
  description: string | null;
};

export type SearchChat = {
  id: string;
  title: string;
  snippet: string | null;
};

export type SearchUser = { id: string; username: string; email: string };
export type SearchDomain = { id: string; hostname: string };
export type SearchApiKey = { id: string; name: string; tokenPrefix: string };
export type SearchAudit = {
  id: string;
  action: string;
  actorUsername: string | null;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

export type SearchResponse = {
  links: SearchLink[];
  campaigns: SearchCampaign[];
  chats: SearchChat[];
  users?: SearchUser[];
  domains?: SearchDomain[];
  apiKeys?: SearchApiKey[];
  audit?: SearchAudit[];
};

export function CommandMenu({
  open,
  onOpenChange,
  admin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: boolean;
}) {
  const { t: translate, locale } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setResult(null);
    setSearching(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResult(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((next) => {
          if (active) setResult(next);
        })
        .catch((caught: unknown) => {
          if (!active || isAbort(caught)) return;
          toastCaught(caught, t("Could not search"));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, searchDelayMs);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function go(to: string) {
    onOpenChange(false);
    void navigate(to);
  }

  const pages = catalogMatches(query, pageCatalog, admin, translate, true);
  const sections = catalogMatches(query, sectionCatalog, admin, translate, false);
  const docs = matchingDocs(query, searchableDocs(locale));
  const links = result?.links ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">{translate("Search")}</DialogTitle>
        <Command
          shouldFilter={false}
          vimBindings={false}
          label={translate("Search")}
          className="flex flex-col"
        >
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={translate("Search pages, links, and docs")}
            className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-3">
            <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
              {searching ? translate("Searching…") : translate("No results")}
            </Command.Empty>
            <Group heading={translate("Pages")}>
              {pages.map((item) => (
                <Row key={item.id} value={item.id} to={item.to} title={translate(item.title)} onSelect={() => go(item.to)} />
              ))}
              {sections.map((item) => (
                <Row
                  key={item.id}
                  value={item.id}
                  to={item.to}
                  title={translate(item.title)}
                  detail={item.page ? translate(item.page) : undefined}
                  onSelect={() => go(item.to)}
                />
              ))}
            </Group>
            <Group heading={translate("Links")}>
              {links.map((link) => (
                <Row
                  key={link.id}
                  value={`link-${link.id}`}
                  to={`/links/${link.id}`}
                  title={linkName(link)}
                  detail={linkDetail(link)}
                  onSelect={() => go(`/links/${link.id}`)}
                />
              ))}
            </Group>
            <Group heading={translate("Analytics")}>
              {links.map((link) => (
                <Row
                  key={`analytics-${link.id}`}
                  value={`analytics-${link.id}`}
                  to={`/analytics?link=${link.id}`}
                  title={translate("Analytics for {name}", { name: linkName(link) })}
                  onSelect={() => go(`/analytics?link=${link.id}`)}
                />
              ))}
            </Group>
            <Group heading={translate("Campaigns")}>
              {(result?.campaigns ?? []).map((campaign) => (
                <Row
                  key={campaign.id}
                  value={`campaign-${campaign.id}`}
                  to={`/campaigns/${campaign.id}`}
                  title={campaign.name}
                  detail={campaign.description ?? undefined}
                  onSelect={() => go(`/campaigns/${campaign.id}`)}
                />
              ))}
            </Group>
            <Group heading={translate("Chats")}>
              {(result?.chats ?? []).map((chat) => (
                <Row
                  key={chat.id}
                  value={`chat-${chat.id}`}
                  to={`/chat/${chat.id}`}
                  title={chat.title}
                  detail={chat.snippet ?? undefined}
                  onSelect={() => go(`/chat/${chat.id}`)}
                />
              ))}
            </Group>
            <Group heading={translate("Docs")}>
              {docs.map((doc) => (
                <Row
                  key={doc.slug}
                  value={`doc-${doc.slug}`}
                  to={`/docs/${doc.slug}`}
                  title={doc.title}
                  detail={doc.snippet ?? undefined}
                  onSelect={() => go(`/docs/${doc.slug}`)}
                />
              ))}
            </Group>
            {admin ? (
              <>
                <Group heading={translate("Users")}>
                  {(result?.users ?? []).map((user) => (
                    <Row
                      key={user.id}
                      value={`user-${user.id}`}
                      to={`/admin/users?focus=${user.id}`}
                      title={user.username}
                      detail={user.email}
                      onSelect={() => go(`/admin/users?focus=${user.id}`)}
                    />
                  ))}
                </Group>
                <Group heading={translate("Domains")}>
                  {(result?.domains ?? []).map((domain) => (
                    <Row
                      key={domain.id}
                      value={`domain-${domain.id}`}
                      to={`/admin/domains?focus=${domain.id}`}
                      title={domain.hostname}
                      onSelect={() => go(`/admin/domains?focus=${domain.id}`)}
                    />
                  ))}
                </Group>
                <Group heading={translate("API keys")}>
                  {(result?.apiKeys ?? []).map((key) => (
                    <Row
                      key={key.id}
                      value={`key-${key.id}`}
                      to={`/admin/api-keys?focus=${key.id}`}
                      title={key.name}
                      detail={key.tokenPrefix}
                      onSelect={() => go(`/admin/api-keys?focus=${key.id}`)}
                    />
                  ))}
                </Group>
                <Group heading={translate("Audit")}>
                  {(result?.audit ?? []).map((entry) => (
                    <Row
                      key={entry.id}
                      value={`audit-${entry.id}`}
                      to={`/admin/audit?entry=${entry.id}`}
                      title={auditLabel(entry.action, translate)}
                      detail={[entry.actorUsername, entry.entityType].filter(Boolean).join(" · ")}
                      onSelect={() => go(`/admin/audit?entry=${entry.id}`)}
                    />
                  ))}
                </Group>
              </>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  const items = flatten(children);
  if (items.length === 0) return null;
  return (
    <Command.Group>
      <div className="px-2.5 pt-3 pb-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
      <div className="grid gap-1">{items}</div>
    </Command.Group>
  );
}

function flatten(children: ReactNode): ReactNode[] {
  const list = Array.isArray(children) ? children.flat() : children == null ? [] : [children];
  return list.filter(Boolean);
}

function Row({
  value,
  title,
  detail,
  to,
  onSelect,
}: {
  value: string;
  title: string;
  detail?: string;
  to: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-sm text-foreground data-[selected=true]:border-muted-foreground data-[selected=true]:bg-accent"
    >
      <span className="shrink-0 text-muted-foreground" aria-hidden>
        {routeIcon(to)}
      </span>
      <span className="min-w-0">
        <span className="block max-w-full truncate">{title}</span>
        {detail ? <span className="block max-w-full truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </Command.Item>
  );
}

function routeIcon(to: string): ReactNode {
  const path = to.split("?")[0] ?? to;
  if (path === "/") return <LayoutDashboard size={18} />;
  if (path.startsWith("/links")) return <LinkIcon size={18} />;
  if (path.startsWith("/campaigns")) return <Megaphone size={18} />;
  if (path.startsWith("/analytics")) return <ChartColumn size={18} />;
  if (path.startsWith("/chat")) return <MessageSquare size={18} />;
  if (path.startsWith("/docs")) return <BookOpen size={18} />;
  if (path.startsWith("/account")) return <User size={18} />;
  if (path.startsWith("/admin/users")) return <Users size={18} />;
  if (path.startsWith("/admin/api-keys")) return <KeyRound size={18} />;
  if (path.startsWith("/admin/settings")) return <Settings size={18} />;
  if (path.startsWith("/admin/domains")) return <Globe size={18} />;
  if (path.startsWith("/admin/server")) return <Server size={18} />;
  if (path.startsWith("/admin/audit")) return <ScrollText size={18} />;
  return <LayoutDashboard size={18} />;
}

function linkName(link: SearchLink): string {
  return link.title?.trim() || link.slug;
}

function linkDetail(link: SearchLink): string {
  const description = link.description?.trim();
  return [link.slug, link.destinationUrl, description].filter(Boolean).join(" · ");
}

function auditLabel(action: string, translate: (message: string) => string): string {
  const sentence = auditActionSentence(action);
  return sentence ? translate(sentence) : action;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
