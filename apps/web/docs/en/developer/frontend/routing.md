# Routing

`apps/web/src/router.tsx` uses React Router. Signed-in pages sit under the shell. Loaders call `/api/auth/me` and send people to sign-in, a password change, two-factor enrollment, or the authenticator challenge when the session is not ready for that page. A password-change session that opens the enrollment page goes to the password page, not back to sign-in.

Every route sets a document title, `Page · APP_NAME`. `APP_NAME` defaults to `Sharry`. A link, campaign, or doc page uses its own name once that record has loaded. The initial HTML and the React tree both include `<meta name="robots" content="noindex, nofollow">`, so the dashboard is not indexed.

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

These sit under the shell. The parent loader requires a `full` session. A session that still needs a password change, enrollment, or an authenticator code is redirected to that step. Search is a button under Chat in that sidebar. Cmd+K or Ctrl+K opens the same palette. It is not its own route.

| Path | Page |
| --- | --- |
| `/` | Overview |
| `/links`, `/links/new`, `/links/:id` | Link list, create, and editor |
| `/campaigns`, `/campaigns/:id` | Campaign list and detail |
| `/pages`, `/pages/:id` | Landing page list and page editor |
| `/media` | Media library |
| `/analytics` | Analytics |
| `/chat`, `/chat/:id` | Assistant chat |
| `/docs` | Redirects to `/docs/user/signing-in` |
| `/docs/*` | User guides, developer notes, `/docs/api`, and `/docs/developer/tests` |
| `/account` | Language, password, photo, and two-factor authentication |

Admin pages add a loader that allows only the admin role. Anyone else is sent to `/`.

| Path | Page |
| --- | --- |
| `/admin/users` | Create and manage accounts |
| `/admin/api-keys` | API keys |
| `/admin/settings` | Short-link and page prefixes, sessions, mail, AI, and CSV export |
| `/admin/domains` | Redirect domains, DNS verification, and the setup dialog |
| `/admin/server` | Host memory, disk, operating system, and installed runtime |
| `/admin/audit` | Audit log |

Docs are available to every signed-in user at `/docs`. The page list comes from markdown files under `apps/web/docs/<locale>`, with English in `en` and a matching tree for each other language. The order is the `pageOrder` array in `apps/web/src/pages/docs-pages.ts`. A file that is not in that array still appears, at the end. The API reference is generated from JSDoc while Vite builds.

The docs sidebar stays in view while the article scrolls. User and Developer open one at a time, and the browser remembers which one is open. A link to a page in the other section opens that section. Backend, Frontend, API, and Tests are chapters. The pages under them use a smaller type size. `/docs/api` is the generated API reference. `/docs/developer/tests` reads `/test-results.csv` and shows the last Vitest run. In development Vite serves that file from `apps/web/public`. In production the API serves the copy from the dashboard build to a signed-in session. A missing file, or a signed-out request, leaves that page empty.

Each route element sits in an error boundary. A render error replaces that page with a short message and a retry button. The shell, including the sidebar and sign-out, stays in place. Search has its own boundary, so a failure there leaves the open page up. Loaders still redirect. A failure above those boundaries, such as the shell itself, replaces the screen with a static message and a link back to `/`.

Overview, links, campaigns, pages, media, analytics, chat, docs, and the admin pages load with `React.lazy()`. Sign-in and the shell stay in the first bundle. Account stays with sign-in because they share one module. The guide markdown stays in the first bundle as well, because search reads it from `docs-pages.ts`. A page shows the loading skeleton while its chunk downloads. Moving between `/links`, `/links/new`, and `/links/:id` uses one download, and the same is true for campaigns and for users, settings, and audit. The page list and the page editor are separate chunks, so the TipTap editor loads only when a page is opened.

The page editor uses `useBlocker` from the data router. Leaving with unsaved changes opens a “Leave without saving?” dialog, and closing the tab triggers the browser's own warning.
