# Local development

Sharry runs on Node.js 22.23.4 or newer. It does not use Docker. One command starts the API, the dashboard, and a local PostgreSQL when you do not already have one listening.

## First setup

From the repository root:

```bash
cp .env.development.example .env.development
npm install
npm run db:migrate
npm run dev
```

Fill in `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and the initial administrator password in `.env.development` before the first start. `SESSION_SECRET` and `ENCRYPTION_KEY` must each be at least 32 characters. The initial password must be at least 12 characters.

`npm run dev`, `npm run db:migrate`, `npm run setup`, `npm run create-admin`, and `npm run backup` read `.env.development` on this machine. If that file is missing and a legacy `.env` is present, those scripts use `.env` instead. `SHARRY_ENV_FILE` points a command at a different file. Keep both environment files out of Git. The example files contain placeholders only.

## What `npm run dev` starts

The script starts an embedded PostgreSQL, then runs the API and the dashboard together.

The embedded server is created only when `DATABASE_URL` points at `127.0.0.1`, `localhost`, or `::1`, and nothing is already accepting connections on that port. Its data stays in `data/pg-dev`. Closing the terminal stops it. The next `npm run dev` starts it again and keeps the same data. If the port is already open, Sharry uses that database and does not start another one. A `DATABASE_URL` on another host is left alone.

The API is `tsx watch apps/api/src/index.ts`. It listens on `APP_PORT`, which defaults to 3000, and reloads when API files change. The dashboard is Vite on `http://127.0.0.1:5173`. Vite proxies `/api` and `/health` to port 3000, and it also proxies paths that start with `/s/` so the default short-link prefix can be opened from the dashboard origin during development.

On startup the API loads the environment, runs migrations, creates the initial administrator when none exists, deletes expired click events and password-reset tokens, and then listens. The same purge runs again every hour.

## Public addresses in development

`APP_URL` is the origin of password-reset links: `{APP_URL}/login/reset?token=...`.

`SHORT_URL_BASE` is the origin of short links shown in the dashboard, in link CSV export, and in newly encoded QR codes. In development it should be the API origin, `http://127.0.0.1:3000`, so every prefix resolves. Vite only proxies the `/s/` prefix. A prefix you change in Settings is served by the API, not by a new Vite rule.

`SHORT_URL_PREFIX` is the default public path segment, such as `/s`. Settings can change the live prefix after installation. The environment value is the fallback when no prefix has been saved.

## The first administrator

On first startup Sharry creates the initial administrator from `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` when no administrator exists. The password is hashed with Argon2id and is never printed. That account must change the password before the dashboard opens. Later startups do not reset the password, and a deleted administrator is not recreated.

`npm run create-admin` creates another administrator from the same three variables. It runs migrations first. If the username or email already exists, it stops and does not change the password. The new account must change that password at first sign-in.

`npm run setup` is the same first-administrator step without starting the dashboard.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Embedded Postgres when needed, API on port 3000, dashboard on port 5173 |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:generate` | Write a new migration from the schema |
| `npm test` | Vitest. Database tests start a local PostgreSQL and do not use PGlite. Also writes the last-run CSV |
| `npm run typecheck` | Typecheck shared, database, API, web, and the repo scripts |
| `npm run build` | Build the dashboard, then the API |
| `npm run backup` | Custom-format `pg_dump` using `DATABASE_URL`, without putting the URL on the command line |
| `npm start` | Run the built API: `node apps/api/dist/index.js` |

`npm test` writes `apps/web/public/test-results.csv` when the run finishes, including a run that has failures. The file has one row per test file: passed, failed, skipped, and duration. It is not committed. The dashboard shows that file under Docs, in Developer, as Tests → Last run (`/docs/developer/tests`). Vite serves it from `public` during `npm run dev`, and a dashboard build copies whatever file is there at build time. `npm run deploy` runs the full suite before it uploads, so the production build includes that CSV and the server serves it at `/test-results.csv` to a signed-in session.

QR center images are written under `QR_DATA_DIR` (default `data/qr-logos`). Account photos are written under `AVATAR_DATA_DIR` (default `data/avatars`). Both live inside `data/`, which `npm run dev` does not delete.

`REDIS_URL` is reserved and unused. Country and region on click events stay empty until `GEOIP_DB_PATH` points at a local MaxMind database.
