# Frontend overview

The dashboard is a React app in `apps/web`, built with Vite, TypeScript, and Tailwind. Production serves the compiled files from the same Node process as the API. In development, Vite runs on port 5173 and proxies `/api` and `/health` to port 3000. It also proxies `^/s/` so the default short-link prefix can be opened from the dashboard origin. Other prefixes are served only by the API.

`npm run build -w @sharry/web` writes `apps/web/dist`. The API serves `dist/assets` at `/assets/` and returns `dist/index.html` for dashboard routes. That static registration runs only when `NODE_ENV` is `production` and the assets directory exists.

Shared types and Zod schemas come from `@sharry/shared`. The UI components live in `apps/web/src/components/ui`. Pages live in `apps/web/src/pages`. The shell, navigation, and sign-out are `apps/web/src/components/shell.tsx`. Overview, Links, Campaigns, and Analytics are the main menu. Docs and the administrator pages sit below a divider, in a smaller type size. Each route sets the browser title to `Page · Sharry`. The dashboard sends `noindex, nofollow` so search engines do not index it.

User and developer docs are markdown files in `apps/web/docs`. Vite loads them with `import.meta.glob` as raw text. The API reference is generated from the JSDoc block above each route in `apps/api/src` by `apps/web/api-docs-plugin.ts` while Vite builds or serves the app.
