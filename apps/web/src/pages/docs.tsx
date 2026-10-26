import type { ReactNode } from "react";
import { appSlug } from "@sharry/shared";
import ReactMarkdown, { type Components } from "react-markdown";
import { NavLink, useParams } from "react-router";
import remarkGfm from "remark-gfm";
import { cn } from "cn";
import apiDocs, { type ApiDoc } from "virtual:api-docs";
import { useAppName } from "../brand.ts";
import { PageTitle } from "../components/page-title.tsx";
import { useI18n } from "../i18n/index.tsx";

const rawPages = import.meta.glob("../../docs/*/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

type DocPage = {
  locale: string;
  slug: string;
  title: string;
  group: string;
  section: string;
  markdown: string;
};

const pageOrder = [
  "user/signing-in",
  "user/links",
  "user/campaigns",
  "user/qr-codes",
  "user/analytics",
  "user/api-keys",
  "user/settings",
  "user/domains",
  "user/server",
  "user/users",
  "developer/backend/overview",
  "developer/backend/development",
  "developer/backend/deploy",
  "developer/backend/auth",
  "developer/backend/redirects",
  "developer/frontend/overview",
  "developer/frontend/routing",
  "developer/frontend/api-client",
];

const pages: DocPage[] = Object.entries(rawPages)
  .map(([file, markdown]) => {
    const relative = file.replace(/^.*\/docs\//, "").replace(/\.md$/, "");
    const slash = relative.indexOf("/");
    const locale = slash > 0 ? relative.slice(0, slash) : "";
    const slug = slash > 0 ? relative.slice(slash + 1) : relative;
    const placement = place(slug);
    return {
      locale,
      slug,
      title: titleOf(String(markdown), slug),
      group: placement.group,
      section: placement.section,
      markdown: String(markdown),
    };
  })
  .filter((page) => page.group)
  .sort((left, right) => rank(left.slug) - rank(right.slug));

function pagesFor(locale: string): DocPage[] {
  const chosen = new Map<string, DocPage>();
  for (const page of pages) {
    if (page.locale === "en") chosen.set(page.slug, page);
  }
  for (const page of pages) {
    if (page.locale === locale) chosen.set(page.slug, page);
  }
  return [...chosen.values()].sort(
    (left, right) => rank(left.slug) - rank(right.slug),
  );
}

export function DocsPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const slug = params["*"] ?? "";
  const visible = pagesFor(locale);
  const page = visible.find((item) => item.slug === slug);
  const documentTitle =
    slug === "api" ? t("API reference") : (page?.title ?? t("Docs"));
  return (
    <div className="grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <PageTitle title={documentTitle} literal />
      <nav className="grid content-start gap-4">
        <DocGroup
          label={t("User")}
          pages={visible.filter((item) => item.group === "User")}
        />
        <div className="grid gap-2">
          <p className="px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("Developer")}
          </p>
          <DocGroup
            label={t("Backend")}
            pages={visible.filter((item) => item.section === "Backend")}
            nested
          />
          <DocGroup
            label={t("Frontend")}
            pages={visible.filter((item) => item.section === "Frontend")}
            nested
          />
        </div>
        <div className="grid gap-1">
          <p className="px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("API")}
          </p>
          <DocLink to="/docs/api">{t("Reference")}</DocLink>
        </div>
      </nav>
      <article className="min-w-0">
        {slug === "api" ? (
          <ApiReference />
        ) : page ? (
          <Markdown source={page.markdown} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("That page is not in the docs.")}
          </p>
        )}
      </article>
    </div>
  );
}

function DocGroup({
  label,
  pages: groupPages,
  nested = false,
}: {
  label: string;
  pages: DocPage[];
  nested?: boolean;
}) {
  if (groupPages.length === 0) return null;
  return (
    <div className="grid gap-1">
      <p
        className={cn(
          "px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase",
          nested && "pt-1",
        )}
      >
        {label}
      </p>
      {groupPages.map((page) => (
        <DocLink key={page.slug} to={`/docs/${page.slug}`}>
          {page.title}
        </DocLink>
      ))}
    </div>
  );
}

function DocLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-accent",
          isActive && "bg-secondary",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function withValues(
  template: string,
  values: Record<string, ReactNode>,
): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{\w+\}$/.exec(part)?.[0].slice(1, -1);
    return name ? <span key={index}>{values[name]}</span> : part;
  });
}

