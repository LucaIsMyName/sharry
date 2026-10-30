export type DocPage = {
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
  "user/media",
  "user/pages",
  "user/analytics",
  "user/api-keys",
  "user/settings",
  "user/chat",
  "user/search",
  "user/domains",
  "user/server",
  "user/users",
  "developer/backend/overview",
  "developer/backend/development",
  "developer/backend/deploy",
  "developer/backend/auth",
  "developer/backend/redirects",
  "developer/backend/extending",
  "developer/frontend/overview",
  "developer/frontend/routing",
  "developer/frontend/api-client",
  "developer/frontend/page-blocks",
  "developer/frontend/extending",
];

const rawPages = import.meta.glob("../../docs/*/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

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

export function docsForLocale(locale: string): DocPage[] {
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

export function searchableDocs(
  locale: string,
): { slug: string; title: string; text: string }[] {
  return docsForLocale(locale).map((page) => ({
    slug: page.slug,
    title: page.title,
    text: page.markdown,
  }));
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
