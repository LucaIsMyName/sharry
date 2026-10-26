# Sharry

Sharry is a self-hosted link shortener. One Node.js process serves the dashboard, the JSON API, and public redirects. PostgreSQL stores users, links, campaigns, QR styles, click events, sessions, and settings. There is no Docker image and no separate frontend host in production.

People create short links, attach UTM parameters, group tracked copies in campaigns, design QR codes, and read click analytics. Administrators add accounts, API keys, redirect domains, and mail settings. Registration is closed. Two-factor authentication stays off until someone turns it on from Account, or an administrator requires it in Settings.

Signed-in users can also open `/docs` for the same product and developer guides that live in this repository as markdown. This file is the map of the whole project: what it does, how to run it locally, how a change fits into the code, and how a release reaches a server.

## What the product does

| Area | Behavior |
| --- | --- |
| Links | Random or custom slugs, editable destinations, optional expiry, disable, password, and redirect type `301`, `302`, `307`, or `308` |
| UTM | `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, and `utm_content` are stored on the link and merged onto the destination at redirect time |
| Campaigns | A named group of variants. A variant belongs to one link and can override that link’s UTM fields. It is selected with `?v=<variant id>` |
| QR codes | Encode the short URL plus a `qr` id, so a destination change does not require a new code. Styles, colors, and a center image are saved. Downloads are PNG, JPEG, and SVG |
| Analytics | Clicks, unique visitors, bots, a daily series, and breakdowns for referrer, country, browser, operating system, device, bots, and each UTM field |
| Domains | The deployment host is the default. Administrators can add more hostnames after a DNS TXT check. Each link can pick a verified domain |
| Access | Two roles, `admin` and `user`. API keys act as the user they are bound to. Account routes accept only the session cookie |
| Languages | English and German. The signed-in account stores the choice |

Slugs are unique without regard to case. A taken slug returns: "This short URL is already in use. Please choose a different slug."

A campaign does not change the destination and it is not an A/B test. Blank variant fields keep the link’s UTM values. A variant id from another link is ignored.

QR codes and password-reset links use the public origins from the environment. Settings can change the path prefix (`/s` by default). The prefix is not stored on each link, so a prefix change updates every displayed short URL on the next read. Printed QR codes still contain the path that was encoded. Enable legacy prefixes in Settings to keep resolving the previous path. That change asks for confirmation.

Every redirect sends `Cache-Control: no-store`, including `301` and `308`. A correct link password continues with `303`. Destination edits keep the slug and the click history. Existing query parameters that are not being replaced, and the URL fragment, are kept. Replacing a UTM value that is already on the destination shows a warning first.

Sharry does not store raw IP addresses. The anonymous visitor id is a daily HMAC of a truncated address and the user agent. Referrers are stored as hostnames. Country and region are filled only when `GEOIP_DB_PATH` points at a local MaxMind database. `analytics_retention_days` in Settings deletes older click events on startup and then every hour. `0` keeps them.

## How it is put together

```text
Browser
  │
  ├─ development: Vite on :5173  ──proxy /api, /health, /s/──►  API on :3000
  │
  └─ production:  Caddy :443  ──►  one Node process on :3000
                                      ├─ /api/*          JSON
                                      ├─ /health         process + database
                                      ├─ /<prefix>/<slug> redirect
                                      └─ everything else  dashboard HTML
                                         (deployment host only)
```

npm workspaces:

| Path | Package | Owns |
| --- | --- | --- |
| `apps/api` | `@sharry/api` | Fastify, auth, links, redirects, analytics, production static files |
| `apps/web` | `@sharry/web` | React dashboard |
| `packages/database` | `@sharry/database` | Drizzle schema, client, SQL migrations |
| `packages/shared` | `@sharry/shared` | Zod schemas, environment parsing, prefix, slug, domain, UTM, QR, and brand helpers |
| `scripts` | — | Dev server, migrate, setup, create-admin, backup, deploy |
| `deploy` | — | systemd unit and a Caddy example |

TypeScript throughout. The API and the dashboard import `@sharry/shared` and `@sharry/database` from source. Production builds the dashboard to `apps/web/dist`, then bundles the API with tsup. `npm start` runs `node apps/api/dist/index.js`.

### Startup

`apps/api/src/index.ts` is the process entry.

1. Load `.env.development` (or `SHARRY_ENV_FILE`, or a legacy `.env` when the development file is absent).
2. Parse the environment with Zod. Invalid configuration prints the field errors and exits.
3. Open PostgreSQL and apply Drizzle migrations.
4. Create the initial administrator when none exists.
5. Delete expired click events, password-reset tokens, and sessions. Repeat that purge every hour.
6. Listen on `APP_HOST`:`APP_PORT`. `SIGINT` and `SIGTERM` close the HTTP server and the pool.

`apps/api/src/server.ts` builds the Fastify app. Routes live beside it:

| File | Responsibility |
| --- | --- |
| `auth.ts` | Sessions, passwords, two-factor authentication, locale, avatar |
| `links.ts` | Link CRUD |
| `tracking.ts` | Campaigns and variants |
| `analytics.ts` | Click queries and retention |
| `qr.ts` | QR records and center images |
| `admin.ts` | Users, settings, audit, CSV export |
| `api-keys.ts` | Bearer tokens |
| `redirect-domains.ts` | Custom hostnames and the Caddy certificate allow-list |
| `system.ts` | Administrator server snapshot |
| `redirect.ts` | Public short links |
| `mail.ts` | SMTP |
| `settings-store.ts` | Key/value settings cached in memory |
| `provision.ts` | First administrator |

Request bodies are checked with the Zod schemas in `packages/shared/src/schemas.ts`. The database shape is `packages/database/src/schema.ts`.

In production the same process serves `apps/web/dist`. Hashed files are under `/assets/`. Any other `GET` or `HEAD` that is not a short link returns `index.html` when the host is the deployment domain. A verified redirect domain serves short links only. Other paths on that host return 404, including the dashboard and `/api`. Unknown `/api` paths and a `POST` that is not a short link return 404.

In development, Vite serves the dashboard. This process serves the API, `/health`, and short links.

### Request checks

- The body limit is 1 MB. An uploaded image is a separate limit of 512 KB and one file.
- State-changing `/api` requests that include an `Origin` header must match `APP_URL` or `SHORT_URL_BASE`. `GET`, `HEAD`, and `OPTIONS` skip that check. Outside production, an origin on `localhost` or `127.0.0.1` is allowed as well.
- `/api/auth` rejects `Authorization: Bearer` before the handler runs. Other `/api` routes accept the session cookie or a bearer token.
- API-key calls are limited to about 120 per minute per key. Sign-in, password change, password reset, authenticator setup, the two-factor challenge, authenticator confirmation, turning two-factor authentication off, and recovery-code replacement are each limited to 10 attempts per minute. A forgotten-password address is mailed at most 5 times an hour. Further requests still return success and send nothing.
- Clicks are written after the response, from an `onResponse` hook. A paused, missing, or expired link does not record a click.
- Logs redact `cookie`, `authorization`, and `set-cookie`.
- `GET /health` runs `select 1` and returns `{ ok: true }`. It does not require a session.

### Brand name

`APP_NAME` is the product name in the sidebar, the browser title, and the sign-in page. A blank value stays `Sharry`. The slug of that name (`packages/shared/src/brand.ts`) prefixes the session cookie, the link-unlock cookie, API key secrets, CSV exports, backup file names, and the domain TXT record. `Sharry` stays `sharry_`. `My Brand` becomes `my-brand_session` and secrets that start with `my-brand_`.

`GET /api/brand` is public and returns `{ appName }` so the sign-in page can use the same name before a session exists.

## Repository layout

```text
sharry/
├── apps/
│   ├── api/
│   │   ├── src/                 # Fastify app and route modules
│   │   └── test/                # API tests against PostgreSQL
│   └── web/
│       ├── src/
│       │   ├── pages/           # One screen per area
│       │   ├── components/      # Shell, fields, and ui/
│       │   ├── i18n/            # t() and de.ts
│       │   ├── api.ts           # fetch wrapper and shared response types
│       │   └── router.tsx       # React Router
│       └── docs/
│           ├── en/              # English user and developer guides
│           └── de/              # German copies
├── packages/
│   ├── database/
│   │   ├── src/schema.ts
│   │   └── drizzle/             # Generated SQL migrations
│   └── shared/src/              # Schemas and pure helpers, each with *.test.ts
├── scripts/                     # tsx entry points used by npm scripts
├── deploy/
│   ├── systemd/sharry.service
│   └── Caddyfile.example
├── .env.development.example
├── .env.production.example
├── drizzle.config.ts
├── vitest.config.ts
└── package.json
```

## Requirements

- Node.js 22.23.4 or newer (`engines` in the root `package.json`)
- npm, which ships with that Node release
- A local PostgreSQL is optional. `npm run dev` and the test runner can start an embedded server when `DATABASE_URL` points at this machine and nothing is listening there

The app does not use Docker. A production install uses the server’s own PostgreSQL, Caddy, and systemd.

## Local setup

From the repository root:

```bash
cp .env.development.example .env.development
```

Edit `.env.development` before the first start:

- `DATABASE_URL` — the example uses `postgresql://sharry:sharry@127.0.0.1:54330/sharry`, which matches the embedded server
- `SESSION_SECRET` and `ENCRYPTION_KEY` — each at least 32 characters
- `INITIAL_ADMIN_PASSWORD` — at least 12 characters
- `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_EMAIL`
- `APP_URL=http://127.0.0.1:5173` — dashboard origin, used in password-reset links
- `SHORT_URL_BASE=http://127.0.0.1:3000` — API origin, used in displayed short links and new QR codes
- `SHORT_URL_PREFIX=/s`

Then:

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:5173`. Sign in with the initial administrator. The first session is a password-change session: choose a new password before the dashboard opens. The password is hashed with Argon2id and is never printed. Later startups do not reset it. A deleted administrator is not recreated after initialization.

`npm run create-admin` creates another administrator from the same three `INITIAL_ADMIN_*` variables. It runs migrations first. If the username or email already exists, it stops and does not change the password.

`npm run setup` runs the first-administrator step without starting the dashboard.

### What `npm run dev` starts

`scripts/dev.ts` starts an embedded PostgreSQL when `DATABASE_URL` points at `127.0.0.1`, `localhost`, or `::1` and nothing is already accepting connections on that port. Data stays in `data/pg-dev`. Closing the terminal stops that database. The next `npm run dev` starts it again and keeps the same data. If the port is already open, Sharry uses that database. A `DATABASE_URL` on another host is left alone.

It then runs two processes:

- `tsx watch apps/api/src/index.ts` on `APP_PORT` (3000). API file changes reload this process, which applies migrations again.
- Vite for `@sharry/web` on `http://127.0.0.1:5173`.

Vite proxies `/api` and `/health` to port 3000, and paths that start with `/s/`, so the default prefix can be opened from the dashboard origin. A prefix you change in Settings is served by the API. Vite does not grow a new proxy rule for it. Point `SHORT_URL_BASE` at the API origin so every prefix resolves.

QR center images go to `QR_DATA_DIR` (default `data/qr-logos`). Account photos go to `AVATAR_DATA_DIR` (default `data/avatars`). Both live under `data/`, which `npm run dev` does not delete. Keep `data/` out of Git.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Embedded Postgres when needed, API on port 3000, dashboard on port 5173 |
| `npm run db:generate` | Write a new SQL migration from `packages/database/src/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm test` | Vitest, once, across packages, apps, and scripts |
| `npm run typecheck` | Typecheck shared, database, API, web, and the repo scripts |
| `npm run build` | Build the dashboard, then the API |
| `npm start` | Run the built API |
| `npm run setup` | Migrations and the initial administrator, then exit |
| `npm run create-admin` | Another administrator from `INITIAL_ADMIN_*` |
| `npm run backup` | Custom-format `pg_dump` using `DATABASE_URL`, without putting the URL on the command line |
| `npm run deploy` | Run the test suite, then install or update a server from `.env.production` |

`npm run dev`, `npm run db:migrate`, `npm run setup`, `npm run create-admin`, and `npm run backup` read `.env.development`. If that file is missing and a legacy `.env` is present, they use `.env`. `SHARRY_ENV_FILE` points a command at a different file. `npm run deploy` reads `.env.production` only.

Run `npm test` and `npm run typecheck` before treating a change as finished. Database tests start a local PostgreSQL when one is not already installed. They use `DATABASE_URL` from that instance. PGlite is not used for migrations. Vitest runs files one at a time so those tests do not share one database port.

## Configuration

Keep `.env.development` and `.env.production` out of Git. The example files contain placeholders only.

`.env.production` holds the public hostname, the server address, the SSH user, and the SSH key path. The private key stays on the deploy machine. The file stores only its path. Deploy copies runtime values into `$DEPLOY_REMOTE_DIR/shared/.env`. Keys prefixed with `DEPLOY_` are never uploaded. `DOMAIN` stays in `.env.production`. `REDIS_URL` is reserved, unused, and not uploaded.

`npm run deploy` copies runtime variables when the server does not have them yet, and again when you pass `--sync-env`. An existing server environment is left untouched unless that flag is set.

When `APP_URL`, `SHORT_URL_BASE`, or `DEPLOY_HEALTHCHECK_URL` are empty, deploy uses `https://DOMAIN` and `https://DOMAIN/health`. When `SESSION_SECRET`, `ENCRYPTION_KEY`, or `DATABASE_URL` are empty, the first deploy generates them and writes them back into `.env.production`. Later deploys reuse those lines. If the server already has `shared/.env` and a secret is empty locally, deploy stops. Copy the existing values into `.env.production`. An empty value is not a request to replace them.

Replacing `ENCRYPTION_KEY` makes saved two-factor secrets and the SMTP password unreadable. `SESSION_SECRET` is the hash key for session tokens and API keys. Rotating it invalidates existing sessions and keys.

`APP_URL` and `SHORT_URL_BASE` are read from the environment on each process start. Settings cannot change them. A domain change means editing the server `.env` (or deploying with `--sync-env`) and restarting the service. CORS uses these two values. Redirects match the path, so a host that still reaches this process keeps working.

### Runtime variables

| Variable | Default | Role |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `APP_NAME` | `Sharry` | Product name. Its slug prefixes cookies, API keys, exports, backups, and the domain TXT name |
| `APP_URL` | `https://DOMAIN` when empty at deploy | Origin of password-reset links: `{APP_URL}/login/reset?token=...` |
| `APP_HOST` | `0.0.0.0` | Bind address. Local example uses `127.0.0.1` |
| `APP_PORT` | `3000` | Bind port. Caddy proxies to `127.0.0.1:3000` |
| `SHORT_URL_BASE` | `https://DOMAIN` when empty at deploy | Origin of short links in the dashboard, CSV export, and newly encoded QR codes |
| `SHORT_URL_PREFIX` | required, such as `/s` | Fallback prefix until Settings saves one. A single lowercase segment, not a reserved route |
| `DATABASE_URL` | generated on first deploy | PostgreSQL URL, with a password |
| `INITIAL_ADMIN_USERNAME` | optional | First administrator, 3–32 characters. Used only while no administrator exists |
| `INITIAL_ADMIN_EMAIL` | optional | First administrator email |
| `INITIAL_ADMIN_PASSWORD` | optional | 12–200 characters |
| `SESSION_SECRET` | generated, at least 32 characters | Session and API-key hashing |
| `ENCRYPTION_KEY` | generated, at least 32 characters | Two-factor secrets and the saved SMTP password |
| `OTP_ISSUER` | `Sharry` | Name shown in authenticator apps |
| `SMTP_HOST` | empty | Fallback mail host until Settings saves one |
| `SMTP_PORT` | `587` | Fallback mail port |
| `SMTP_USER` | empty | Fallback mail username |
| `SMTP_PASSWORD` | empty | Fallback mail password |
| `EMAIL_FROM` | empty | Fallback From address |
| `GEOIP_DB_PATH` | empty | Local MaxMind database |
| `QR_DATA_DIR` | `data/qr-logos` | Center images. On the server this is under `shared/data` |
| `AVATAR_DATA_DIR` | `data/avatars` | Account photos |

### Deploy-only variables

| Variable | Default | Role |
| --- | --- | --- |
| `DOMAIN` | required for deploy | Public hostname, without a scheme or path, such as `share.example.com` |
| `DEPLOY_ENABLED` | `false` | Must be `true` or deploy stops |
| `DEPLOY_HOST` | required | Server hostname or address |
| `DEPLOY_PORT` | `22` | SSH port |
| `DEPLOY_USER` | required | `root`, or a user that can run `sudo -n` |
| `DEPLOY_SSH_KEY_PATH` | required | Absolute path to the private key |
| `DEPLOY_REMOTE_DIR` | `/var/www/sharry` | Release root. No `..` segments |
| `DEPLOY_BUILD_COMMAND` | `npm run build` | Only this value is accepted |
| `DEPLOY_RESTART_SERVICE` | `sharry` | systemd unit name |
| `DEPLOY_HEALTHCHECK_URL` | `https://DOMAIN/health` | Polled after restart |
| `DEPLOY_KNOWN_HOSTS_PATH` | `~/.ssh/known_hosts` | Host key file. The first deploy records an unknown host from `ssh-keyscan` and prints its fingerprint |

### Settings stored in the database

`app_settings` is a key/value table. `getSettings` in `apps/api/src/settings-store.ts` loads it once and caches it until a write calls `invalidateSettings`. Environment values for `APP_URL` and `SHORT_URL_BASE` win on each read. The prefix falls back to `SHORT_URL_PREFIX` until an administrator saves one.

| Key | Default | Who changes it |
| --- | --- | --- |
| `initialized` | set after the first administrator | Provisioning |
| `short_url_prefix` | `SHORT_URL_PREFIX` | Settings |
| `legacy_prefix_enabled`, `legacy_prefixes` | off, empty | Settings |
| `default_redirect_type` | `302` | Settings |
| `slug_length` | `5` | Settings. Random slugs use this length |
| `analytics_retention_days` | `365` | Settings. `0` keeps events |
| `session_ttl_hours` | `168` | Settings. Full sessions only |
| `mfa_required` | `false` | Settings |
| `link_sharing` | `false` | Settings. Users see each other's links. Off ignores the other three |
| `link_sharing_access` | `view` | Settings. `view` or `edit` for another user's link |
| `link_sharing_show_admin` | `false` | Settings. Users also see links owned by administrators |
| `link_sharing_edit_admin` | `false` | Settings. Users can change links owned by administrators |
| `default_qr_style` | shared default | Settings |
| `registration_policy` | `closed` | Fixed. There is no public sign-up |
| `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`, `email_from` | empty, port from the environment | Settings. The password is encrypted and is not shown again |
| `ai_provider`, `ai_model`, `ai_base_url`, `ai_api_key` | empty | Settings. The assistant key is encrypted and is not an environment variable. It is not shown again |
| `ai_enabled` | `true` | Settings. Pauses AI without clearing the provider, model, or key. Missing means on |

The assistant is configured in Settings, not in the environment. Providers include OpenAI, Anthropic, Google Gemini, Mistral, and an OpenAI-compatible endpoint. `/chat` uses the saved provider for every signed-in person and opens the last chat that person had open. Chats are private to the person who started them and stay readable when the provider is cleared. Before it asks for a clearer name, it searches the same records as the command palette, including a mistyped link name. A link, QR code, or campaign is created when that person submits the form in the chat. The link form can set a title and UTM source, medium, and campaign. A destination can suggest a free slug and the page title. Suggest UTM fills source, medium, and campaign from the page and an optional placement line, on the link form and in chat. A sentence on the link editor drafts routing rules. Overview, Analytics, and a link’s chart can summarize a date range in two or three sentences. On Analytics, that summary uses the same filters as the cards. A sentence on a campaign drafts variants. Add several opens a dialog on the links list and reviews up to 20 pasted URLs before creating them. A suggested slug is at most three words. A failed slug suggestion stays in the field tooltip. Nothing from those suggestions is stored until you save or create it. An analytics report uses a date slider from the link’s creation day through today, then shows bar charts for browser, operating system, device, country, bots, and UTM fields. The slider waits until the drag settles before a chart reloads. Analytics can filter by link, date, country, browser, operating system, and UTM. Open analytics and Export to PDF are buttons under that report. The PDF downloads as `sharry-analytics.pdf`. Settings can pause AI without clearing the provider, and an administrator sees token use for the last 30 days on the AI card.

Password-reset email uses the SMTP host, port, username, password, and from address saved in Settings. Until a host and from address are saved there, Sharry falls back to `SMTP_HOST` and `EMAIL_FROM` when those are set. Two-factor enrollment is refused until Settings has a saved mail server. The environment fallback is not enough to enroll. When `mfa_required` is on, an account cannot disable two-factor authentication.

## Accounts and sessions

There are two roles. Administrators manage every user, link, campaign, QR code, setting, audit event, domain, and API key. Standard users manage only their own links, campaigns, QR codes, and analytics. Settings can let them see or change other people's links. Campaigns stay private. Those checks run in the API. The dashboard hides admin pages, and the API rejects the same calls from a non-admin.

The session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production. The name comes from `APP_NAME` (`sharry_session` by default). The database stores a hash of the token, using `SESSION_SECRET`, not the token.

Sign-in creates one of four scopes. Dashboard loaders only allow `full`.

| Scope | When | Lifetime | Page |
| --- | --- | --- | --- |
| `password_change` | `mustChangePassword` is set | 30 minutes | `/account/password` |
| `mfa_challenge` | Two-factor authentication is already on | 5 minutes | `/login/mfa` |
| `mfa_enroll` | Settings require a code and this account has not enrolled | 30 minutes | `/account/mfa` |
| `full` | Password accepted and no further step | `session_ttl_hours` | the dashboard |

A missing user still runs a dummy Argon2 verify so the response time does not reveal whether the account exists. Logout deletes the current session and clears the cookie.

A password-reset email replaces any unused link for that account. The token expires after one hour and is marked used in the same transaction as the password change. Confirming an authenticator returns eight recovery codes. A recovery code can be accepted once. The authenticator secret is encrypted with `ENCRYPTION_KEY`.

### API keys

Administrators create a named key for a chosen user from API keys. The secret is shown once and is stored only as a hash. Send it as `Authorization: Bearer sharry_...` to `https://DOMAIN/api/...`. The prefix is the slug of `APP_NAME`.

The key can do what that user can. A standard user’s key sees only that user’s links, campaigns, QR codes, and analytics. An administrator’s key can also call admin routes. Sign-in, password changes, and two-factor routes under `/api/auth` accept only the session cookie. The dashboard client never sends a bearer token. It uses `credentials: 'include'`.

When Settings require two-factor authentication, a key works only after that user has enrolled. The stored secret does not change, and the key does not send a code. Until enrollment, the key is rejected. Creating a key for a user who has not enrolled is refused while that setting is on. Changing a password, or turning two-factor authentication on or off, signs out other browsers for that account. The browser that made the change stays signed in. API keys are separate from those sessions.

### Dashboard routes

`apps/web/src/router.tsx` uses React Router. Loaders call `/api/auth/me` and send people to the page that matches the session scope.

| Path | Who |
| --- | --- |
| `/login`, `/login/reset` | Anyone |
| `/login/mfa` | `mfa_challenge` |
| `/account/password` | `password_change` |
| `/account/mfa` | `mfa_enroll` |
| `/` | Overview |
| `/links`, `/links/new`, `/links/:id` | Links |
| `/campaigns`, `/campaigns/:id` | Campaigns |
| `/analytics` | Analytics |
| `/docs`, `/docs/*` | Guides. `/docs` redirects to `/docs/user/signing-in` |
| `/account` | Language, password, photo, two-factor authentication |
| `/admin/users` | Accounts |
| `/admin/api-keys` | API keys |
| `/admin/settings` | Prefix, link sharing, sessions, mail, CSV export |
| `/admin/domains` | Redirect domains |
| `/admin/server` | Host memory, disk, operating system, installed runtime |
| `/admin/audit` | Audit log |

Admin routes add a loader that allows only the admin role. Anyone else is sent to `/`. Each route sets the browser title to `Page · APP_NAME`. The dashboard sends `noindex, nofollow`.

Search is in the sidebar under Chat. Cmd+K on a Mac, and Ctrl+K elsewhere, opens the same palette. It lists the pages a person can open, then matches links, campaigns, chats, docs, and, for an administrator, users, domains, API keys, and audit rows.

## Short links and extra domains

Public URLs look like `https://share.example.com/s/summer-sale`. `tryShortLink` in `apps/api/src/redirect.ts` handles `GET`, `HEAD`, and `POST` paths with two segments. The first segment must be the active prefix or an enabled legacy prefix. Anything else falls through to the dashboard on the deployment host.

Reserved prefixes, in `packages/shared/src/prefix.ts`, are `api`, `health`, `assets`, `login`, `account`, `links`, `campaigns`, `analytics`, `admin`, and `docs`. Slugs reserve those names plus `favicon.ico` and `robots.txt`. A prefix is one lowercase segment: letters, digits, and hyphens.

Administrators add hostnames from Domains. Sharry stores a pending row and a TXT token. Verification looks up `_<slug>-challenge.<hostname>` (`_sharry-challenge.links.example.com` when the app name is Sharry) and accepts the domain only when that TXT value matches. The deployment hostname from `SHORT_URL_BASE` or `APP_URL` cannot be added. After verification, and once the hostname’s A record points at this server, Caddy issues a certificate the first time someone opens it. Sharry checks the TXT record again every hour. A temporary lookup failure leaves the domain verified. Two checks in a row with no matching record move it back to pending. Caddy asks `GET /internal/caddy/ask?domain=` first. That route returns 200 only for a verified hostname, and only when the client address is loopback. A request through the reverse proxy uses the visitor's address and returns 404.

`GET /api/redirect-domains` returns verified hostnames to every signed-in user so the link form can offer them. Creating or editing a link can store `redirectDomainId`. A missing, pending, or deleted domain falls back to `SHORT_URL_BASE`. The same slug still resolves on every host that reaches this process. The selected domain is the address shown in the dashboard, CSV export, and new QR codes.

## Data model

PostgreSQL tables in `packages/database/src/schema.ts`:

| Table | Holds |
| --- | --- |
| `users` | Username, email, Argon2 hash, role, locale, avatar path, two-factor secret, `must_change_password`, `is_active` |
| `sessions` | Hashed token, scope, expiry |
| `recovery_codes` | Hashed one-time codes |
| `password_reset_tokens` | Hashed reset tokens |
| `api_keys` | Name, hashed secret, prefix, owner, revocation |
| `links` | Slug, destination, title, status, expiry, optional password hash, optional redirect domain |
| `tracking_configs` | UTM fields, one row per link |
| `tracking_campaigns` | Campaign name, owned by a user |
| `tracking_variants` | Variant name, link, campaign, optional UTM overrides |
| `qr_codes` | Name, style JSON, optional variant, logo path on disk |
| `click_events` | Time, referrer host, country, region, browser, OS, device, bot flag, anonymous visitor id, UTM snapshot |
| `redirect_domains` | Hostname, pending or verified status, TXT token |
| `app_settings` | String values keyed by name |
| `audit_logs` | Actor, action, entity, JSON metadata |

Usernames and emails are unique case-insensitively. Deleting a user is restricted while they still own links or campaigns. Deleting a link cascades its tracking row, variants, QR codes, and clicks.

Center images and avatars are files, not bytea. On a server those directories live under `shared/data`, which each release links as `data`, so a new release keeps the files.

## How to extend it

Put the change in the layer that already owns that behavior. Keep the change small enough that its tests describe one outcome. A feature usually touches three places: a pure rule in `packages/shared`, persistence and the HTTP handler in `apps/api`, and a page in `apps/web`.

### A new field on an existing record

1. Add the column in `packages/database/src/schema.ts`.
2. Run `npm run db:generate`. Review the SQL under `packages/database/drizzle/` before applying it. Commit the SQL and the journal update with the schema change.
3. Run `npm run db:migrate` locally.
4. Extend the Zod schema in `packages/shared/src/schemas.ts` and add a case to the matching `*.test.ts`.
5. Read and write the column in the route module that already owns that table.
6. Show it in the page that already edits that record. Call `t("English sentence")` for every new string. Add the German line in `apps/web/src/i18n/de.ts`. A missing line stays English.
7. Cover the API behavior in `apps/api/test/`, including the failure the user can hit (duplicate, forbidden, invalid).

### A new API route

Add the handler next to the module that owns the resource, and register it from `buildApp` if it is a new module. Follow the existing helpers: `requireUser` or `requireAdmin` from `auth.ts`, `AppError` from `support.ts` for an expected failure, and `writeAudit` when an administrator changes shared state.

Document the route with a JSDoc block directly above the `app.get` / `app.post` call. Vite’s `apps/web/api-docs-plugin.ts` turns those blocks into the in-app API reference. The extractor only sees calls shaped like `app.get('/api/...')` in files directly under `apps/api/src`.

```ts
/**
 * List the widgets the signed-in user can see.
 * @route GET /api/widgets
 * @tag Links
 * @auth session
 * @response 200 { widgets }
 */
