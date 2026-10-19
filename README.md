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

Password reset email uses the SMTP host, port, username, password, and from address saved in Settings. The password is encrypted in the database and is not shown again. A blank host falls back to `SMTP_*` in the server environment when those variables are set.

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

## Production

Run PostgreSQL on localhost only. Open SSH and HTTPS. Leave PostgreSQL off the public internet.

Caddy terminates TLS. See `deploy/Caddyfile.example`. The systemd unit is `deploy/systemd/sharry.service`. The deploy script installs it under a dedicated `sharry` user and restarts the service only after migrations. The deployment is successful after `DEPLOY_HEALTHCHECK_URL` returns OK.

```bash
npm run deploy -- --sync-env   # first install, or when runtime env should change
npm run deploy                 # later releases, preserving the server .env
```

The script checks the server host key against `known_hosts` and refuses unknown hosts. It does not print passwords, session secrets, encryption keys, or private key material.

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
