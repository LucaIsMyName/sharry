# Sharry

Sharry is a self-hosted link shortener. One Node.js process serves the dashboard, the API, and public redirects. PostgreSQL stores links, users, click events, and settings such as the active URL prefix.

People create short links, attach UTM parameters, group tracked copies in campaigns, design QR codes, and read click analytics. Registration is closed. Administrators create accounts. New accounts change a temporary password on first sign-in. Two-factor authentication stays off until someone turns it on from Account, or an administrator requires it in Settings.

## Local development

Requires Node.js 22.23.4 or newer. The app does not use Docker.

`npm run dev` starts the dashboard, the API, and a local PostgreSQL when `DATABASE_URL` points at this machine and nothing is listening there. That database keeps its data in `data/pg-dev`. Closing the terminal stops it. The next `npm run dev` starts it again, then the API applies migrations. A server install still uses its own PostgreSQL.

```bash
cp .env.development.example .env.development
# Fill in DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, and the initial admin password.
npm install
npm run db:migrate
npm run dev
```

The dashboard runs at `http://127.0.0.1:5173` and proxies `/api` to the API on port 3000. Short links in development use `SHORT_URL_BASE`, which should point at the API origin so every prefix resolves without a Vite proxy rule.

On first startup Sharry creates the initial administrator from `INITIAL_ADMIN_*` when no administrator exists. The password is hashed with Argon2id and is never printed. The account must change that password before the dashboard opens. Later startups do not reset that password, and a deleted administrator is not recreated after initialization.

`npm run create-admin` creates another administrator from the same variables. If the username or email already exists, it stops and does not change the password.

## Configuration

Keep `.env.development` and `.env.production` out of Git. `.env.development.example` and `.env.production.example` contain placeholders only.

`npm run dev`, `npm run db:migrate`, `npm run setup`, `npm run create-admin`, and `npm run backup` read `.env.development` on this machine. `npm run deploy` reads `.env.production`. The server keeps its own runtime file at `$DEPLOY_REMOTE_DIR/shared/.env`.

`.env.production` holds the public hostname, VPS address, SSH user, and SSH key path. The private key stays on the deploy machine. The file stores only its path. Deploy copies the runtime values into the server file. Keys prefixed with `DEPLOY_` are never uploaded. `DOMAIN` stays in `.env.production`.

`npm run deploy` copies runtime variables when the server does not have them yet, and again when you pass `--sync-env`. An existing server environment is left untouched unless that flag is set.

Set `DOMAIN` in `.env.production`. When `APP_URL`, `SHORT_URL_BASE`, or `DEPLOY_HEALTHCHECK_URL` are empty, deploy uses `https://DOMAIN` and `https://DOMAIN/health`. When `SESSION_SECRET`, `ENCRYPTION_KEY`, or `DATABASE_URL` are empty, the first deploy generates them and writes them back into `.env.production`. Later deploys reuse those lines. Replacing `ENCRYPTION_KEY` makes saved two-factor secrets and the SMTP password unreadable.

`APP_URL` and `SHORT_URL_BASE` are read from the server environment on each process start. Settings cannot change them.

- `APP_URL` is the origin of password-reset links: `{APP_URL}/login/reset?token=...`.
- `SHORT_URL_BASE` is the origin of short links shown in the dashboard, link CSV export, and newly encoded QR codes.

A domain change means editing the server `.env` (or deploying with `--sync-env`) and restarting the service. QR images that were already downloaded keep the address that was encoded at the time. Redirects match the path, so a host that still reaches this process keeps working. CORS also uses these two environment values.

`REDIS_URL` is reserved and unused.

## Roles

Administrators manage every user, link, campaign, QR code, setting, audit event, and API key. Standard users manage only their own links, campaigns, and analytics. Those checks run in the API.

## API keys

Administrators create a named key for a chosen user from API keys in the dashboard. The secret is shown once and is stored only as a hash. Send it as `Authorization: Bearer sharry_...` to `https://DOMAIN/api/...`.

The key can do what that user can. A standard user’s key sees only that user’s links, campaigns, QR codes, and analytics. An administrator’s key can also call admin routes. Sign-in, password changes, and two-factor routes under `/api/auth` accept only the session cookie.