```

Tags in use are `Links`, `Campaigns`, `Analytics`, `QR codes`, `Account`, `Admin`, `Settings`, `Domains`, and `Search`. Add a new tag to `TAG_ORDER` in `scripts/generate-api-docs.ts` if the reference should group it.

The dashboard calls the route through `api()` in `apps/web/src/api.ts`. Put shared response types next to that function when more than one page needs them. A field error is a tooltip beside the field. A save, copy, or failed load is a toast. File uploads use `FormData` so the browser sets the multipart boundary.

External callers use a bearer token. If the route must stay cookie-only, put it under `/api/auth` or teach `isAccountPath` in `api-keys.ts` to reject keys for it.

### A new page

1. Add the screen under `apps/web/src/pages/`.
2. Register the path in `apps/web/src/router.tsx` with a `handle.title`. Put it under the shell so the session loader runs. Admin-only pages use `adminLoader`.
3. Add a nav item in `apps/web/src/components/shell.tsx`.
4. If the path is a single public segment, add that segment to `RESERVED_PREFIXES` and `RESERVED_SLUGS` so a short-link prefix cannot take it. Update the prefix tests.

UI primitives live in `apps/web/src/components/ui`. The path alias `@/` points at `apps/web/src`. Tailwind 4 is wired through the Vite plugin. Production CSP allows `blob:` so a QR center image can be embedded.

### A new setting

Add the key to `AppSettings`, `defaultSettings`, `settingsToRows`, and the parser in `settings-store.ts`. Expose it on the existing settings routes in `admin.ts` and on the Settings page. Call `invalidateSettings()` after the write so the next request sees it. Do not put secrets in the React bundle. The SMTP password is the pattern: encrypt with `ENCRYPTION_KEY`, never return the plaintext.

`APP_URL` and `SHORT_URL_BASE` stay environment variables. A setting that tried to override them would disagree with CORS, reset links, and Caddy.

### A new language

1. Add the code to `locales` in `packages/shared/src/schemas.ts`.
2. Add `apps/web/src/i18n/<code>.ts` and register it beside German in `apps/web/src/i18n`.
3. Copy `apps/web/docs/en` to `apps/web/docs/<code>` and translate the pages.

No migration is required. `users.locale` is plain text, and the API rejects a code that is not in the list. The English sentence passed to `t()` is the key.

### Docs

User and developer guides are markdown under `apps/web/docs/en` and `apps/web/docs/de`. Vite loads them with `import.meta.glob`. The order is the `pageOrder` array in `apps/web/src/pages/docs-pages.ts`. A file that is not in that array still appears, at the end. Update both languages when a behavior change belongs in the guides. A fenced `mermaid` block renders as a diagram. The API reference itself is generated. Do not hand-write it.

### Tests

- Shared helpers: `packages/shared/src/<name>.test.ts`, no database.
- API routes: `apps/api/test/<area>.test.ts`, using the helpers that boot the real app and database.
- Scripts: `scripts/<name>.test.ts`.
- UI behavior: `apps/web/src/**/*.test.tsx` when a component has logic worth asserting.

Test the behavior a caller can observe, including the failure path. `npm test` is the check that must pass.

### Conventions that keep a change reviewable

- One behavior per change. Do not fold a drive-by refactor into a feature.
- Validate at the edge that already validates that input. Shared Zod schemas for bodies, `parseRuntimeEnv` for the environment, route checks for authorization.
- Expected errors use `AppError` and return `{ error, code }`. Unexpected errors become a generic 500 and a log line.
- Do not log passwords, session tokens, API key secrets, or encryption keys.
- Do not print those values from deploy or backup.

## Deploy on your own server

Two things stay outside the script:

- The server is already running Ubuntu or Debian, and it accepts SSH with the key in `.env.production`. `DEPLOY_USER` is `root`, or a user that can run `sudo -n`.
- The domain’s A record points at the server’s IPv4 address. The provider’s firewall allows ports 22, 80, and 443. A cloud firewall is not the machine’s firewall, so the script cannot open it.

`npm run deploy` installs the rest. Caddy requests and renews the certificate for `DOMAIN` because the site name is a hostname and ports 80 and 443 reach the server. Sharry does not call a certificate API. The Caddyfile also allows on-demand certificates for redirect domains an administrator has verified.

### 1. Fill in `.env.production`

On the machine you deploy from:

```bash
cp .env.production.example .env.production
```

Set:

- `DOMAIN`, for example `share.example.com`
- `DEPLOY_ENABLED=true`
- `DEPLOY_HOST` and `DEPLOY_USER`
- `DEPLOY_SSH_KEY_PATH` as an absolute path to the private key
- `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD`

Leave `APP_URL`, `SHORT_URL_BASE`, `DEPLOY_HEALTHCHECK_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` empty unless you already have values to keep. The initial password is used only the first time the database has no administrator, must be at least 12 characters, and the first sign-in asks for a new one.

If the host is not already in `known_hosts` (or in `DEPLOY_KNOWN_HOSTS_PATH`), the first deploy records the key and prints its fingerprint.

### 2. Deploy

```bash
npm install
npm run deploy
```

`npm run deploy` runs the full test suite on this machine before it connects. A failing suite stops the deploy, and nothing is uploaded. The suite writes `apps/web/public/test-results.csv`, the archive includes it, and production serves it at `/test-results.csv` to a signed-in session.

The first deploy writes `$DEPLOY_REMOTE_DIR/shared/.env` with mode `0600`. A later deploy keeps that file. Pass `--sync-env` when the runtime values should be copied again.

On a server that is already in use, each step is safe to repeat. Node.js 22.23.4 or newer stays installed. Supported CPUs are x86_64 and arm64. An existing PostgreSQL cluster is left as it is. An existing database role or database is not dropped, and its password is not changed. If the `sharry` role already exists and `DATABASE_URL` is empty, deploy stops and asks you to set the current connection string. A Caddy site that already names `DOMAIN` is left in place. A Caddyfile that still has the retired `interval` or `burst` on-demand options is rewritten so Caddy can start.

The script then does the following, in order:

1. Checks `/etc/os-release` and stops unless the ID is `ubuntu` or `debian`.
2. Installs the latest Node.js 22 release when `/usr/bin/node` is missing or older than 22.23.4.
3. Installs PostgreSQL when `psql` or `pg_dump` is missing, and starts it.
4. Creates the `sharry` system user, database role, and database when they are missing.
5. Installs Caddy when it is missing. When `DOMAIN` has no site yet, adds a site that proxies to `127.0.0.1:3000`, including the on-demand ask URL, and reloads Caddy.
6. When `ufw` is already enabled, allows ports 80 and 443. It does not enable `ufw` when it is off.
7. Packs the repo, excluding `.git`, `node_modules`, the local environment files, and `data`, and uploads it to `$DEPLOY_REMOTE_DIR/releases/<timestamp>`. The test-results CSV from the suite that just ran is part of that archive.
8. Links `$DEPLOY_REMOTE_DIR/shared/data` to `data` inside the release, so QR images and avatars survive the next release.
9. When free memory plus free swap is below 2.5 GB, adds a 2 GB swap file at `/swapfile`, then runs `npm ci` and `npm run build` on the server. The build gets a 2 GB JavaScript heap so it can use that swap. If the build is still killed for lack of memory, free disk space for swap and run deploy again.
10. Writes `shared/.env` on the first install, and again when `--sync-env` is set.
11. Runs `npm run backup`, writing a custom-format dump to `$DEPLOY_REMOTE_DIR/backups`.
12. Runs migrations against that server environment.
13. Records the previous `current` target in `previous-release`.
14. Installs `deploy/systemd/sharry.service` with the remote directory filled in.
15. Points `current` at the new release, reloads systemd, enables the service, and restarts it.
16. Requests `https://DOMAIN/health` up to 30 times, once a second. When that fails and a previous release exists, deploy points `current` back at it, restarts, and exits with an error. Old releases are deleted only after the health check passes, and the five newest are kept.

