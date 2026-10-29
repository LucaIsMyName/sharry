import { createContext, isValidElement, useContext, useRef, useState, type ReactNode } from "react";
import { appSlug } from "@sharry/shared";
import { Check, Copy, Menu } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useParams } from "react-router";
import remarkGfm from "remark-gfm";
import { cn } from "cn";
import apiDocs, { type ApiDoc } from "virtual:api-docs";
import { useAppName } from "../brand.ts";
import { PageTitle } from "../components/page-title.tsx";
import { Button } from "../components/ui/button.tsx";
import { copyText } from "../components/ui/copy.ts";
import { toast } from "../components/ui/toast.tsx";
import { DataTable, type DataColumn } from "../components/ui/data-table.tsx";
import { SubNav } from "../components/sub-nav.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../components/ui/sheet.tsx";
import { useI18n } from "../i18n/index.tsx";
import { docsCodeBlockClass, MermaidBlock } from "./docs-mermaid.tsx";
import { DocsNav } from "./docs-nav.tsx";
import { docsForLocale } from "./docs-pages.ts";
import { TestResultsPage } from "./test-results-page.tsx";

export function DocsPage() {
  const { t, locale } = useI18n();
  const params = useParams();
  const slug = params["*"] ?? "";
  const visible = docsForLocale(locale);
  const page = visible.find((item) => item.slug === slug);
  const [navOpen, setNavOpen] = useState(false);
  const userPages = visible.filter((item) => item.group === "User");
  const backendPages = visible.filter((item) => item.section === "Backend");
  const frontendPages = visible.filter((item) => item.section === "Frontend");
  const documentTitle =
    slug === "api"
      ? t("API reference")
      : slug === "developer/tests"
        ? t("Last run")
        : (page?.title ?? t("Docs"));
  return (
    <div className="grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <PageTitle title={documentTitle} literal />
      <div className="hidden self-stretch md:block">
        <DocsNav
          slug={slug}
          userPages={userPages}
          backendPages={backendPages}
          frontendPages={frontendPages}
        />
      </div>
      <SubNav label={t("Docs")}>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger render={<Button variant="ghost" size="sm" type="button" />}>
            <Menu /> {t("Docs")}
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-72 border-sidebar-border bg-sidebar p-4 pb-0 text-sidebar-foreground sm:max-w-xs"
          >
            <SheetTitle className="pr-8 text-sidebar-foreground">{t("Docs")}</SheetTitle>
            <div data-slot="docs-sheet-list" className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {navOpen ? (
                <DocsNav
                  slug={slug}
                  userPages={userPages}
                  backendPages={backendPages}
                  frontendPages={frontendPages}
                  onNavigate={() => setNavOpen(false)}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      </SubNav>
      <article className="min-w-0">
        {slug === "api" ? (
          <ApiReference />
        ) : slug === "developer/tests" ? (
          <TestResultsPage />
        ) : page ? (
          <Markdown source={page.markdown} slug={slug} />
        ) : (
          <p className="text-base text-muted-foreground md:text-sm">
            {t("That page is not in the docs.")}
          </p>
        )}
      </article>
    </div>
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
        <p className="mt-3 text-base leading-6 md:text-sm">
          {withValues(
            t(
              "Call {url} with {header}. A key acts as the user it was created for. Routes marked session accept only the dashboard cookie.",
            ),
            {
              url: (
                <code className="rounded bg-muted px-1 font-mono text-sm md:text-[13px]">
                  https://your-domain/api/...
                </code>
              ),
              header: (
                <code className="rounded bg-muted px-1 font-mono text-sm md:text-[13px]">
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
                <span className="font-mono text-sm font-medium text-primary md:text-xs">
                  {doc.method}
                </span>
                <code className="font-mono text-base md:text-sm">{doc.path}</code>
              </div>
              {doc.summary ? (
                <p className="text-base leading-6 md:text-sm">{t(doc.summary)}</p>
              ) : null}
              {doc.auth ? (
                <p className="text-base text-muted-foreground md:text-sm">
                  {t("Auth: {auth}", { auth: t(doc.auth) })}
                </p>
              ) : null}
              <ParamList label={t("Path")} items={doc.params} />
              <ParamList label={t("Query")} items={doc.query} />
              {doc.body ? (
                <p className="text-base md:text-sm">
                  <span className="font-medium">{t("Body. ")}</span>
                  {t(doc.body)}
                </p>
              ) : null}
              {doc.responses.length > 0 ? (
                <ul className="grid gap-1 text-base md:text-sm">
                  {doc.responses.map((response) => (
                    <li key={`${response.status} ${response.description}`}>
                      <span className="font-mono text-sm md:text-xs">
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
      <p className="text-base font-medium md:text-sm">{t(label)}</p>
      <ul className="grid gap-1 text-base md:text-sm">
        {items.map((item) => (
          <li key={item.name}>
            <code className="font-mono text-sm md:text-[13px]">{item.name}</code>
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

const docsTables = createContext<{ slug: string; nextIndex: () => number }>({
  slug: "docs",
  nextIndex: () => 0,
});

function Markdown({ source, slug }: { source: string; slug: string }) {
  const index = useRef(0);
  index.current = 0;
  return (
    <docsTables.Provider value={{ slug, nextIndex: () => index.current++ }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {source}
      </ReactMarkdown>
    </docsTables.Provider>
  );
}

function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(cellText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return cellText(node.props.children);
  return "";
}

function markdownRows(node: ReactNode): string[][] {
  const rows: string[][] = [];
  const walk = (child: ReactNode) => {
    if (Array.isArray(child)) {
      child.forEach(walk);
      return;
    }
    if (!isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === "tr") {
      rows.push(Array.isArray(child.props.children) || child.props.children != null
        ? (Array.isArray(child.props.children) ? child.props.children : [child.props.children]).map((cell) => cellText(cell).trim())
        : []);
      return;
    }
    walk(child.props.children);
  };
  walk(node);
  return rows;
}

function DocsMarkdownTable({ children }: { children?: ReactNode }) {
  const { slug, nextIndex } = useContext(docsTables);
  const index = nextIndex();
  const parsed = markdownRows(children);
  const headers = parsed[0] ?? [];
  const body = parsed.slice(1).map((cells, rowIndex) => ({ id: String(rowIndex), cells }));
  const columns: DataColumn<(typeof body)[number]>[] = headers.map((header, column) => ({
    id: `c${column}`,
    header: header || "Column",
    sortable: true,
    filter: "text",
    sortValue: (row) => row.cells[column] ?? "",
    filterValue: (row) => row.cells[column] ?? "",
    cell: (row) => row.cells[column] ?? "",
  }));
  return (
    <div className="mt-3">
      <DataTable
        storageKey={`docs:${slug}:${index}`}
        columns={columns}
        rows={body}
        getRow={(row) => ({ id: row.id, label: row.cells.join(" ") })}
      />
    </div>
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
  p: ({ children }) => <p className="mt-3 text-base leading-6 md:text-sm">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-6 md:text-sm">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-base leading-6 md:text-sm">
      {children}
    </ol>
  ),
  a: ({ href, children }) => (
    <a className="text-primary underline underline-offset-2" href={href}>
      {children}
    </a>
  ),
  code: ({ className, children }) => (
    <CodeBlock className={cn(className)}>{children}</CodeBlock>
  ),
  pre: ({ children }) => {
    const chart = mermaidSource(children);
    if (chart !== null) return <MermaidBlock source={chart} />;
    return <DocsCodeBlock>{children}</DocsCodeBlock>;
  },
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-border pl-3 text-base text-muted-foreground md:text-sm">
      {children}
    </blockquote>
  ),
  table: ({ children }) => <DocsMarkdownTable>{children}</DocsMarkdownTable>,
  th: ({ children }) => (
    <th className="border-b px-2 py-1 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-2 py-1 align-top">{children}</td>
  ),
};

function mermaidSource(children: ReactNode): string | null {
  const node = Array.isArray(children) ? children[0] : children;
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return null;
  if (!node.props.className?.includes("language-mermaid")) return null;
  return String(node.props.children ?? "").replace(/\n$/, "");
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function DocsCodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5 z-10 text-[#f1f1f1] hover:bg-white/10 hover:text-white"
        aria-label={copied ? t("Copied") : t("Copy code")}
        onClick={() => {
          void copyText(nodeText(children).replace(/\n$/, ""))
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => toast.error(t("Could not copy the code")));
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <pre className={cn(docsCodeBlockClass, "mt-0 pr-12")}>{children}</pre>
    </div>
  );
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  if (className)
    return (
      <code className={cn("font-mono text-sm md:text-[85%]", className)}>{children}</code>
    );
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm md:text-[85%]">
      {children}
    </code>
  );
}