function ApiReference() {
  const { t } = useI18n();
  const appName = useAppName();
  const groups: { tag: string; docs: ApiDoc[] }[] = [];
  for (const doc of apiDocs) {
    const group = groups.find((item) => item.tag === doc.tag);
    if (group) group.docs.push(doc);
    else groups.push({ tag: doc.tag, docs: [doc] });
  }
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          {t("API reference")}
        </h1>
        <p className="mt-3 text-sm leading-6">
          {withValues(
            t(
              "Call {url} with {header}. A key acts as the user it was created for. Routes marked session accept only the dashboard cookie.",
            ),
            {
              url: (
                <code className="rounded bg-muted px-1 font-mono text-[13px]">
                  https://your-domain/api/...
                </code>
              ),
              header: (
                <code className="rounded bg-muted px-1 font-mono text-[13px]">
                  Authorization: Bearer {appSlug(appName)}_...
                </code>
              ),
            },
          )}
        </p>
      </div>
      {groups.map((group) => (
        <section key={group.tag} className="grid gap-3">
          <h2 className="font-heading text-2xl font-medium tracking-tight">
            {t(group.tag)}
          </h2>
          {group.docs.map((doc) => (
            <div
              key={`${doc.method} ${doc.path}`}
              className="grid gap-2 rounded-md border bg-card p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs font-medium text-primary">
                  {doc.method}
                </span>
                <code className="font-mono text-sm">{doc.path}</code>
              </div>
              {doc.summary ? (
                <p className="text-sm leading-6">{t(doc.summary)}</p>
              ) : null}
              {doc.auth ? (
                <p className="text-sm text-muted-foreground">
                  {t("Auth: {auth}", { auth: t(doc.auth) })}
                </p>
              ) : null}
              <ParamList label={t("Path")} items={doc.params} />
              <ParamList label={t("Query")} items={doc.query} />
              {doc.body ? (
                <p className="text-sm">
                  <span className="font-medium">{t("Body. ")}</span>
                  {t(doc.body)}
                </p>
              ) : null}
              {doc.responses.length > 0 ? (
                <ul className="grid gap-1 text-sm">
                  {doc.responses.map((response) => (
                    <li key={`${response.status} ${response.description}`}>
                      <span className="font-mono text-xs">
                        {response.status}
                      </span>{" "}
                      {t(response.description)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function ParamList({
  label,
  items,
}: {
  label: string;
  items: ApiDoc["params"];
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">{t(label)}</p>
      <ul className="grid gap-1 text-sm">
        {items.map((item) => (
          <li key={item.name}>
            <code className="font-mono text-[13px]">{item.name}</code>
            {item.type ? (
              <span className="text-muted-foreground"> {item.type}</span>
            ) : null}
            {item.description ? <span> — {t(item.description)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Markdown({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {source}
    </ReactMarkdown>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="font-heading text-2xl font-medium tracking-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 font-heading text-2xl font-medium tracking-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-lg font-medium">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-3 text-sm leading-6">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6">
      {children}
    </ol>
  ),
  a: ({ href, children }) => (
    <a className="text-primary underline underline-offset-2" href={href}>
      {children}
    </a>
  ),
  code: ({ className, children }) => (
    <CodeBlock className={className}>{children}</CodeBlock>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-md bg-sidebar p-3 text-sm text-sidebar-foreground">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <table className="mt-3 w-full text-left text-sm">{children}</table>
  ),
  th: ({ children }) => (
    <th className="border-b px-2 py-1 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-2 py-1 align-top">{children}</td>
  ),
};

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  if (className)
    return (
      <code className={cn("font-mono text-[13px]", className)}>{children}</code>
    );
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  );
}

function rank(slug: string): number {
  const index = pageOrder.indexOf(slug);
  return index === -1 ? pageOrder.length : index;
}

function place(slug: string): { group: string; section: string } {
  if (slug.startsWith("user/")) return { group: "User", section: "User" };
  if (slug.startsWith("developer/backend/"))
    return { group: "Developer", section: "Backend" };
  if (slug.startsWith("developer/frontend/"))
    return { group: "Developer", section: "Frontend" };
  return { group: "", section: "" };
}

function titleOf(markdown: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() || fallback;
}