Secrets are not printed. The service listens on `APP_PORT` (3000 by default) as the `sharry` user. The unit file uses `WorkingDirectory=$DEPLOY_REMOTE_DIR/current` and `ExecStart=/usr/bin/node apps/api/dist/index.js`. It restarts on failure, reads `shared/.env`, and may write only under `shared/data` and the current release’s `data` link.

Sign in with the initial administrator and choose a new password. Mail and the two-factor requirement are configured in Settings after that. Administrators can then add redirect domains. Each one is checked with the TXT record described above. After it is verified, and its A record points at this server, Caddy issues a certificate for that hostname the first time someone opens it. People then choose that domain when they create a link. The deployment domain stays the default.

### Server directories

```text
/var/www/sharry/
├── current -> releases/<timestamp>
├── previous-release          # path of the release before this one
├── releases/<timestamp>/     # unpacked repo, node_modules, apps/web/dist, apps/api/dist
├── shared/
│   ├── .env                  # runtime only, mode 0600
│   └── data/                 # QR images and avatars, linked into each release as data/
└── backups/                  # pg_dump custom-format files
```

### Backup

`npm run backup` writes a custom-format `pg_dump` using `DATABASE_URL` without putting the URL on the command line. Deploy runs this before migrations. Schedule it with cron on the server as well if you want copies between deploys. The file name includes the brand slug and a timestamp.

