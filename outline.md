# Link Shortener — Application Specification

## 1. Project Overview

Build a self-hosted, Bitly-inspired link management application deployed directly on a Hetzner VPS.

### Core functionality

- Secure login using username or email, password, and OTP-based MFA.
- Two roles: `admin` and `user`.
- Create random or custom short URLs.
- Edit destinations without changing the short URL.
- Generate UTM tracking URLs and campaign variants.
- Generate highly customizable QR codes.
- Track clicks and view analytics.
- Configure the public URL prefix.
- Manage users and settings through an admin dashboard.
- Deploy and update the application through npm and SSH, without Docker.

### Technology stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui with Base UI.
- Routing: React Router in library mode.
- Backend: Node.js, TypeScript, Fastify.
- Database: PostgreSQL with Drizzle ORM.
- Validation: Zod.
- Charts: Recharts.
- Package management: npm.
- Production process management: systemd.
- Reverse proxy and HTTPS: Caddy.
- Deployment: SSH and npm scripts.

## 2. Project Structure

```text
link-shortener/
├── apps/
│   ├── web/                  # React dashboard
│   └── api/                  # Fastify API and redirects
├── packages/
│   ├── database/             # Drizzle schema and migrations
│   └── shared/               # Types and validation schemas
├── scripts/
│   ├── deploy.ts             # VPS deployment orchestration
│   ├── setup.ts              # Initial application setup
│   └── create-admin.ts       # Admin provisioning
├── deploy/
│   ├── systemd/              # Service template
│   └── Caddyfile.example
├── package.json
├── package-lock.json
├── drizzle.config.ts
├── .env.example
├── .gitignore
└── README.md
```

Use npm workspaces. The production build should serve the compiled React frontend and API through the same public domain.

## 3. Central Configuration

All deployment and application configuration must be environment-driven. Avoid hardcoded domains, IP addresses, URL prefixes, ports, and credentials.

### `.env.example`

```dotenv
# ==========================================
# APPLICATION
# ==========================================
NODE_ENV=production
APP_NAME=Link Shortener
APP_URL=https://share.example.com
APP_HOST=0.0.0.0
APP_PORT=3000

# ==========================================
# PUBLIC SHORT URLS
# ==========================================
SHORT_URL_BASE=https://share.example.com
SHORT_URL_PREFIX=/s

# ==========================================
# DATABASE
# ==========================================
DATABASE_URL=postgresql://linkapp:CHANGE_ME@localhost:5432/linkshortener

# ==========================================
# INITIAL ADMINISTRATOR
# Used only for initial provisioning
# ==========================================
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD

# ==========================================
# AUTHENTICATION
# ==========================================
SESSION_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_SECRET
ENCRYPTION_KEY=CHANGE_ME_TO_A_SECURE_ENCRYPTION_KEY
OTP_ISSUER=Link Shortener

# ==========================================
# EMAIL
# ==========================================
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@example.com

# ==========================================
# VPS DEPLOYMENT
# ==========================================
DEPLOY_ENABLED=false
DEPLOY_HOST=203.0.113.10
DEPLOY_PORT=22
DEPLOY_USER=deploy
DEPLOY_SSH_KEY_PATH=/absolute/path/to/private_key
DEPLOY_REMOTE_DIR=/var/www/link-shortener
DEPLOY_BUILD_COMMAND=npm run build
DEPLOY_RESTART_SERVICE=link-shortener
DEPLOY_HEALTHCHECK_URL=https://share.example.com/health

# ==========================================
# OPTIONAL
# ==========================================
REDIS_URL=
```

The values above are examples, not real credentials or server addresses.

### Configuration requirements

- Keep `.env` out of Git.
- Provide `.env.example` without real secrets.
- Validate required variables with Zod at startup.
- Use separate configuration modules for runtime and deployment.
- Never expose secrets to the React frontend.
- Restrict production `.env` permissions to the application/deployment owner.
- Store the private SSH key separately; `.env` contains only its path.
- Never print passwords, encryption keys, or private-key contents in deployment logs.
- Validate SSH host keys instead of automatically trusting unknown hosts.
- Support separate development and production configurations.

