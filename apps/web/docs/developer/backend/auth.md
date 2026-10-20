# Auth

Dashboard requests send the `sharry_session` cookie. `requireUser` in `apps/api/src/auth.ts` loads that session and rejects accounts that still need a password change or a two-factor step.

Outside `/api/auth`, a request may instead send `Authorization: Bearer`. `actorFromApiKey` in `apps/api/src/api-keys.ts` hashes the secret with `SESSION_SECRET` and loads the bound user as a full session. The plaintext is not stored. Revoked keys, inactive users, and users who must change their password are rejected.

`requireAdmin` is the same check plus the admin role. Link, campaign, QR, and analytics queries keep using that actor, so a standard user’s key cannot read another user’s rows.

API key requests are limited to about 120 per minute per key. Account routes ignore keys and keep their own stricter limits. Sign-in, password reset, the two-factor challenge, and authenticator confirmation are each limited to 10 attempts per minute.

A new password-reset email replaces any unused link for that account. The reset token is marked used in the same database transaction as the password change, so a repeated or overlapping request cannot apply a second password. A recovery code is marked used in one update, so it cannot be accepted twice. Expired and used reset tokens are deleted on startup and then hourly.
