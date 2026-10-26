import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Command } from "cmdk";
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
            className="h-11 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {searching ? translate("Searching…") : translate("No results")}
            </Command.Empty>
            <Group heading={translate("Pages")}>
              {pages.map((item) => (
                <Row key={item.id} value={item.id} title={translate(item.title)} onSelect={() => go(item.to)} />
              ))}
              {sections.map((item) => (
                <Row
                  key={item.id}
                  value={item.id}
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
                  title={linkName(link)}
                  detail={link.title?.trim() ? `${link.slug} · ${link.destinationUrl}` : link.destinationUrl}
                  onSelect={() => go(`/links/${link.id}`)}
                />
              ))}
            </Group>
            <Group heading={translate("Analytics")}>
              {links.map((link) => (
                <Row
                  key={`analytics-${link.id}`}
                  value={`analytics-${link.id}`}
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
      <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{heading}</div>
      {items}
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
  onSelect,
}: {
  value: string;
  title: string;
  detail?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-accent"
    >
      <span className="max-w-full truncate">{title}</span>
      {detail ? <span className="max-w-full truncate text-xs text-muted-foreground">{detail}</span> : null}
    </Command.Item>
  );
}

function linkName(link: SearchLink): string {
  return link.title?.trim() || link.slug;
}

function auditLabel(action: string, translate: (message: string) => string): string {
  const sentence = auditActionSentence(action);
  return sentence ? translate(sentence) : action;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