### Rollback

A failed health check restores the previous release and restarts the service when `previous-release` is set. To roll back by hand:

1. Point `current` at the previous release directory recorded in `previous-release`.
2. Restart the systemd service (`sharry` unless `DEPLOY_RESTART_SERVICE` says otherwise).
3. If the migration was destructive, restore the dump from `$DEPLOY_REMOTE_DIR/backups` with `pg_restore`.

### Health

`GET /health` checks the process and the database. Deploy polls `https://DOMAIN/health`. The same path is proxied by Vite in development, so `curl http://127.0.0.1:5173/health` and `curl http://127.0.0.1:3000/health` both reach it while `npm run dev` is running.

## Where to read next

The in-app guides under `apps/web/docs/en` are the longer form of the product and of the API. Start with:

- `user/signing-in.md`, `user/links.md`, `user/campaigns.md`, `user/qr-codes.md`, `user/analytics.md`, `user/search.md` for day-to-day use
- `user/domains.md`, `user/api-keys.md`, `user/settings.md`, `user/users.md`, `user/server.md` for administration
- `developer/backend/overview.md`, `development.md`, `auth.md`, `redirects.md`, `deploy.md` for the server
- `developer/frontend/overview.md`, `routing.md`, `api-client.md` for the dashboard

German copies live in `apps/web/docs/de` with the same paths. You can read the files in the repository before the app is running. The generated API reference appears at `/docs/api` once the dashboard is serving.
