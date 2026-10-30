# Extending the dashboard

A signed-in page is a component under `apps/web/src/pages`, a lazy route in `apps/web/src/router.tsx`, and a nav item in `apps/web/src/components/shell.tsx`. A new block in the page builder is a shared definition, described in [Page builder blocks](/docs/developer/frontend/page-blocks). Calling a route from the page uses `api()` from [API client](/docs/developer/frontend/api-client).

## Page component

`ReportsPage` is a small screen. The shell already provides the session, the sidebar, and the browser title from `handle.title`.

```ts
export function ReportsPage() {
  return <h1 className="font-heading text-2xl font-medium tracking-tight">Reports</h1>;
}
```

Put the file at `apps/web/src/pages/reports.tsx`. Strings a person sees go through `t("English sentence")`, with the German line in `apps/web/src/i18n/de.ts`.

## Route

`lazyPage` loads the screen when the path is opened. `handle.title` is the name in the top bar and in the browser title. The route sits under the shell so the session loader runs. An administrator-only page uses `adminLoader` instead of the shell's loader.

```ts
const ReportsPage = lazyPage(() =>
  import("./pages/reports.tsx").then((module) => module.ReportsPage),
);

{ path: "reports", handle: { title: "Reports" }, element: <Routed><ReportsPage /></Routed> }
```

Register that object in the shell's `children` in `apps/web/src/router.tsx`, next to `media` and `analytics`.

## Navigation

Add an item in `Navigation` in `apps/web/src/components/shell.tsx`. `Item` is the same link the other entries use.

```ts
<Item to="/reports" icon={<ChartColumn size={18} />}>
  {t("Reports")}
</Item>
```

## Reserved public names

A path that is a single public segment, such as `/reports`, can collide with a short-link prefix or a slug. Add the segment to both lists in `packages/shared/src/prefix.ts`, and update the prefix tests.

```ts
export const RESERVED_PREFIXES = [
  "api",
  "reports",
] as const;

export const RESERVED_SLUGS = [
  "api",
  "reports",
];
```

A path with more than one segment, such as `/links/new`, is already under a reserved prefix and does not need a new entry.
