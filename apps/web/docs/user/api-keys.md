# API keys

Administrators create named keys from API keys. Each key belongs to one user and can do what that user can: their links, campaigns, QR codes, and analytics. A key for an administrator can also call admin routes.

The secret is shown once, prefixed with `sharry_`. Send it on every request:

```http
Authorization: Bearer sharry_...
```

Calls use the same paths as the dashboard, for example `GET /api/links` on this site’s domain. Account routes under `/api/auth`, including sign-in, password changes, and two-factor authentication, accept only the session cookie.

A revoked key, a key for a disabled account, and a key for an account that still must change its password are rejected. Browser pages on other origins stay blocked. Use the key from your own server or script.
