# Routing

`apps/web/src/router.tsx` uses React Router. Signed-in pages sit under the shell. Loaders call `/api/auth/me` and send people to sign-in, a password change, two-factor enrollment, or the authenticator challenge when the session is not ready for that page. A password-change session that opens the enrollment page goes to the password page, not back to sign-in.

Every route sets a document title, `Page · Sharry`. A link, campaign, or doc page uses its own name once that record has loaded. The initial HTML and the React tree both include `<meta name="robots" content="noindex, nofollow">`, so the dashboard is not indexed.

## Public routes

| Path | Who can open it |
| --- | --- |
| `/login` | Anyone. A finished session is not required |
| `/login/mfa` | Only a session whose scope is `mfa_challenge` |
| `/login/reset` | Anyone with a reset link |
| `/account/password` | Only a session whose scope is `password_change` |
| `/account/mfa` | Only a session whose scope is `mfa_enroll` |

Any other scope on those last four routes is sent to the page that matches the current scope, or to the dashboard when the scope is `full`. A missing session is sent to `/login`.

## Signed-in routes

These sit under the shell. The parent loader requires a `full` session. A session that still needs a password change, enrollment, or an authenticator code is redirected to that step.

| Path | Page |
| --- | --- |
| `/` | Overview |
| `/links`, `/links/new`, `/links/:id` | Link list, create, and editor |
| `/campaigns`, `/campaigns/:id` | Campaign list and detail |
| `/analytics` | Analytics |
| `/docs` | Redirects to `/docs/user/signing-in` |
| `/docs/*` | User guides, developer notes, and `/docs/api` |
| `/account` | Password, photo, and two-factor authentication |

Admin pages add a loader that allows only the admin role. Anyone else is sent to `/`.

| Path | Page |
| --- | --- |
| `/admin/users` | Create and manage accounts |
| `/admin/api-keys` | API keys |
| `/admin/settings` | Prefix, sessions, mail, and CSV export |
| `/admin/server` | Host memory, disk, operating system, and installed runtime |
| `/admin/audit` | Audit log |

Docs are available to every signed-in user at `/docs`. The page list comes from markdown files under `apps/web/docs`. The order is the `pageOrder` array in `apps/web/src/pages/docs.tsx`. A file that is not in that array still appears, at the end. The API reference is generated from JSDoc while Vite builds.