### Local and server configuration

Use two distinct configuration contexts:

1. **Local deployment `.env`:** contains the VPS IP, SSH key path, SSH user, remote directory, and deployment settings. It may also contain the initial administrator credentials used for provisioning.
2. **Server runtime `.env`:** contains the production application URL, public short URL prefix, database connection, session secret, encryption key, email configuration, and other runtime settings.

The deployment script should transfer only the runtime variables required by the server. SSH credentials and local filesystem paths must never be copied to the VPS.

Keep the two contexts clearly documented, and do not allow the server's runtime configuration to overwrite local deployment settings.

## 4. First-Run Setup and Administrator Provisioning

On the first application startup, the system must automatically create the initial administrator account using:

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

### First-run behavior

1. Validate the environment configuration.
2. Connect to PostgreSQL.
3. Apply database migrations through the deployment/setup process.
4. Check whether an administrator already exists.
5. If no administrator exists, create one using the configured credentials.
6. Hash the password with Argon2id before saving it.
7. Assign the `admin` role.
8. Record the account creation event.
9. Complete startup normally.

### Safety requirements

- Initial administrator provisioning must be idempotent.
- Never overwrite an existing administrator's password on subsequent startups.
- Never recreate a deleted or disabled administrator automatically if the system has already been initialized.
- Fail safely if required initial credentials are missing on a fresh installation.
- Do not expose administrator creation through a public, unauthenticated API.
- Do not log the initial password.
- Require a password change at the first login.
- Require MFA enrollment during initial account setup.
- After successful provisioning, mark the installation as initialized in the database.

The initial administrator should be able to log in and create additional accounts, manage application settings, and configure the system.

## 5. Roles and Permissions

Implement exactly two roles.

### Administrator

An administrator can:

- View and manage all users.
- Create users and administrators.
- Change roles and deactivate accounts.
- View, create, edit, disable, and delete all short links.
- Change any link's destination or slug.
- Manage tracking campaigns and QR codes.
- View system-wide analytics.
- Manage the public short URL prefix and other application settings.
- View audit logs.
- Export data.

### Standard user

A standard user can:

- Create short links.
- View and edit their own links.
- Change the destinations of their own links.
- Change their own custom slugs, provided the new slug is available.
- Generate random slugs.
- Generate QR codes.
- Create and edit UTM tracking URLs.
- Manage their own tracking campaigns.
- View analytics for their own links.

Standard users must never access another user's resources or global configuration.

Enforce these permissions in backend services and database queries, not merely through frontend navigation.

## 6. Short URL Structure and Configurable Prefix

All public short URLs use the configured domain and prefix.

Example:

```text
Domain:
https://share.example.com

Prefix:
/s

Generated URL:
https://share.example.com/s/1gsdt
```

The URL prefix is configurable during initial setup and can be changed later through the administrator settings page.

### Initial configuration

Set `SHORT_URL_PREFIX` in `.env` to the initial prefix, such as `/s`.

On the first installation, save the initial value into the application settings database.

### Runtime configuration

After initialization, the database becomes the source of truth for the public URL prefix.

Administrators can change the prefix through the dashboard, for example:

```text
/s  →  /go
```

The application must then generate and resolve links using the new prefix:

```text
Before:
https://share.example.com/s/1gsdt

After:
https://share.example.com/go/1gsdt
```

The slug itself remains unchanged.

### Prefix-change behavior

- All links use the new prefix immediately after the setting is saved.
- No individual link records need to be updated.
- All newly generated short URLs and QR codes use the current prefix.
- The redirect resolver uses the current prefix.
- The prefix change is recorded in the audit log.
- The setting must be validated to prevent conflicting routes.
- Users must not be able to change the global prefix.

