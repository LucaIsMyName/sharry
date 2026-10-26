import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "cn";
import { useI18n } from "../i18n/index.tsx";

export const docsNavStorageKey = "sharry.docs-nav";

export type DocsSection = "user" | "developer";

export type DocsNavPage = {
  slug: string;
  title: string;
};

export function sectionForSlug(slug: string): DocsSection | null {
  if (slug.startsWith("user/")) return "user";
  if (slug === "api" || slug.startsWith("developer/")) return "developer";
  return null;
}

export function resolveDocsSection(
  slug: string,
  stored: string | null,
): DocsSection {
  const fromPage = sectionForSlug(slug);
  if (stored === "user" || stored === "developer") {
    if (fromPage && fromPage !== stored) return fromPage;
    return stored;
  }
  return fromPage ?? "user";
}

export function DocsNav({
  slug,
  userPages,
  backendPages,
  frontendPages,
  onNavigate,
}: {
  slug: string;
  userPages: DocsNavPage[];
  backendPages: DocsNavPage[];
  frontendPages: DocsNavPage[];
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<DocsSection>(() =>
    resolveDocsSection(slug, readStoredSection()),
  );
  const [trackedSlug, setTrackedSlug] = useState(slug);
  if (slug !== trackedSlug) {
    setTrackedSlug(slug);
    setSection(resolveDocsSection(slug, readStoredSection()));
  }

  useEffect(() => {
    writeStoredSection(section);
  }, [section]);

  function open(next: DocsSection) {
    setSection(next);
    writeStoredSection(next);
  }

  return (
    <nav className="grid content-start gap-4 self-start md:sticky md:top-7 md:max-h-[calc(100svh-3.5rem)] md:overflow-y-auto">
      <Accordion
        label={t("User")}
        open={section === "user"}
        onOpen={() => open("user")}
      >
        {userPages.map((page) => (
          <DocLink key={page.slug} to={`/docs/${page.slug}`} onNavigate={onNavigate}>
            {page.title}
          </DocLink>
        ))}
      </Accordion>
      <Accordion
        label={t("Developer")}
        open={section === "developer"}
        onOpen={() => open("developer")}
      >
        <Chapter label={t("Backend")} pages={backendPages} onNavigate={onNavigate} />
        <Chapter label={t("Frontend")} pages={frontendPages} onNavigate={onNavigate} />
        <Chapter label={t("API")} pages={[{ slug: "api", title: t("Reference") }]} onNavigate={onNavigate} />
        <Chapter
          label={t("Tests")}
          pages={[{ slug: "developer/tests", title: t("Last run") }]}
          onNavigate={onNavigate}
        />
      </Accordion>
    </nav>
  );
}

function Accordion({
  label,
  open,
  onOpen,
  children,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium tracking-wide text-muted-foreground uppercase hover:bg-accent md:text-xs"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        {label}
      </button>
      {open ? children : null}
    </div>
  );
}

function Chapter({
  label,
  pages,
  onNavigate,
}: {
  label: string;
  pages: DocsNavPage[];
  onNavigate?: () => void;
}) {
  if (pages.length === 0) return null;
  return (
    <div className="grid gap-1">
      <p className="px-2.5 pt-2 text-base font-medium md:text-sm">{label}</p>
      {pages.map((page) => (
        <DocLink key={page.slug} to={`/docs/${page.slug}`} nested onNavigate={onNavigate}>
          {page.title}
        </DocLink>
      ))}
    </div>
  );
}

function DocLink({
  to,
  nested = false,
  onNavigate,
  children,
}: {
  to: string;
  nested?: boolean;
  onNavigate?: () => void;
  children: string;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "rounded-md text-foreground hover:bg-accent",
          nested ? "py-1.5 pr-2.5 pl-5 text-sm md:text-xs" : "px-2.5 py-1.5 text-base md:text-sm",
          isActive && "bg-secondary",
        )
      }
    >
      {children}
    </NavLink>
  );
}

function readStoredSection(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(docsNavStorageKey);
  } catch {
    return null;
  }
}

function writeStoredSection(section: DocsSection) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(docsNavStorageKey, section);
  } catch {
    // The open section still applies for this visit when storage is blocked.
  }
}
