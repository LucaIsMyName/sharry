# Deploy

`npm run deploy` installs Sharry on an Ubuntu or Debian server over SSH. It does not use Docker. You run it from your own machine. The server then builds the release, runs migrations, and restarts a systemd service behind Caddy.

Two things stay outside the script:

- The VPS is already running Ubuntu or Debian, and it accepts SSH with the key in `.env.production`. `DEPLOY_USER` is `root`, or a user that can run `sudo -n`.
- The domain’s A record points at the VPS IPv4 address. The provider’s firewall allows ports 22, 80, and 443. A cloud firewall is not the machine’s own firewall, so the script cannot open it.

Caddy requests and renews the certificate for `DOMAIN` because the site name is a hostname and ports 80 and 443 reach the server. Sharry does not call a certificate API. The Caddyfile also allows on-demand certificates for redirect domains an administrator has verified. Caddy asks `http://127.0.0.1:3000/internal/caddy/ask` before issuing one, and Sharry allows that only for a verified redirect domain. Provision adds those blocks when they are missing, drops the retired `interval` and `burst` options that Caddy 2.11 rejects, and reloads Caddy. It leaves the existing site block for `DOMAIN` in place. A file that already has an `https://` site is not given a second one.

## Fill in `.env.production`

On the machine you deploy from:

```bash
cp .env.production.example .env.production
```

Set `DOMAIN` (for example `share.example.com`), `DEPLOY_ENABLED=true`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY_PATH` as an absolute path to the private key, and `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD`.

Leave `APP_URL`, `SHORT_URL_BASE`, `DEPLOY_HEALTHCHECK_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, and `DATABASE_URL` empty unless you already have values to keep. `DEPLOY_REMOTE_DIR` defaults to `/var/www/sharry`. The initial password is used only the first time the database has no administrator, must be at least 12 characters, and the first sign-in asks for a new one.

If the host is not already in `known_hosts` (or in `DEPLOY_KNOWN_HOSTS_PATH`), the first deploy records the key from `ssh-keyscan` and prints its fingerprint.

`npm run deploy` reads `.env.production` only. Keys prefixed with `DEPLOY_` are never uploaded. `DOMAIN` stays in `.env.production` as well. Deploy copies the runtime values into `$DEPLOY_REMOTE_DIR/shared/.env`. That copy happens on the first install, and again when you pass `--sync-env`. An existing server environment is left untouched unless that flag is set.

When `APP_URL`, `SHORT_URL_BASE`, or `DEPLOY_HEALTHCHECK_URL` are empty, deploy uses `https://DOMAIN` and `https://DOMAIN/health`. When `SESSION_SECRET` or `ENCRYPTION_KEY` are empty, the first deploy generates them and writes them back into `.env.production`. An empty `DATABASE_URL` is generated as `postgresql://sharry:<password>@127.0.0.1:5432/sharry` and written back the same way. Later deploys reuse those lines.

If the server already has `shared/.env` and `SESSION_SECRET` or `ENCRYPTION_KEY` is empty in `.env.production`, deploy stops. Copy the existing values into `.env.production`. An empty value is not a request to replace them. Replacing `ENCRYPTION_KEY` makes saved two-factor secrets and the SMTP password unreadable.

`APP_URL` and `SHORT_URL_BASE` are read from the server environment on each process start. Settings cannot change them. A domain change means editing the server `.env` (or deploying with `--sync-env`) and restarting the service. QR images that were already downloaded keep the address that was encoded at the time. Redirects match the path, so a host that still reaches this process keeps working. CORS also uses these two environment values.

`REDIS_URL` is reserved and unused. It is not uploaded.

### Runtime variables

These are copied to the server. Empty strings are treated as unset where a default exists.

| Variable | Default | Role |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set `production` on the server |
| `APP_NAME` | `Sharry` | Product name in the sidebar, browser title, and sign-in page. Blank or omitted stays `Sharry`. Its slug prefixes API keys, the session cookie, the link-unlock cookie, CSV exports, backup files, and the domain TXT name |
| `APP_URL` | `https://DOMAIN` when empty | Origin of password-reset links |
| `APP_HOST` | `0.0.0.0` | Address the process binds |
| `APP_PORT` | `3000` | Port the process binds. Caddy proxies to `127.0.0.1:3000` |
| `SHORT_URL_BASE` | `https://DOMAIN` when empty | Origin encoded into short links and new QR codes |
| `SHORT_URL_PREFIX` | required, such as `/s` | Fallback prefix until Settings saves one |
| `DATABASE_URL` | generated on first deploy | PostgreSQL URL. User and database names are letters, numbers, and underscores, and the URL must include a password |
| `INITIAL_ADMIN_USERNAME` | optional | First administrator, 3–32 characters |
| `INITIAL_ADMIN_EMAIL` | optional | First administrator email |
| `INITIAL_ADMIN_PASSWORD` | optional | First administrator password, 12–200 characters |
| `SESSION_SECRET` | generated, at least 32 characters | Session and API-key hashing. Do not rotate it casually |
| `ENCRYPTION_KEY` | generated, at least 32 characters | Two-factor secrets and the saved SMTP password |
| `OTP_ISSUER` | `Sharry` | Name shown in authenticator apps |
| `SMTP_HOST` | empty | Fallback mail host until Settings saves one |
| `SMTP_PORT` | `587` | Fallback mail port |
| `SMTP_USER` | empty | Fallback mail username |
| `SMTP_PASSWORD` | empty | Fallback mail password |
| `EMAIL_FROM` | empty | Fallback From address |
| `GEOIP_DB_PATH` | empty | Local MaxMind database. Country and region stay empty without it |
| `QR_DATA_DIR` | `data/qr-logos` | Center images. On the server this is under `shared/data` |
| `AVATAR_DATA_DIR` | `data/avatars` | Account photos, also under `shared/data` |