**Important:** existing QR codes and printed URLs encode the old path. Changing the prefix cannot physically update them. Offer an optional legacy-prefix compatibility mode that redirects old paths to their new equivalents. If compatibility is enabled, retain the previous prefix as a legacy alias and resolve it to the same link record.

The application domain is configured separately. Changing the domain requires DNS and HTTPS configuration as well as updating the public URL settings.

## 7. Slug Generation and Uniqueness

Each short link has one unique slug.

### Random slugs

When no custom slug is supplied, generate a cryptographically random slug.

Example:

```text
https://share.example.com/s/a8K3m
```

Use a configurable slug length and a URL-safe alphabet.

### Custom slugs

Users may specify their own slugs:

```text
https://share.example.com/s/summer-sale
```

Validate slug length, allowed characters, reserved paths, and normalized uniqueness.

### Duplicate prevention

The application must know which slugs are already in use.

- Add a unique database constraint on the normalized slug.
- Check availability in the API to provide immediate feedback.
- Enforce uniqueness again when saving, so concurrent requests cannot create duplicates.
- If a slug is taken, return a clear validation error and ask the user to choose another.
- Never silently replace another user's slug or link.
- If a randomly generated slug collides, generate a new candidate and retry a limited number of times.
- Keep slug availability checks scoped to the current public prefix, since the prefix is global.

Example error:

> This short URL is already in use. Please choose a different slug.

Random and custom slugs use the same uniqueness rules.

## 8. Editing Existing Links

The destination URL must be editable at any time by the link owner or an administrator.

Example:

```text
Short URL:
https://share.example.com/s/summer

Original destination:
https://example.com/summer-sale-2026

Updated destination:
https://example.com/summer-sale-2027
```

Changing the destination must not change the slug or short URL.

Requirements:

- Validate the destination URL.
- Save changes transactionally where needed.
- Apply changes to future redirects immediately.
- Preserve historical click events.
- Record the previous and new destination in the audit log.
- Keep QR codes valid because they point to the short URL.
- Clearly distinguish changing a destination, changing a slug, and changing the global prefix.

Use HTTP 302 as the default redirect type. Support 301, 302, 307, and 308 where appropriate.

## 9. Tracking URL and UTM Builder

Provide a dedicated tracking URL builder.

Supported parameters:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_id`
- `utm_term`
- `utm_content`

Users can enter a destination URL, fill in tracking parameters, preview the final URL, copy it, and optionally create a short link from it.

Requirements:

- Preserve existing query parameters and URL fragments.
- Properly encode parameter values.
- Warn before replacing existing UTM values.
- Support campaign presets and named variants.
- Allow users to edit the UTM configuration of their own links.
- Allow administrators to manage all tracking configurations.
- Track clicks per short link and campaign variant.

Example:

```text
https://example.com/sale
  ?utm_source=newsletter
  &utm_medium=email
  &utm_campaign=summer_2027