## Documentation

Signed-in users open `/docs` for the same guides: how to use links, campaigns, QR codes, analytics, API keys, settings, and users, plus local development, deploy, and the API reference. The pages are markdown files in `apps/web/docs/en` and `apps/web/docs/de`. The API reference is generated from the JSDoc block above each route in `apps/api/src`. You can read those files in the repository before the app is running. This README is the short copy of local development and deploy.

Password reset email uses the SMTP host, port, username, password, and from address saved in Settings. The password is encrypted in the database and is not shown again. Until a host and from address are saved there, Sharry falls back to `SMTP_HOST` and `EMAIL_FROM` in the server environment when those are set.

## Short links

Public URLs look like `https://share.example.com/s/summer-sale`. The prefix is stored in the database after installation and can be changed in Settings. Changing it updates every displayed link immediately because the prefix is not stored on the link. Printed QR codes still contain the old path. Enable legacy prefixes to keep resolving the previous path. That change asks for confirmation.

Slugs are unique without regard to case. A taken slug returns: "This short URL is already in use. Please choose a different slug."

Destination edits keep the slug and the click history. A link can expire, can be disabled, and can require a password before it redirects. Redirects default to 302 and can be 301, 307, or 308. Every redirect sends `Cache-Control: no-store`, and a correct password continues with 303.

Each link can store `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, and `utm_content`. Those values are added to the destination at redirect time. Existing unrelated query parameters and the URL fragment are kept. Replacing a UTM value that is already on the destination shows a warning first.

## Campaigns

A campaign is a named group of variants. It does not change the destination and it is not an A/B test.

A variant belongs to one short link and can override that link’s UTM parameters. Blank fields keep the link’s values. The variant is used when the short link is opened with `?v=<variant id>`, or when a QR code is saved with that variant. A variant id from another link is ignored. The tracked address looks like `https://share.example.com/s/summer-sale?v=<variant id>`.

## QR codes

QR codes encode the short URL plus a `qr` id, so a destination change does not require a new code. A code can also carry a campaign variant. The editor supports square, rounded, dot, and extra-rounded modules, finder styles, colors, a transparent background, quiet zone, error correction, and a center image. Downloads are PNG, JPEG, and SVG. JPEG always uses a solid background.

Center images are stored on disk under `QR_DATA_DIR`, not in PostgreSQL. Account thumbnails use `AVATAR_DATA_DIR`. On a server those directories live under `shared/data`, which each release links as `data`.

## Analytics

The dashboard shows clicks, unique visitors, bot clicks, a daily series, and breakdowns for referrer, country, browser, device, and each `utm_*` value. A blank UTM value is counted as “Not set”. Country and region are filled only when `GEOIP_DB_PATH` points at a local MaxMind database.

Sharry does not store raw IP addresses. The anonymous visitor id is a daily HMAC of a truncated address and the user agent. Referrers are stored as hostnames. `analytics_retention_days` in Settings deletes older click events on startup. Use `0` to keep them.

Administrators can export links and clicks as CSV. The click export includes every UTM column.

## Deploy on your own server

Two things stay outside the script:

- The VPS is already running Ubuntu or Debian, and it accepts SSH with the key in `.env.production`. `DEPLOY_USER` is `root`, or a user that can run `sudo -n`.
- The domain’s A record points at the VPS IPv4 address. The provider’s firewall allows ports 22, 80, and 443. A cloud firewall is not the machine’s own firewall, so the script cannot open it.

`npm run deploy` installs the rest. Caddy requests and renews the certificate for the deployment domain because the site name is a hostname and ports 80 and 443 reach the server. Sharry does not call a certificate API. Administrators can add more redirect domains in the dashboard. Each one is checked with a DNS TXT record. After it is verified, and its A record points at this server, Caddy issues a certificate for that hostname the first time someone opens it. People then choose that domain when they create a link. The deployment domain stays the default.

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