### Deploy-only variables

These stay on the machine you deploy from.

| Variable | Default | Role |
| --- | --- | --- |
| `DOMAIN` | required | Public hostname, without a scheme or path |
| `DEPLOY_ENABLED` | `false` | Must be `true` or deploy stops |
| `DEPLOY_HOST` | required | Server hostname or address |
| `DEPLOY_PORT` | `22` | SSH port |
| `DEPLOY_USER` | required | SSH user: `root`, or a user with passwordless sudo |
| `DEPLOY_SSH_KEY_PATH` | required | Absolute path to the private key |
| `DEPLOY_REMOTE_DIR` | `/var/www/sharry` | Release root. No `..` segments |
| `DEPLOY_BUILD_COMMAND` | `npm run build` | Only this value is accepted |
| `DEPLOY_RESTART_SERVICE` | `sharry` | systemd unit name |
| `DEPLOY_HEALTHCHECK_URL` | `https://DOMAIN/health` | Polled after restart |
| `DEPLOY_KNOWN_HOSTS_PATH` | `~/.ssh/known_hosts` | Host key file |

## Deploy

```bash
npm install
npm run deploy
```

Pass `--sync-env` when the runtime values should be copied to the server again.

`npm run deploy` runs the full test suite on this machine before it connects. A failing suite stops the deploy, and nothing is uploaded. The suite writes `apps/web/public/test-results.csv`. The release archive includes that file. The server build copies it into the dashboard, and the production process serves it at `/test-results.csv` for Docs → Developer → Tests → Last run.

On a server that is already in use, each step is safe to repeat. Node.js 22.23.4 or newer stays installed. An existing PostgreSQL cluster is left as it is. An existing database role or database is not dropped, and its password is not changed. If the `sharry` role already exists and `DATABASE_URL` is empty, deploy stops and asks you to set the current connection string. A Caddy site that already names `DOMAIN` is left in place.

The script then does the following, in order:

1. Checks `/etc/os-release` and stops unless the ID is `ubuntu` or `debian`.
2. Installs the latest Node.js 22 release when `/usr/bin/node` is missing or older than 22.23.4. Supported CPUs are x86_64 and arm64.
3. Installs PostgreSQL when `psql` or `pg_dump` is missing, and starts it.
4. Creates the `sharry` system user, database role, and database when they are missing. The role is not given a new password when it already exists.
5. Installs Caddy when it is missing. When `DOMAIN` has no site yet, adds a site that proxies to `127.0.0.1:3000` and reloads Caddy.
6. When `ufw` is already enabled, allows ports 80 and 443. It does not enable `ufw` when it is off.
7. Packs the repo, excluding `.git`, `node_modules`, the local environment files, and `data`, and uploads it to `$DEPLOY_REMOTE_DIR/releases/<timestamp>`. The test-results CSV from the suite that just ran is part of that archive.
8. Links `$DEPLOY_REMOTE_DIR/shared/data` to `data` inside the release, so QR images and avatars survive the next release.
9. When free memory plus free swap is below 1.5 GB, adds a 2 GB swap file at `/swapfile`, then runs `npm ci` and `npm run build` on the server. If the build is killed for lack of memory, free disk space for swap and run deploy again.
10. Writes `shared/.env` on the first install, and again when `--sync-env` is set. The file mode is `0600`.
11. Runs `npm run backup`, writing a custom-format dump to `$DEPLOY_REMOTE_DIR/backups`.
12. Runs migrations against that server environment.
13. Records the previous `current` target in `previous-release`.
14. Installs `deploy/systemd/sharry.service` with the remote directory filled in.
15. Points `current` at the new release, reloads systemd, enables the service, and restarts it.
16. Requests `https://DOMAIN/health` up to 30 times, once a second. When that fails and a previous release exists, deploy points `current` back at it, restarts, and exits with an error. Old releases are deleted only after the health check passes, and the five newest are kept.

Secrets are not printed. The service listens on `APP_PORT` (3000 by default) as the `sharry` user. The unit file is `WorkingDirectory=$DEPLOY_REMOTE_DIR/current` and `ExecStart=/usr/bin/node apps/api/dist/index.js`. It restarts on failure, reads `shared/.env`, and may write only under `shared/data` and the current release’s `data` link.

Sign in with the initial administrator and choose a new password. Mail and the two-factor requirement are configured in Settings after that.

## Backup

`npm run backup` writes a custom-format `pg_dump` using `DATABASE_URL` without putting the URL on the command line. Deploy runs this before migrations. Schedule it with cron on the server as well. On the server, point the command at the runtime file:

```bash
cd /var/www/sharry/current
SHARRY_ENV_FILE=/var/www/sharry/shared/.env npm run backup -- /var/www/sharry/backups/manual.dump
```

## Rollback

A failed health check restores the previous release and restarts the service when `previous-release` is set. To roll back by hand:

1. Point `current` at the previous release directory recorded in `previous-release`.
2. Restart the systemd service.
3. If the migration was destructive, restore the dump from `$DEPLOY_REMOTE_DIR/backups` with `pg_restore`.

## Health

`GET /health` checks the process and the database with `select 1`. It does not require a session. A database outage makes the check fail.