```

Keep the original destination and UTM configuration logically separate where practical. Rebuild the effective destination URL from these values so tracking parameters can be edited without manually manipulating a long URL.

## 10. Custom QR Code Generator

QR code generation is a core feature, not a secondary utility.

Allow users to create multiple visual styles for any short link.

### Supported styles

- Traditional square modules.
- Rounded-square modules.
- Circular or dot-shaped modules.
- Rounded dots.
- Different finder/position marker styles.
- Custom foreground and background colors.
- Transparent backgrounds where supported.
- Center image or logo.
- Adjustable center-image size.
- Configurable quiet zone and margin.
- Configurable error-correction level.
- Preview before downloading.

### Export formats

Every QR code must be downloadable as:

- PNG
- JPG/JPEG
- SVG

Use a QR generation library that supports customizable module shapes and finder patterns, or implement a rendering layer that supports these features reliably.

SVG should be a true vector output. PNG and JPEG should be rendered at the requested resolution. JPEG does not support transparency, so use a configurable solid background for JPEG exports.

### Center images and logos

- Allow users to upload an image for the center of the QR code.
- Validate image type, dimensions, and file size.
- Allow adjustment of the center-image scale.
- Use appropriate error correction, normally High when a center image is enabled.
- Preserve adequate contrast and quiet-zone spacing.
- Warn when the design may be difficult to scan.
- Provide a preview and, where practical, a scannability test.

### QR code tracking

Each QR code can have its own identifier and optional campaign association.

Record:
- QR code ID.
- Associated link.
- Style configuration.
- Creation date.
- Optional campaign or variant.

A QR code should encode the public short URL, not the long destination. This allows destination changes without requiring new QR codes.

Changing the global URL prefix changes the encoded path for newly generated QR codes. Previously printed codes require a legacy-prefix redirect or must be regenerated.

## 11. Click Tracking and Analytics

Track:

- Total clicks.
- Estimated unique visitors.
- Clicks over time.
- Referrers.
- Country and region, where available.
- Browser and operating system.
- Device category.
- Bot traffic.
- Campaign and UTM performance.
- QR-attributed visits where measurable.

Use asynchronous event processing if necessary so analytics do not slow redirects.

Avoid storing full IP addresses by default. Document privacy, retention, and anonymization behavior appropriate for GDPR.

Users see analytics only for their own links. Administrators can see system-wide analytics.

## 12. Database Schema

Use PostgreSQL and Drizzle ORM.

### `users`

- `id`
- `username`
- `email`
- `password_hash`
- `role`
- `email_verified_at`
- `totp_secret_encrypted`
- `totp_enabled`
- `must_change_password`
- `is_active`
- `created_at`
- `updated_at`

### `links`

- `id`
- `user_id`
- `slug`
- `destination_url`
- `title`
- `description`
- `redirect_type`
- `status`
- `expires_at`
- `password_hash`
- `created_at`
- `updated_at`

Add a unique constraint on the normalized slug.

### `app_settings`

- `key`
- `value`
- `updated_by`
- `updated_at`

Store runtime settings such as the active public URL prefix here. Validate each setting according to its type.

### `tracking_configs`

- `id`
- `link_id`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_id`
- `utm_term`
- `utm_content`
- `created_at`
- `updated_at`

### `tracking_campaigns`

- `id`
- `user_id`
- `name`
- `description`
- `created_at`
- `updated_at`

### `tracking_variants`

- `id`
- `campaign_id`
- `link_id`
- `name`
- `created_at`

### `qr_codes`

- `id`
- `link_id`
- `tracking_variant_id`
- `name`
- `style_config`
- `created_at`

Store uploaded center images safely, with controlled file access and size limits. Avoid storing large binary images directly in PostgreSQL unless there is a clear reason.

### `click_events`

- `id`
- `link_id`
- `tracking_variant_id`
- `qr_code_id`
- `occurred_at`
- `referrer`
- `country_code`
- `browser`
- `operating_system`
- `device_type`
- `is_bot`
- `anonymous_visitor_id`

### `audit_logs`

