# Sharry

Sharry is a self-hosted link shortener. One Node.js process serves the dashboard, the API, and public redirects. PostgreSQL stores links, users, and the active URL prefix.

## Local development

Requires Node.js 22 or newer and PostgreSQL 16 or newer. The app does not use Docker.

```bash
cp .env.example .env
# Fill in DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, and the initial admin password.
npm install
npm run db:migrate
npm run dev
```

The dashboard runs at `http://127.0.0.1:5173` and proxies `/api` to the API on port 3000. Short links in development use `SHORT_URL_BASE`, which should point at the API origin so every prefix resolves without a Vite proxy rule.

On first startup Sharry creates the initial administrator from `INITIAL_ADMIN_*` when no administrator exists. The password is hashed with Argon2id and is never printed. The account must change that password before the dashboard opens. Two-factor authentication stays off until that person turns it on from Account. Later startups do not reset that password, and a deleted administrator is not recreated after initialization.

`npm run create-admin` creates another administrator from the same variables. If the username or email already exists, it stops and does not change the password.

## Configuration

Keep `.env` out of Git. `.env.example` contains placeholders only.

There are two configuration contexts:

- **Local deployment `.env`:** VPS address, SSH user, SSH key path, remote directory, service name, and health-check URL. The private key stays on the deploy machine. `.env` stores only its path.
- **Server runtime `.env`:** public URL, short-link prefix, database URL, session secret, encryption key, and email settings.

`npm run deploy` copies runtime variables only when you pass `--sync-env`. Keys prefixed with `DEPLOY_` are never uploaded. An existing server environment is left untouched unless that flag is set.

`REDIS_URL` is reserved and unused.

## Roles

Administrators manage every user, link, campaign, QR code, setting, and audit event. Standard users manage only their own links, campaigns, and analytics. Those checks run in the API.

Registration stays closed. Administrators create accounts and set a temporary password. New accounts change that password on first sign-in. Two-factor authentication stays off until someone turns it on from Account, or an administrator requires it for every account in Settings.

Password reset email uses the SMTP host, port, username, password, and from address saved in Settings. The password is encrypted in the database and is not shown again.

## Short links

Public URLs look like `https://share.example.com/s/summer-sale`. The prefix comes from the database after installation. Changing it in Settings updates every link immediately because the prefix is not stored on the link. Printed QR codes still contain the old path. Enable legacy prefixes to keep resolving the previous path.

Slugs are unique without regard to case. A taken slug returns: "This short URL is already in use. Please choose a different slug."

Destination edits keep the slug and the click history. Redirects default to 302 and can be 301, 307, or 308.

## Tracking and QR codes

The UTM builder keeps unrelated query parameters and the URL fragment. Replacing an existing UTM value shows a warning first. Campaign variants can override those parameters. Click events store the UTM values used at redirect time.

QR codes encode the short URL plus a `qr` id, so a destination change does not require a new code. The editor supports square, rounded, dot, and extra-rounded modules, finder styles, colors, a transparent background, quiet zone, error correction, and a center image. Downloads are PNG, JPEG, and SVG. JPEG always uses a solid background.

Center images are stored on disk under `QR_DATA_DIR`, not in PostgreSQL.

## Privacy

Sharry does not store raw IP addresses. The anonymous visitor id is a daily HMAC of a truncated address and the user agent. Country and region are filled only when `GEOIP_DB_PATH` points at a local MaxMind database. Referrers are stored as hostnames. `analytics_retention_days` deletes older click events. Use `0` to keep them.

## Deploy on your own server

Deploy runs from your machine over SSH. It uploads a release, installs dependencies, builds, backs up the database, runs migrations, points `current` at the new release, and restarts the service. It does not create the server user, the database, or the TLS proxy.

The server needs:

- Node.js 22 or newer available as `/usr/bin/node`. The systemd unit starts that exact path.
- PostgreSQL on localhost, not exposed to the internet. `pg_dump` must be on the deploy user's `PATH`, because every deploy writes a backup before migrating.
- A Linux user named `sharry`. The service runs as that user.
- An SSH user that can log in with a key and run `sudo` without a password prompt. The script uses `sudo -n` for `systemctl daemon-reload`, `systemctl enable`, `systemctl restart`, and copying the unit file into `/etc/systemd/system`.
- Caddy, or another reverse proxy, for HTTPS. Leave port 3000 and PostgreSQL closed to the public internet. Open SSH and HTTPS.
- A DNS name pointed at the server.

### 1. Prepare the server

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin sharry
sudo -u postgres createuser --pwprompt sharry
sudo -u postgres createdb --owner=sharry sharry
```

Install Node.js 22 so `node` resolves to `/usr/bin/node`, and install the PostgreSQL client so `pg_dump` is on `PATH`.

Allow the SSH user passwordless sudo for `systemctl daemon-reload`, `systemctl enable`, `systemctl restart`, and copying the unit file into `/etc/systemd/system`. A sudo password prompt makes the deploy fail.

### 2. Point DNS and HTTPS at the app

Copy `deploy/Caddyfile.example`, replace `share.example.com` with your domain, and install that site for Caddy. Caddy proxies every request to `127.0.0.1:3000`. Reload Caddy after the first deploy, once the app is listening.

### 3. Fill in the local `.env`

On the machine you deploy from:

```bash
cp .env.example .env
```

Set the runtime values to the production server, not your laptop database:

- `APP_URL` and `SHORT_URL_BASE` are the public `https://` origin.
- `DATABASE_URL` is the server database, for example `postgresql://sharry:PASSWORD@127.0.0.1:5432/sharry`. That host is the server's localhost. The deploy script runs the backup and migrations there.
- `SESSION_SECRET` and `ENCRYPTION_KEY` are each at least 32 characters. Keep them. Replacing `ENCRYPTION_KEY` later makes saved two-factor secrets and the SMTP password unreadable.
- `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` are used only the first time the database is empty. The password must be at least 12 characters. The first sign-in asks for a new password.

Then set the deployment values. These stay on your machine and are not copied to the server:

- `DEPLOY_ENABLED=true`
- `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`
- `DEPLOY_SSH_KEY_PATH` as an absolute path to the private key
- `DEPLOY_REMOTE_DIR`, for example `/var/www/sharry`
- `DEPLOY_RESTART_SERVICE=sharry`
- `DEPLOY_HEALTHCHECK_URL`, for example `https://share.example.com/health`
- `DEPLOY_BUILD_COMMAND` must stay `npm run build`

Add the server to your known hosts before the first deploy. The script refuses a host that is not already in `known_hosts` or in `DEPLOY_KNOWN_HOSTS_PATH`:

```bash
ssh-keyscan -p 22 your.server.example >> ~/.ssh/known_hosts
```

### 4. Deploy

```bash
npm install
npm run deploy -- --sync-env
```

`--sync-env` writes the runtime variables to `$DEPLOY_REMOTE_DIR/shared/.env` on the server. Use it for the first install and whenever those values should change. Later releases keep that file:

```bash
npm run deploy
```

The script checks the host key, requires Node.js 22 on the server, builds the release, dumps the database to `$DEPLOY_REMOTE_DIR/backups`, applies migrations, switches `current`, and restarts the service. The deploy is finished when `DEPLOY_HEALTHCHECK_URL` returns OK. Secrets are not printed.

Sign in with the initial administrator and choose a new password. Mail and the two-factor requirement are configured in Settings after that.

Each release is unpacked under `$DEPLOY_REMOTE_DIR/releases`. `current` points at the live release. The previous target is written to `previous-release`.

### Backup

`npm run backup` writes a custom-format `pg_dump` using `DATABASE_URL` without putting the URL on the command line. Deploy runs this before migrations. Schedule it with cron on the server as well.

### Rollback

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
