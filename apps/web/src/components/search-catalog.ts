export type CatalogItem = {
  id: string;
  title: string;
  to: string;
  keywords: string[];
  admin?: boolean;
  page?: string;
};

export const pageCatalog: CatalogItem[] = [
  { id: "overview", title: "Overview", to: "/", keywords: ["dashboard"] },
  { id: "links", title: "Links", to: "/links", keywords: ["short links"] },
  { id: "new-link", title: "New link", to: "/links/new", keywords: ["create"] },
  { id: "campaigns", title: "Campaigns", to: "/campaigns", keywords: ["utm"] },
  { id: "pages", title: "Pages", to: "/pages", keywords: ["landing pages", "builder"] },
  { id: "media", title: "Media", to: "/media", keywords: ["images", "files", "uploads"] },
  { id: "analytics", title: "Analytics", to: "/analytics", keywords: ["clicks"] },
  { id: "chat", title: "Chat", to: "/chat", keywords: ["assistant"] },
  { id: "docs", title: "Docs", to: "/docs", keywords: ["guides"] },
  { id: "account", title: "Account", to: "/account", keywords: ["profile"] },
  { id: "users", title: "Users", to: "/admin/users", keywords: ["accounts"], admin: true },
  { id: "api-keys", title: "API keys", to: "/admin/api-keys", keywords: ["tokens"], admin: true },
  { id: "settings", title: "Settings", to: "/admin/settings", keywords: ["mail"], admin: true },
  { id: "domains", title: "Domains", to: "/admin/domains", keywords: ["dns"], admin: true },
  { id: "server", title: "Server", to: "/admin/server", keywords: ["memory", "disk"], admin: true },
  { id: "audit", title: "Audit", to: "/admin/audit", keywords: ["log"], admin: true },
];

export const sectionCatalog: CatalogItem[] = [
  { id: "account-password", title: "Password", to: "/account", page: "Account", keywords: ["password"] },
  {
    id: "account-mfa",
    title: "Two-factor authentication",
    to: "/account",
    page: "Account",
    keywords: ["two-factor", "recovery codes"],
  },
  { id: "account-language", title: "Language", to: "/account", page: "Account", keywords: ["language", "locale"] },
  { id: "account-photo", title: "Photo", to: "/account", page: "Account", keywords: ["photo", "avatar"] },
  {
    id: "settings-prefix",
    title: "Public prefix",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["prefix"],
    admin: true,
  },
  {
    id: "settings-page-prefix",
    title: "Landing page prefix",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["pages prefix", "landing pages"],
    admin: true,
  },
  {
    id: "settings-mail",
    title: "Email",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["mail server", "smtp", "SMTP host"],
    admin: true,
  },
  {
    id: "settings-sharing",
    title: "Link sharing",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["sharing", "Users see each other's links"],
    admin: true,
  },
  {
    id: "settings-retention",
    title: "Analytics retention, days",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["retention"],
    admin: true,
  },
  {
    id: "settings-session",
    title: "Session length, hours",
    to: "/admin/settings",
    page: "Settings",
    keywords: ["session"],
    admin: true,
  },
];

export function catalogMatches(
  query: string,
  items: CatalogItem[],
  admin: boolean,
  translate: (message: string) => string,
  includeWhenEmpty: boolean,
): CatalogItem[] {
  const visible = items.filter((item) => !item.admin || admin);
  const needle = query.trim().toLowerCase();
  if (!needle) return includeWhenEmpty ? visible : [];
  return visible.filter((item) => haystack(item, translate).includes(needle));
}

export type DocHit = {
  slug: string;
  title: string;
  snippet: string | null;
};

export function matchingDocs(
  query: string,
  docs: { slug: string; title: string; text: string }[],
): DocHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: DocHit[] = [];
  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const body = doc.text.toLowerCase();
    if (!title.includes(needle) && !body.includes(needle)) continue;
    hits.push({
      slug: doc.slug,
      title: doc.title,
      snippet: title.includes(needle) ? null : excerpt(doc.text, needle),
    });
    if (hits.length === 8) break;
  }
  return hits;
}

function haystack(item: CatalogItem, translate: (message: string) => string): string {
  const parts = [item.title, item.page ?? "", ...item.keywords].filter(Boolean);
  return parts
    .flatMap((part) => [part, translate(part)])
    .join(" ")
    .toLowerCase();
}

function excerpt(text: string, needle: string): string | null {
  const plain = text.replace(/[#>*_`[\]]/g, " ").replace(/\s+/g, " ").trim();
  const index = plain.toLowerCase().indexOf(needle);
  if (index < 0) return null;
  let start = Math.max(0, index - 24);
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    if (space !== -1 && space < index) start = space + 1;
  }
  let end = Math.min(plain.length, index + needle.length + 48);
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    if (space > index + needle.length) end = space;
  }
  return plain.slice(start, end).trim();
}