Leave `APP_URL`, `SHORT_URL_BASE`, `DEPLOY_HEALTHCHECK_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` empty unless you already have values to keep. `DEPLOY_REMOTE_DIR` defaults to `/var/www/sharry`. The initial password is used only the first time the database is empty, must be at least 12 characters, and the first sign-in asks for a new one. If the server already has a runtime environment, copy its session secret and encryption key into `.env.production`. An empty value is not a request to replace them.

`APP_URL` is the public origin used in password-reset links. `SHORT_URL_BASE` is the origin encoded into short links and QR codes. Both become `https://DOMAIN` when they are empty.

If the host is not already in `known_hosts` (or in `DEPLOY_KNOWN_HOSTS_PATH`), the first deploy records the key from `ssh-keyscan` and prints its fingerprint.

### 2. Deploy

```bash
npm install
npm run deploy
```

The first deploy writes `$DEPLOY_REMOTE_DIR/shared/.env`. A later deploy keeps that file. Pass `--sync-env` when the runtime values should be copied again.

On a server that is already in use, each step is safe to repeat. Node.js 22.23.4 or newer stays installed. An existing PostgreSQL cluster is left as it is. An existing database role or database is not dropped, and its password is not changed. A Caddy site that already names `DOMAIN` is left in place.

The script then does the following, in order:

1. Checks `/etc/os-release` and stops unless the ID is `ubuntu` or `debian`.
2. Installs the latest Node.js 22 release when `/usr/bin/node` is missing or older than 22.23.4.
3. Installs PostgreSQL when `psql` or `pg_dump` is missing, and starts it.
4. Creates the `sharry` system user, database role, and database when they are missing.
5. Installs Caddy when it is missing. When `DOMAIN` has no site yet, adds a site that proxies to `127.0.0.1:3000`. A Caddyfile that still has the retired `interval` or `burst` on-demand options is rewritten so Caddy 2.11 can start. Caddy is then reloaded.
6. When `ufw` is already enabled, allows ports 80 and 443. It does not enable `ufw` when it is off.
7. Packs the repo, excluding `.git`, `node_modules`, the local environment files, and `data`, and uploads it to `$DEPLOY_REMOTE_DIR/releases/<timestamp>`.
8. Links `$DEPLOY_REMOTE_DIR/shared/data` to `data` inside the release, so QR images and avatars survive the next release.
9. When free memory plus free swap is below 1.5 GB, adds a 2 GB swap file, then runs `npm ci` and `npm run build` on the server.
10. Writes `shared/.env` on the first install, and again when `--sync-env` is set.
11. Runs `npm run backup`, writing a custom-format dump to `$DEPLOY_REMOTE_DIR/backups`.
12. Runs migrations.
13. Records the previous `current` target in `previous-release`.
14. Installs `deploy/systemd/sharry.service` with the remote directory filled in.
15. Points `current` at the new release, reloads systemd, enables the service, and restarts it.
16. Requests `https://DOMAIN/health` up to 30 times, once a second. When that fails and a previous release exists, deploy points `current` back at it, restarts, and exits with an error. Old releases are deleted only after the health check passes, and the five newest are kept.

Secrets are not printed. The service listens on `APP_PORT` (3000 by default) as the `sharry` user. The unit file is `WorkingDirectory=$DEPLOY_REMOTE_DIR/current` and `ExecStart=/usr/bin/node apps/api/dist/index.js`.

Sign in with the initial administrator and choose a new password. Mail and the two-factor requirement are configured in Settings after that.

### Backup

`npm run backup` writes a custom-format `pg_dump` using `DATABASE_URL` without putting the URL on the command line. Deploy runs this before migrations. Schedule it with cron on the server as well.

### Rollback

A failed health check restores the previous release and restarts the service when `previous-release` is set. To roll back by hand:

1. Point `current` at the previous release directory recorded in `previous-release`.
2. Restart the systemd service.
3. If the migration was destructive, restore the dump from `$DEPLOY_REMOTE_DIR/backups` with `pg_restore`.

### Health

`GET /health` checks the process and the database. It does not require a session.

## Tests

```bash
npm test
```

Database tests start a local PostgreSQL instance when one is not already installed. They use `DATABASE_URL` from that instance. PGlite is not used for migrations.
