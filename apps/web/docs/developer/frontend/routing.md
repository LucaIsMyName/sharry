# Routing

`apps/web/src/router.tsx` uses React Router. Signed-in pages sit under the shell. Loaders call `/api/auth/me` and send people to sign-in, a password change, two-factor enrollment, or the authenticator challenge when the session is not ready for that page. A password-change session that opens the enrollment page goes to the password page, not back to sign-in.

Admin pages add a loader that allows only the admin role. Docs are available to every signed-in user at `/docs`. The page list comes from markdown files under `apps/web/docs`. The API reference is generated from JSDoc while Vite builds.
