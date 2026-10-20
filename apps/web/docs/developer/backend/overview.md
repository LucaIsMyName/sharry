# Backend overview

One Node.js process serves the dashboard, the API, and public redirects. The entry point is `apps/api/src/index.ts`. It loads the environment, runs migrations, provisions the initial administrator when none exists, and listens on `APP_PORT`.

`apps/api/src/server.ts` builds the Fastify app. Routes live beside it:

- `auth.ts` for sessions, passwords, and two-factor authentication
- `links.ts`, `tracking.ts`, `analytics.ts`, and `qr.ts` for the product
- `admin.ts` for users, settings, audit, exports, and API keys
- `redirect.ts` for short links that are not under `/api`

PostgreSQL is accessed through Drizzle in `packages/database`. Request bodies are checked with Zod schemas in `packages/shared`.
