# Backend overview

One Node.js process serves the dashboard, the API, and public redirects. The entry point is `apps/api/src/index.ts`. It loads the environment, runs migrations, provisions the initial administrator when none exists, deletes expired click events, reset tokens, and sessions, and listens on `APP_PORT`.

The same purge runs every hour. `SIGINT` and `SIGTERM` close the HTTP server and the database pool.

## Process layout

`apps/api/src/server.ts` builds the Fastify app. Routes live beside it:

- `auth.ts` for sessions, passwords, and two-factor authentication
- `links.ts`, `tracking.ts`, `analytics.ts`, and `qr.ts` for the product
- `admin.ts` for users, settings, audit, exports, and API keys
- `system.ts` for the administrator server snapshot
- `redirect.ts` for short links that are not under `/api`

PostgreSQL is accessed through Drizzle in `packages/database`. Schema changes go through `npm run db:generate` and `npm run db:migrate`. Request bodies are checked with Zod schemas in `packages/shared`.

In production the same process serves `apps/web/dist`. Hashed files are under `/assets/`. Any other `GET` or `HEAD` that is not a short link returns the dashboard `index.html`. `POST` to an unknown path, and any unknown `/api` path, returns 404. In development, Vite serves the dashboard and this process serves only the API, health check, and short links. Production sends a Content-Security-Policy that allows `blob:` connections so a QR center image can be embedded.

## Request path

A request under `/api` can authenticate with the `sharry_session` cookie or, outside `/api/auth`, with `Authorization: Bearer`. Account routes reject a bearer token before the handler runs. API-key calls are limited to about 120 per minute per key.

State-changing `/api` requests that include an `Origin` header must match `APP_URL` or `SHORT_URL_BASE`. `GET`, `HEAD`, and `OPTIONS` skip that check. Outside production, an origin on `localhost` or `127.0.0.1` is allowed as well.

`GET /health` runs `select 1` and returns `{ ok: true }`. It does not require a session. Deploy polls it after each restart.

The body limit is 1 MB. Uploaded images are a separate limit of 512 KB and one file.

## Workspaces

| Path | Role |
| --- | --- |
| `apps/api` | Fastify API, redirects, and production static files |
| `apps/web` | React dashboard |
| `packages/database` | Drizzle schema and migrations |
| `packages/shared` | Zod schemas, prefix and slug rules, environment parsing, QR style |
| `scripts` | Dev server, migrate, deploy, backup, create-admin |
| `deploy` | systemd unit and Caddy example |

Local development and production deploy are documented on the next pages.
