# Frontend overview

The dashboard is a React app in `apps/web`, built with Vite, TypeScript, and Tailwind. Production serves the compiled files from the same Node process as the API. In development, Vite runs on port 5173 and proxies `/api` and `/health` to port 3000. It also proxies `^/s/` so the default short-link prefix can be opened from the dashboard origin. Other prefixes are served only by the API.

`npm run build -w @sharry/web` writes `apps/web/dist`. The API serves `dist/assets` at `/assets/` and returns `dist/index.html` for dashboard routes. That static registration runs only when `NODE_ENV` is `production` and the assets directory exists.

Shared types and Zod schemas come from `@sharry/shared`. The UI components live in `apps/web/src/components/ui`. Pages live in `apps/web/src/pages`. The shell, navigation, and sign-out are `apps/web/src/components/shell.tsx`. On a small screen the top bar is the menu. The page heading stays in the page. The current item in the sidebar has a primary edge, and appearance is one button that cycles light, dark, and system. A page that is still loading shows a placeholder instead of an empty list. Chat fills the main area: the transcript scrolls on its own, and the message box stays at the bottom of that column. A result that belongs to one field is a tooltip on an icon beside that field’s label. Closing that tooltip keeps it closed when you return to the page. A save, copy, or failed load is a toast at the bottom right that leaves after a few seconds. Overview, Links, Campaigns, and Analytics are the main menu. Docs and the administrator pages sit below a divider, in a smaller type size. Each route sets the browser title to `Page · APP_NAME`. `APP_NAME` defaults to `Sharry`. The dashboard sends `noindex, nofollow` so search engines do not index it.

User and developer docs are markdown files in `apps/web/docs/<locale>`. English lives in `apps/web/docs/en` and German in `apps/web/docs/de`. Vite loads them with `import.meta.glob` as raw text and shows the folder that matches the active language, falling back to English when a page is missing. The API reference is generated from the JSDoc block above each route in `apps/api/src` by `apps/web/api-docs-plugin.ts` while Vite builds or serves the app. Those English strings are translated in the browser with `t()`.

## Languages

The dashboard calls `t("English sentence")` from `apps/web/src/i18n`. The English sentence is the key. A missing translation stays in English. German strings live in `apps/web/src/i18n/de.ts`. The signed-in account stores `users.locale`. Account saves it with `PATCH /api/auth/locale`. The allowed codes are `locales` in `@sharry/shared`.

To add a language:

1. Add its code to `locales` in `packages/shared/src/schemas.ts`.
2. Add `apps/web/src/i18n/<code>.ts` and register it next to German.
3. Copy `apps/web/docs/en` to `apps/web/docs/<code>` and translate the pages.

No database migration is required. The column is plain text, and the API rejects a code that is not in the list.
