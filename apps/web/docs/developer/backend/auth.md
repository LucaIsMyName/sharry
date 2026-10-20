# Auth

Dashboard requests send the `sharry_session` cookie. `requireUser` in `apps/api/src/auth.ts` loads that session and rejects accounts that still need a password change or a two-factor step.

Outside `/api/auth`, a request may instead send `Authorization: Bearer`. `actorFromApiKey` in `apps/api/src/api-keys.ts` hashes the secret with `SESSION_SECRET` and loads the bound user as a full session. The plaintext is not stored. Revoked keys, inactive users, and users who must change their password are rejected.

`requireAdmin` is the same check plus the admin role. Link, campaign, QR, and analytics queries keep using that actor, so a standard user’s key cannot read another user’s rows.

API key requests are limited to about 120 per minute per key. Account routes ignore keys and keep their own stricter limits.