- `id`
- `actor_user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

Use foreign keys, indexes, transactions, and appropriate deletion policies.

## 13. Admin Settings

Provide a settings page for:

- Public application URL.
- Public short URL prefix.
- Legacy-prefix compatibility.
- Default redirect type.
- Default random slug length.
- Slug character policy.
- Default QR code style.
- Analytics retention.
- Registration policy.
- Session settings.
- Email settings status.

Sensitive settings such as encryption keys and session secrets must remain in environment configuration rather than being displayed or editable in the dashboard.

Changing the public prefix should require administrator confirmation and explain its impact on existing URLs and printed QR codes.

## 14. VPS Deployment Through SSH

Implement deployment through Node.js scripts and npm. Do not use Docker.

### Deployment configuration

The local deployment `.env` must contain:

- VPS IP or hostname.
- SSH port.
- SSH username.
- Absolute path to the SSH private key.
- Remote application directory.
- systemd service name.
- Public health-check URL.
- Build and deployment settings.

The private SSH key stays on the deployment machine.

### Deployment workflow

1. Validate local deployment configuration.
2. Connect to the VPS using SSH.
3. Verify the server's SSH host key.
4. Check required Node.js and npm versions.
5. Upload or pull the application source.
6. Install dependencies with `npm ci`.
7. Build the frontend and backend.
8. Run database migrations.
9. Update the server runtime `.env` when configuration changes are intended.
10. Restart the systemd service.
11. Wait for the health check.
12. Report success or failure.

Never overwrite production configuration blindly during deployments. Preserve existing runtime secrets and application settings unless an explicit configuration update is requested.

### systemd

Run the application under a dedicated non-root service account.

Configure:
- Start on boot.
- Automatic restart after failures.
- Graceful shutdown.
- Restricted filesystem permissions.
- Logs through journald.
- Appropriate environment-file access.

Use Caddy for HTTPS and reverse proxying. Configure firewall rules and keep PostgreSQL inaccessible from the public internet.

### Deployment safety

- Never run arbitrary commands constructed from untrusted input.
- Validate remote paths and service names.
- Avoid printing secrets in logs.
- Back up the database before migrations that could be destructive.
- Check application health after restart.
- Keep a documented rollback process.
- Do not claim deployment succeeded until the health check passes.

## 15. Implementation Phases

### Phase 1 — Foundation

- npm workspaces.
- React and Fastify setup.
- PostgreSQL and Drizzle.
- Environment validation.
- Database migrations.
- First-run admin provisioning.

### Phase 2 — Authentication and Permissions

- Login and MFA.
- Session management.
- Admin/user authorization.
- Password change and recovery.
- Account management.

### Phase 3 — Short Links

- Random and custom slugs.
- Duplicate detection.
- Editable destinations.
- Configurable public URL prefix.
- Redirect resolver.
- Link ownership checks.

### Phase 4 — Tracking

- UTM builder.
- Tracking campaigns and variants.
- Click analytics.
- Historical event preservation.

### Phase 5 — QR Codes

- Multiple module styles.
- Center-image support.
- PNG, JPEG, and SVG exports.
- Campaign-specific QR codes.
- Preview and validation.

### Phase 6 — Administration

- User management.
- Global settings.
- Audit logs.
- System-wide analytics.

### Phase 7 — VPS Deployment

- SSH deployment script.
- Remote build and installation.
- systemd configuration.
- HTTPS and reverse proxy.
- Health checks.
- Backups and rollback documentation.

## 16. Acceptance Criteria

The application is ready for its first production release when:

- It runs directly on Node.js without Docker.
- All deployment settings are configurable through `.env`.
- The SSH private key remains outside the environment file.
- The initial administrator is automatically provisioned on a fresh installation.
- Repeated startup never resets administrator credentials.
- Users can manage only their own short links.
- Administrators can manage all users and links.
- Duplicate slugs are rejected safely.
- Random and custom slugs both work.
- Existing destinations can be changed without changing the slug.
- The public URL prefix can be changed through the admin interface.
- Existing links resolve using the active prefix, with optional legacy compatibility.
- UTM parameters can be built and edited.
- QR codes support center images, dot styles, and multiple visual customizations.
- QR codes can be downloaded as PNG, JPEG, and SVG.
- Analytics remain associated with the correct link after destination changes.
- Deployment works through SSH and npm.
- PostgreSQL is not publicly exposed.
- The system has documented backups, health checks, and rollback procedures.

## 17. Instructions for the AI Coding Agent

Implement this specification incrementally. Before building features, establish the project structure, configuration validation, database schema, migrations, and initial administrator provisioning.

Use npm exclusively. Use TypeScript strict mode and Drizzle ORM. Avoid `any`, non-null assertions, hardcoded deployment values, and unnecessary infrastructure.

Do not implement Docker, multi-domain management, or domain selection per link.

Treat the database as the source of truth for links and the active URL prefix after initial setup. Enforce permissions on the backend. Test slug collisions, prefix changes, destination edits, first-run provisioning, and QR exports.

Every phase must include working code, tests, migrations where required, and updated documentation. Do not mark a feature complete merely because its UI exists.