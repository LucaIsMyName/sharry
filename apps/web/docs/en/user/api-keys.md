# API keys

Administrators create named keys from API keys. Create API key sits on the heading. On a small screen it is in the bar under the top bar. It opens a dialog for the name and the user. Each key belongs to one user and can do what that user can: their links, campaigns, QR codes, and analytics. A key for an administrator can also call admin routes.

The secret is shown once. Its prefix is the slug of `APP_NAME`: lowercased, with spaces turned into hyphens. The default `Sharry` uses `sharry_`. Send it on every request:

```http
Authorization: Bearer sharry_...
```

Sharry stores only a hash of the secret, using `SESSION_SECRET`. It cannot be shown again. Revoke the key and create another one if it is lost. Revoking does not delete the user’s links.

## What a key can call

Calls use the same paths as the dashboard, for example `GET /api/links` on this site’s domain. The API reference at `/docs/api` lists every route, the auth it accepts, and the responses. Each route includes a curl command and a TypeScript `fetch` call. One switch changes every sample, and the browser remembers the choice.

A standard user’s key sees only that user’s links, campaigns, QR codes, and analytics. An administrator’s key can also call admin routes: users, settings, audit, exports, and other keys.

Account routes under `/api/auth`, including sign-in, password changes, and two-factor authentication, accept only the session cookie. A bearer token on those routes is rejected.

A revoked key, a key for a disabled account, and a key for an account that still must change its password are rejected. When Settings require two-factor authentication, a key works only after that user has enrolled. The secret stays the same. It is rejected until enrollment finishes, and it does not send an authenticator code. Creating a key for a user who has not enrolled is refused while that setting is on.

API key requests are limited to about 120 per minute per key. Sign-in, password reset, the two-factor challenge, and authenticator confirmation are each limited to 10 attempts per minute, and they do not accept a key.

## Browsers

Browser pages on other origins stay blocked. A state-changing request that sends an `Origin` header must come from `APP_URL` or `SHORT_URL_BASE`. Outside production, `localhost` and `127.0.0.1` are allowed too. Use the key from your own server or script, where the request has no browser origin. `GET` and `HEAD` do not apply that origin check.
